/** Block id for a paragraph: `ch02-p014` (0-based chapter and paragraph indexes). */
export function blockId(chapterIndex: number, paragraphIndex: number): string {
  return `ch${String(chapterIndex).padStart(2, "0")}-p${String(paragraphIndex).padStart(3, "0")}`;
}

export function parseBlockId(id: string): { chapterIndex: number; paragraphIndex: number } | null {
  const m = /^ch(\d+)-p(\d+)$/.exec(id);
  if (!m) return null;
  return { chapterIndex: parseInt(m[1], 10), paragraphIndex: parseInt(m[2], 10) };
}

/** Sidecar key used by encoder: `chapterIndex:paragraphIndex`. */
export function chunkMapKey(chapterIndex: number, paragraphIndex: number): string {
  return `${chapterIndex}:${paragraphIndex}`;
}

export function chunkMapKeyFromBlockId(blockIdStr: string): string | null {
  const p = parseBlockId(blockIdStr);
  return p ? chunkMapKey(p.chapterIndex, p.paragraphIndex) : null;
}
