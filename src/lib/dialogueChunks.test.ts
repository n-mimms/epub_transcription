import { describe, expect, it } from "vitest";
import { countDialogueChunks, listDialogueChunkTexts, paragraphProbe } from "./dialogueChunks";

describe("dialogueChunks", () => {
  it("lists multiple quoted spans in order", () => {
    const text =
      "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”";
    const chunks = listDialogueChunkTexts(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("“My dear Mr. Bennet,”");
    expect(chunks[1]).toBe("“have you heard that Netherfield Park is let at last?”");
    expect(countDialogueChunks(text)).toBe(2);
  });

  it("prepends synthetic open quote for continuation cells", () => {
    const tail = "have you heard that Netherfield Park is let at last?”";
    expect(paragraphProbe(tail, true).startsWith("\u201c")).toBe(true);
    const chunks = listDialogueChunkTexts(tail, true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Netherfield");
  });

  it("returns empty for narration-only paragraphs", () => {
    expect(listDialogueChunkTexts("Mr. Bennet replied that he had not.")).toEqual([]);
  });
});
