import { describe, expect, it } from "vitest";
import { canonicalizeSpeaker } from "./speakerAttribution";
import {
  applyLlmAttributions,
  buildCharacterRoster,
  buildChapterPrompt,
  buildChunkContextHint,
  buildPreviousChapterExcerpt,
  formatCharacterRosterForPrompt,
  BENCHMARK_COMPARE_MODELS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_31_FLASH_LITE_MODEL,
  GEMMA_FALLBACK_MODEL,
  isQuotaExhaustedGeminiError,
  isRateLimitGeminiError,
  isRetryableGeminiError,
  labelGeminiModel,
} from "./speakerEncodeGemini";

describe("benchmark model presets", () => {
  it("includes baseline, flash lite, and gemma", () => {
    expect(BENCHMARK_COMPARE_MODELS).toContain(DEFAULT_GEMINI_MODEL);
    expect(BENCHMARK_COMPARE_MODELS).toContain(GEMINI_31_FLASH_LITE_MODEL);
    expect(BENCHMARK_COMPARE_MODELS).toContain(GEMMA_FALLBACK_MODEL);
  });

  it("labels known models for compare output", () => {
    expect(labelGeminiModel(GEMINI_31_FLASH_LITE_MODEL)).toContain("Flash Lite");
    expect(labelGeminiModel("unknown-model")).toBe("unknown-model");
  });
});

describe("isQuotaExhaustedGeminiError", () => {
  it("detects billing quota exhaustion", () => {
    const err = new Error(
      '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}',
    );
    expect(isQuotaExhaustedGeminiError(err)).toBe(true);
    expect(isRetryableGeminiError(err)).toBe(false);
  });
});

describe("isRateLimitGeminiError", () => {
  it("detects 429 rate limit errors", () => {
    expect(isRateLimitGeminiError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true);
  });

  it("does not treat 503 as rate limit", () => {
    expect(isRateLimitGeminiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe(false);
  });
});

describe("isRetryableGeminiError", () => {
  it("retries 503 UNAVAILABLE demand errors", () => {
    const err = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    );
    expect(isRetryableGeminiError(err)).toBe(true);
  });

  it("does not retry generic client errors", () => {
    expect(isRetryableGeminiError(new Error("400 INVALID_ARGUMENT"))).toBe(false);
  });
});

describe("buildCharacterRoster", () => {
  it("includes canonical name and distinct aliases", () => {
    const roster = buildCharacterRoster("pride-and-prejudice");
    const elizabeth = roster.find((c) => c.name === "Elizabeth Bennet");
    expect(elizabeth?.aliases).toContain("Lizzy");
    expect(elizabeth?.aliases).not.toContain("Elizabeth Bennet");
  });

  it("serializes to JSON for the prompt", () => {
    const json = formatCharacterRosterForPrompt("pride-and-prejudice");
    const parsed = JSON.parse(json) as { name: string; aliases: string[] }[];
    expect(parsed.some((c) => c.name === "Mr. Bennet")).toBe(true);
  });
});

describe("buildPreviousChapterExcerpt", () => {
  it("returns null for empty chapter", () => {
    expect(buildPreviousChapterExcerpt("Chapter I", [])).toBeNull();
  });

  it("includes the last paragraphs of the prior chapter", () => {
    const cells = [
      ...Array.from({ length: 7 }, (_, i) => ({ text: `Earlier paragraph ${i}.`, c: false })),
      { text: "“Last line of chapter one,” said she.", c: false },
    ];
    const excerpt = buildPreviousChapterExcerpt("Chapter I", cells);
    expect(excerpt).toContain("Previous chapter: Chapter I");
    expect(excerpt).toContain("Last line of chapter one");
    expect(excerpt).not.toContain("Earlier paragraph 0");
  });
});

