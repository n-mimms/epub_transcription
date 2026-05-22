/**
 * Compare speaker-attribution prompt variants on P&P Chapter II (chapter index 1).
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx scripts/benchmark-speaker-prompts.ts
 *   npx tsx scripts/benchmark-speaker-prompts.ts --heuristics-only
 *   GOOGLE_API_KEY=... npm run benchmark-speaker-compare-models
 *   GOOGLE_API_KEY=... npx tsx scripts/benchmark-speaker-prompts.ts --compare-models
 *   GOOGLE_API_KEY=... npx tsx scripts/benchmark-speaker-prompts.ts --variant=current --models=gemini-2.5-flash,gemini-3.1-flash-lite,gemma-4-26b-a4b-it
 *   GOOGLE_API_KEY=... npx tsx scripts/benchmark-speaker-prompts.ts --variant=current --vote-runs=3
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";
import type { Book } from "../src/lib/bookTypes";
import {
  attributeChapterWithConsensus,
  resolveVoteRuns,
} from "../src/lib/speakerConsensus";
import {
  applyLlmAttributions,
  attributeChapterWithGemini,
  BENCHMARK_COMPARE_MODELS,
  buildChapterPrompt,
  cellsForChapter,
  DEFAULT_GEMINI_MODEL,
  formatCharacterRosterForPrompt,
  labelGeminiModel,
} from "../src/lib/speakerEncodeGemini";
import {
  attributeChapterWithHeuristics,
  mergeHeuristicAndLlm,
  tieBreakHintsFromHeuristics,
} from "../src/lib/speakerHeuristics";
import { printBenchmarkSpeakerPromptsHelp, wantsCliHelp } from "../src/lib/speakerCliHelp";
import {
  PRIDE_AND_PREJUDICE_CHAPTER_II,
  prideAndPrejudiceChapterIiGroundTruth,
  scoreAgainstGroundTruth,
  validateGroundTruthAgainstBook,
} from "../src/lib/speakerBenchmarkGroundTruth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);
const BOOK_ID = PRIDE_AND_PREJUDICE_CHAPTER_II.bookId;
const CHAPTER_INDEX = PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex;

/** Manual labels in `src/data/speakers/pride-and-prejudice.json` (chapter index 1). */
const GROUND_TRUTH = prideAndPrejudiceChapterIiGroundTruth(root);

type Variant = {
  id: string;
  build: (book: Book, cells: ReturnType<typeof cellsForChapter>) => {
    systemPrompt: string;
    userPrompt: string;
    chunkCountsByParagraph: Map<number, string[]>;
  };
};

function scoreResult(chunks: Record<string, (string | null)[]>) {
  return scoreAgainstGroundTruth(chunks, GROUND_TRUTH);
}

function variantCurrent(book: Book, cells: ReturnType<typeof cellsForChapter>) {
  const prev =
    CHAPTER_INDEX > 0
      ? {
          title: book.chapters[CHAPTER_INDEX - 1].title,
          cells: cellsForChapter(book.chapters[CHAPTER_INDEX - 1].paragraphs),
        }
      : undefined;
  return buildChapterPrompt(book.id, book.title, book.author, book.chapters[CHAPTER_INDEX].title, cells, {
    previousChapter: prev,
  });
}

function variantPingPong(book: Book, cells: ReturnType<typeof cellsForChapter>) {
  const base = variantCurrent(book, cells);
  const extra = `
Ping-pong rule (critical): In domestic dialogue with no speech tag, the speaker usually ALTERNATES between the last two named speakers in the scene (e.g. Mrs. Bennet ↔ Mr. Bennet ↔ Elizabeth). Do NOT assign every line to Elizabeth Bennet.
After "said her mother" the next untagged quote is often still Mrs. Bennet OR the other parent replying—not Elizabeth unless tagged or clearly her turn.`;
  return {
    ...base,
    systemPrompt: base.systemPrompt + extra,
  };
}

