import type { Book } from "@/lib/bookTypes";
import { parseBlockId } from "@/lib/arpp/blockIds";

/** Document order: earlier chapter or earlier paragraph within chapter. */
export function compareBlockIds(a: string, b: string): number {
  const pa = parseBlockId(a);
  const pb = parseBlockId(b);
  if (!pa) throw new Error(`Invalid block id: ${a}`);
  if (!pb) throw new Error(`Invalid block id: ${b}`);
  if (pa.chapterIndex !== pb.chapterIndex) return pa.chapterIndex - pb.chapterIndex;
  return pa.paragraphIndex - pb.paragraphIndex;
}

/**
 * @returns error message fragment, or null when both ends exist inside `book`.
 */
export function validateBlockSpanInBook(book: Book, startBlockId: string, endBlockId: string): string | null {
  const start = parseBlockId(startBlockId);
  const end = parseBlockId(endBlockId);
  if (!start || !end) return "invalid block id(s)";

  const lastChapter = book.chapters.length - 1;
  if (start.chapterIndex < 0 || start.chapterIndex > lastChapter) {
    return `startBlockId ${startBlockId} out of range (book has ${book.chapters.length} chapter(s))`;
  }
  if (end.chapterIndex < 0 || end.chapterIndex > lastChapter) {
    return `endBlockId ${endBlockId} out of range (book has ${book.chapters.length} chapter(s))`;
  }

  const startParas = book.chapters[start.chapterIndex]?.paragraphs.length ?? 0;
  const endParas = book.chapters[end.chapterIndex]?.paragraphs.length ?? 0;

  if (start.paragraphIndex < 0 || start.paragraphIndex >= startParas) {
    return `startBlockId ${startBlockId} paragraph out of range (${startParas} paragraph(s) in chapter ${start.chapterIndex})`;
  }
  if (end.paragraphIndex < 0 || end.paragraphIndex >= endParas) {
    return `endBlockId ${endBlockId} paragraph out of range (${endParas} paragraph(s) in chapter ${end.chapterIndex})`;
  }

  return null;
}