describe("buildChunkContextHint", () => {
  it("flags orphan quote after Mr. Bennet addressed Elizabeth (P&P ch. II)", () => {
    const cells = [
      {
        text: "Observing his second daughter employed in trimming a hat, he suddenly addressed her with,—",
        c: false,
      },
      { text: "“I hope Mr. Bingley will like it, Lizzy.”", c: false },
    ];
    const hint = buildChunkContextHint(cells, 1);
    expect(hint).toMatch(/addressed her/i);
    expect(hint).toMatch(/Orphan quote/i);
  });

  it("extracts inline speech tag from same paragraph", () => {
    const cells = [
      {
        text: "“We are not in a way to know what Mr. Bingley likes,” said her mother, resentfully, “since we are not to visit.”",
        c: false,
      },
    ];
    const hint = buildChunkContextHint(cells, 0);
    expect(hint).toMatch(/her mother/i);
  });
});

describe("buildChapterPrompt", () => {
  it("embeds roster JSON and optional previous-chapter excerpt", () => {
    const cells = [{ text: "“Hello,” he said.", c: false }];
    const { systemPrompt, userPrompt } = buildChapterPrompt(
      "pride-and-prejudice",
      "Pride and Prejudice",
      "Jane Austen",
      "Chapter II",
      cells,
      {
        previousChapter: {
          title: "Chapter I",
          cells: [{ text: "They argued about Netherfield.", c: false }],
        },
      },
    );
    expect(systemPrompt).toContain('"name": "Elizabeth Bennet"');
    expect(systemPrompt).toContain("Lizzy");
    expect(userPrompt).toContain("Previous chapter: Chapter I");
    expect(userPrompt).toContain("Netherfield");
  });

  it("omits previous-chapter block for the first chapter", () => {
    const { userPrompt } = buildChapterPrompt(
      "pride-and-prejudice",
      "Pride and Prejudice",
      "Jane Austen",
      "Chapter I",
      [{ text: "“My dear Mr. Bennet,” said his lady.", c: false }],
    );
    expect(userPrompt).not.toContain("Previous chapter:");
  });
});

describe("canonicalizeSpeaker", () => {
  it("maps aliases to canonical names", () => {
    expect(canonicalizeSpeaker("pride-and-prejudice", "Lizzy")).toBe("Elizabeth Bennet");
    expect(canonicalizeSpeaker("pride-and-prejudice", "Mrs. Bennet")).toBe("Mrs. Bennet");
    expect(canonicalizeSpeaker("pride-and-prejudice", "unknown person")).toBeNull();
  });
});

describe("applyLlmAttributions", () => {
  it("maps LLM rows to chunk keys with canonical names", () => {
    const chunkMap = new Map<number, string[]>([
      [3, ["“My dear Mr. Bennet,”", "“have you heard?”"]],
    ]);
    const warnings: string[] = [];
    const { chunks, deliveryChunks } = applyLlmAttributions(
      "pride-and-prejudice",
      0,
      chunkMap,
      [{ paragraph_index: 3, speakers: ["Mrs. Bennet", "Mrs. Bennet"] }],
      warnings,
    );
    expect(chunks["0:3"]).toEqual(["Mrs. Bennet", "Mrs. Bennet"]);
    expect(deliveryChunks["0:3"]).toEqual(["normal", "normal"]);
    expect(warnings).toEqual([]);
  });

  it("warns and leaves null when speaker array length mismatches", () => {
    const chunkMap = new Map<number, string[]>([[1, ["“Hi.”", "“Bye.”"]]]);
    const warnings: string[] = [];
    const { chunks } = applyLlmAttributions(
      "pride-and-prejudice",
      1,
      chunkMap,
      [{ paragraph_index: 1, speakers: ["Mr. Bennet"] }],
      warnings,
    );
    expect(chunks["1:1"]).toEqual(["Mr. Bennet", null]);
    expect(warnings.some((w) => w.includes("length 1"))).toBe(true);
  });

  it("canonicalizes model output names", () => {
    const chunkMap = new Map<number, string[]>([[0, ["“Hello.”"]]]);
    const { chunks } = applyLlmAttributions(
      "pride-and-prejudice",
      2,
      chunkMap,
      [{ paragraph_index: 0, speakers: ["Elizabeth"] }],
      [],
    );
    expect(chunks["2:0"]).toEqual(["Elizabeth Bennet"]);
  });
});
