/**
 * Manual speaker annotations for benchmarks — read from `src/data/speakers/{bookId}.json`.
 * Update the sidecar by hand, then re-run `npm run benchmark-speaker-prompts` / tests.
 */

import fs from "fs";
import path from "path";
import type { Book } from "./bookTypes";
import { listDialogueChunkTexts } from "./dialogueChunks";

export const PRIDE_AND_PREJUDICE_CHAPTER_II = {
  bookId: "pride-and-prejudice",
  chapterIndex: 1,
} as const;

/** Load `chunks` keys `chapterIndex:paragraphIndex` from a speaker sidecar. */
export function loadManualGroundTruth(
  bookId: string,
  chapterIndex: number,
  rootDir = process.cwd(),
): Record<string, (string | null)[]> {
  const spPath = path.join(rootDir, "src/data/speakers", `${bookId}.json`);
  const raw = JSON.parse(fs.readFileSync(spPath, "utf8")) as {
    chunks?: Record<string, unknown>;
  };
  const prefix = `${chapterIndex}:`;
  const out: Record<string, (string | null)[]> = {};
  const chunks = raw.chunks ?? {};
  for (const [k, v] of Object.entries(chunks)) {
    if (!k.startsWith(prefix)) continue;
    if (!Array.isArray(v)) continue;
    out[k] = v.map((x) => (x === null ? null : typeof x === "string" ? x : null));
  }
  return out;
}

export function prideAndPrejudiceChapterIiGroundTruth(
  rootDir = process.cwd(),
): Record<string, (string | null)[]> {
  return loadManualGroundTruth(
    PRIDE_AND_PREJUDICE_CHAPTER_II.bookId,
    PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex,
    rootDir,
  );
}

export function scoreAgainstGroundTruth(
  chunks: Record<string, (string | null)[]>,
  groundTruth: Record<string, (string | null)[]>,
): { correct: number; total: number; mismatches: string[] } {
  let correct = 0;
  let total = 0;
  const mismatches: string[] = [];
  for (const [key, expected] of Object.entries(groundTruth)) {
    const got = chunks[key];
    if (!got) {
      mismatches.push(`${key}: missing`);
      total += expected.length;
      continue;
    }
    for (let i = 0; i < expected.length; i++) {
      total++;
      if (got[i] === expected[i]) correct++;
      else mismatches.push(`${key}[${i}]: got ${JSON.stringify(got[i])} want ${JSON.stringify(expected[i])}`);
    }
  }
  return { correct, total, mismatches };
}

/** Ensure manual labels align with dialogue chunk counts in the book JSON. */
export function validateGroundTruthAgainstBook(
  book: Book,
  chapterIndex: number,
  groundTruth: Record<string, (string | null)[]>,
): string[] {
  const errors: string[] = [];
  const ch = book.chapters[chapterIndex];
  if (!ch) {
    errors.push(`chapter ${chapterIndex} missing`);
    return errors;
  }
  for (const [key, row] of Object.entries(groundTruth)) {
    const m = /^(\d+):(\d+)$/.exec(key);
    if (!m) continue;
    const pi = Number(m[2]);
    const cell = ch.paragraphs[pi];
    if (cell == null) {
      errors.push(`${key}: paragraph missing in book`);
      continue;
    }
    const text = typeof cell === "string" ? cell : cell.text;
    const c = typeof cell === "string" ? false : !!cell.c;
    const expected = listDialogueChunkTexts(text, c);
    if (row.length !== expected.length) {
      errors.push(`${key}: ${row.length} speakers !== ${expected.length} dialogue chunks`);
    }
  }
  return errors;
}
