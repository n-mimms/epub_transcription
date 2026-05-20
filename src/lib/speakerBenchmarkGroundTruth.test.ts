import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  PRIDE_AND_PREJUDICE_CHAPTER_II,
  prideAndPrejudiceChapterIiGroundTruth,
  scoreAgainstGroundTruth,
  validateGroundTruthAgainstBook,
} from "./speakerBenchmarkGroundTruth";
import { attributeChapterWithHeuristics } from "./speakerHeuristics";
import { cellsForChapter } from "./speakerEncodeGemini";

describe("P&P Chapter II manual ground truth (sidecar)", () => {
  const root = process.cwd();
  const groundTruth = prideAndPrejudiceChapterIiGroundTruth(root);

  it("loads all manually annotated keys for chapter index 1", () => {
    const keys = Object.keys(groundTruth).sort();
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(keys).toContain("1:1");
    expect(keys).toContain("1:25");
    expect(groundTruth["1:1"]).toEqual(["Mr. Bennet"]);
    expect(groundTruth["1:25"]).toEqual(["Lydia Bennet", "Lydia Bennet"]);
  });

  it("matches dialogue chunk counts in the book JSON", () => {
    const bookPath = path.join(root, "src/data/books/pride-and-prejudice.json");
    const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    const errors = validateGroundTruthAgainstBook(
      book,
      PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex,
      groundTruth,
    );
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("reports heuristics score vs manual annotations (informational)", () => {
    const bookPath = path.join(root, "src/data/books/pride-and-prejudice.json");
    const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    const cells = cellsForChapter(book.chapters[PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex].paragraphs);
    const chunks = attributeChapterWithHeuristics(
      PRIDE_AND_PREJUDICE_CHAPTER_II.bookId,
      PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex,
      cells,
    );
    const { correct, total, mismatches } = scoreAgainstGroundTruth(chunks, groundTruth);
    expect(total).toBeGreaterThan(0);
    // Log-friendly assertion message if score slips
    expect(
      correct / total,
      `heuristics ${correct}/${total}; mismatches: ${mismatches.slice(0, 8).join("; ")}`,
    ).toBeGreaterThan(0.5);
  });
});