function variantFewShot(book: Book, cells: ReturnType<typeof cellsForChapter>) {
  const base = variantCurrent(book, cells);
  const example = `
Example (same chapter):
- Para 0 narration ends: "he suddenly addressed her with,—"
- Para 1 quote only: "I hope Mr. Bingley will like it, Lizzy." → Mr. Bennet (NOT Elizabeth; Lizzy is addressee)
- Para 2: "said her mother" → Mrs. Bennet for both chunks
- Para 3: "said Elizabeth" → Elizabeth Bennet for both chunks
- Para 4: no tag → Mrs. Bennet (ping-pong back after Elizabeth spoke)`;
  return {
    ...base,
    systemPrompt: base.systemPrompt + example,
  };
}

function variantTagsLiteral(book: Book, cells: ReturnType<typeof cellsForChapter>) {
  const base = variantCurrent(book, cells);
  return {
    ...base,
    systemPrompt: `You attribute dialogue in Jane Austen. When the paragraph contains "said X" / "replied X", use X for those chunks exactly (map "her mother"→Mrs. Bennet, "her father"→Mr. Bennet, "Elizabeth"→Elizabeth Bennet).
Only use inference when there is NO speech tag in the paragraph; then use prior paragraph context or alternation between the last two speakers.
${formatCharacterRosterForPrompt(BOOK_ID)}
Output canonical "name" only. null if unknown.`,
  };
}

function variantCompact(book: Book, cells: ReturnType<typeof cellsForChapter>) {
  const base = variantCurrent(book, cells);
  return {
    systemPrompt: `Attribute each dialogue chunk to one canonical speaker from the roster. Use speech tags first; untagged quotes alternate between recent speakers; "Lizzy" in quotes is usually not the speaker.
Roster: ${formatCharacterRosterForPrompt(BOOK_ID)}`,
    userPrompt: base.userPrompt,
    chunkCountsByParagraph: base.chunkCountsByParagraph,
  };
}

const VARIANTS: Variant[] = [
  { id: "heuristics-only", build: () => ({ systemPrompt: "", userPrompt: "", chunkCountsByParagraph: new Map() }) },
  { id: "current", build: variantCurrent },
  { id: "ping-pong-rules", build: variantPingPong },
  { id: "few-shot", build: variantFewShot },
  { id: "tags-literal", build: variantTagsLiteral },
  { id: "compact", build: variantCompact },
];

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function parseCsvModels(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSkipModels(): Set<string> {
  const skip = new Set<string>();
  const fromArg = argValue("--skip-models");
  const fromEnv = (process.env.BENCHMARK_SKIP_MODELS || "").trim();
  for (const src of [fromArg, fromEnv]) {
    if (src) for (const m of parseCsvModels(src)) skip.add(m);
  }
  return skip;
}

function applySkipModels(models: string[], skip: Set<string>): string[] {
  if (skip.size === 0) return models;
  return models.filter((m) => !skip.has(m));
}

function parseVoteRuns(): number {
  const fromArg = argValue("--vote-runs");
  const n = fromArg != null && Number.isFinite(Number(fromArg)) ? Math.trunc(Number(fromArg)) : undefined;
  return resolveVoteRuns(n);
}

function parseModels(compareModels: boolean): string[] {
  const skip = parseSkipModels();
  const modelsArg = argValue("--models");
  const benchmarkModelsEnv = (process.env.BENCHMARK_MODELS || "").trim();
  const geminiModelEnv = (process.env.GEMINI_MODEL || "").trim();

  if (modelsArg) {
    return applySkipModels(parseCsvModels(modelsArg), skip);
  }
  if (benchmarkModelsEnv) {
    return applySkipModels(parseCsvModels(benchmarkModelsEnv), skip);
  }
  if (compareModels) {
    return applySkipModels([...BENCHMARK_COMPARE_MODELS], skip);
  }
  if (geminiModelEnv && !geminiModelEnv.includes(",")) {
    return applySkipModels([geminiModelEnv], skip);
  }
  return applySkipModels([DEFAULT_GEMINI_MODEL], skip);
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsCliHelp(argv)) {
    printBenchmarkSpeakerPromptsHelp(root);
    return;
  }

  const heuristicsOnly = process.argv.includes("--heuristics-only");
  const compareModels = process.argv.includes("--compare-models");
  const variantFilter = argValue("--variant")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
  const models = parseModels(compareModels);

  if (!heuristicsOnly && models.length === 0) {
    console.error(
      "No models to run (all skipped?). Use --models=… or BENCHMARK_MODELS, or --skip-models=… with fewer skips.",
    );
    process.exit(1);
  }

  console.log("[benchmark] argv:", process.argv.slice(2).join(" ") || "(none)");
  if (!heuristicsOnly) {
    console.log(
      "[benchmark] models:",
      models.map((m) => `${labelGeminiModel(m)} (${m})`).join(", ") || "(none)",
    );
  }

  const bookPath = path.join(root, "src", "data", "books", `${BOOK_ID}.json`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Book;
  const cells = cellsForChapter(book.chapters[CHAPTER_INDEX].paragraphs);

  const validationErrors = validateGroundTruthAgainstBook(book, CHAPTER_INDEX, GROUND_TRUTH);
  if (validationErrors.length > 0) {
    console.error("Ground truth / book chunk mismatch:");
    for (const e of validationErrors) console.error(" ", e);
    process.exit(1);
  }

  const variantsToRun = compareModels
    ? VARIANTS.filter((v) => v.id === "heuristics-only" || v.id === "current")
    : variantFilter
      ? VARIANTS.filter((v) => variantFilter.includes(v.id))
      : VARIANTS;

  console.log(`Benchmark: ${book.title} chapter index ${CHAPTER_INDEX} (${book.chapters[CHAPTER_INDEX].title})\n`);
  console.log(
    `Ground truth: ${Object.keys(GROUND_TRUTH).length} paragraphs, ${Object.values(GROUND_TRUTH).reduce((n, r) => n + r.length, 0)} chunks (from src/data/speakers/${BOOK_ID}.json)`,
  );
  if (compareModels) {
    console.log("Mode: compare-models — baseline vs alternates, variant \"current\" only");
    for (const m of models) {
      console.log(`  • ${labelGeminiModel(m)} (${m})`);
    }
  } else if (variantFilter) {
    console.log(`Variants: ${variantFilter.join(", ")}`);
  }
  if (!heuristicsOnly && models.length > 1) {
    console.log(`Models: ${models.join(", ")}`);
  }
  console.log("");

  const voteRuns = parseVoteRuns();
  const heuristicResult = attributeChapterWithHeuristics(BOOK_ID, CHAPTER_INDEX, cells);
  const tieBreakHints = tieBreakHintsFromHeuristics(heuristicResult);

  const results: { id: string; score: string; mismatches: string[] }[] = [];

  {
    const hScore = scoreResult(heuristicResult.chunks);
    results.push({
      id: "heuristics-only",
      score: `${hScore.correct}/${hScore.total}`,
      mismatches: hScore.mismatches,
    });
    console.log("--- heuristics-only (no API) ---");
    for (const [k, v] of Object.entries(heuristicResult.chunks).filter(([k]) => k in GROUND_TRUTH)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
    console.log(`Score: ${hScore.correct}/${hScore.total}\n`);
  }

  if (voteRuns > 1) {
    console.log(`[benchmark] vote-runs: ${voteRuns} (consensus path scored when API runs)\n`);
  }

  if (heuristicsOnly || !apiKey) {
    if (heuristicsOnly) {
      printSummary(results, compareModels);
      return;
    }
    console.log("GOOGLE_API_KEY not set — skipping LLM variants. Set key to compare prompts.\n");
    printSummary(results, compareModels);
    return;
  }

  async function scorePaths(
    baseId: string,
    llmChunks: Record<string, (string | null)[]>,
    logProduction: boolean,
  ) {
    const llmScore = scoreResult(llmChunks);
    results.push({
      id: `${baseId} [llm-only]`,
      score: `${llmScore.correct}/${llmScore.total}`,
      mismatches: llmScore.mismatches,
    });
    console.log(`  llm-only: ${llmScore.correct}/${llmScore.total}`);

    const merged = mergeHeuristicAndLlm(
      heuristicResult.chunks,
      llmChunks,
      heuristicResult.sources,
    );
    const prodScore = scoreResult(merged);
    results.push({
      id: `${baseId} [production]`,
      score: `${prodScore.correct}/${prodScore.total}`,
      mismatches: prodScore.mismatches,
    });
    console.log(`  production (tag/addresser merge): ${prodScore.correct}/${prodScore.total}`);

    if (logProduction) {
      for (const key of Object.keys(GROUND_TRUTH)) {
        console.log(`  ${key}: ${JSON.stringify(merged[key] ?? null)}`);
      }
      if (prodScore.mismatches.length) {
        console.log("  Mismatches:", prodScore.mismatches.join("; "));
      }
    }
  }

  for (const variant of variantsToRun) {
    if (variant.id === "heuristics-only") continue;

    for (const model of models) {
      const baseId = models.length > 1 ? `${variant.id}@${model}` : variant.id;
      const label = models.length > 1 ? labelGeminiModel(model) : variant.id;
      console.log(`--- ${baseId} (${label}) ---`);
      const { systemPrompt, userPrompt, chunkCountsByParagraph } = variant.build(book, cells);
      const warnings: string[] = [];

      try {
        const response = await attributeChapterWithGemini(apiKey, model, systemPrompt, userPrompt);
        const { chunks: llmChunks } = applyLlmAttributions(
          BOOK_ID,
          CHAPTER_INDEX,
          chunkCountsByParagraph,
          response.attributions,
          warnings,
        );
        await scorePaths(baseId, llmChunks, true);
        if (warnings.length) console.log("  Warnings:", warnings.join("; "));

        if (voteRuns > 1) {
          const consensus = await attributeChapterWithConsensus(
            apiKey,
            model,
            BOOK_ID,
            CHAPTER_INDEX,
            chunkCountsByParagraph,
            systemPrompt,
            userPrompt,
            { runs: voteRuns, tieBreakHints },
          );
          const mergedConsensus = mergeHeuristicAndLlm(
            heuristicResult.chunks,
            consensus.chunks,
            heuristicResult.sources,
          );
          const voteScore = scoreResult(mergedConsensus);
          results.push({
            id: `${baseId} [vote${voteRuns}+production]`,
            score: `${voteScore.correct}/${voteScore.total}`,
            mismatches: voteScore.mismatches,
          });
          console.log(
            `  consensus vote×${voteRuns} + production: ${voteScore.correct}/${voteScore.total}`,
          );
          if (consensus.warnings.length) {
            console.log("  Consensus warnings:", consensus.warnings.join("; "));
          }
        }
      } catch (err) {
        console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
        results.push({ id: `${baseId} [llm-only]`, score: "error", mismatches: [] });
      }
      console.log("");
      await sleep(1500);
    }
  }

  printSummary(results, compareModels);
}

function scoreSortKey(score: string): number {
  const m = /^(\d+)\/(\d+)$/.exec(score);
  if (!m) return -1;
  const correct = Number(m[1]);
  const total = Number(m[2]);
  return total > 0 ? correct / total : 0;
}

function formatSummaryId(id: string): string {
  const at = id.indexOf("@");
  if (at === -1) return id;
  const model = id.slice(at + 1);
  return `${id.slice(0, at)} — ${labelGeminiModel(model)}`;
}

function printSummary(results: { id: string; score: string; mismatches: string[] }[], compareModels: boolean) {
  console.log("=== SUMMARY (vs manual Ch. II ground truth) ===");
  const sorted = [...results].sort((a, b) => scoreSortKey(b.score) - scoreSortKey(a.score));
  for (const r of sorted) {
    const isBaseline = r.id === `current@${DEFAULT_GEMINI_MODEL}`;
    const marker = compareModels && isBaseline ? "◆ " : "  ";
    console.log(`${marker}${formatSummaryId(r.id).padEnd(42)} ${r.score}`);
  }
  if (compareModels) {
    console.log(`\n◆ = baseline (${DEFAULT_GEMINI_MODEL})`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
