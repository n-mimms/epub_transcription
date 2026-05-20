/**
 * Dialogue chunk detection — shared by reader, speaker sidecars, and encoders.
 * Must stay aligned with `tokenizeParagraph` / `countDialogueChunks` in readerUtils.
 */

/** Curly or straight double-quoted speech. */
export const DIALOGUE_SEGMENT = /([“"][^”"]*[”"])/g;

export function paragraphProbe(text: string, dialogueContinuation?: boolean): string {
  return dialogueContinuation ? "\u201c" + text : text;
}

/** Ordered quoted spans as the reader regex sees them (includes synthetic opening quote when `c: true`). */
export function listDialogueChunkTexts(text: string, dialogueContinuation?: boolean): string[] {
  const probe = paragraphProbe(text, dialogueContinuation);
  const re = new RegExp(DIALOGUE_SEGMENT.source, DIALOGUE_SEGMENT.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(probe)) !== null) {
    out.push(m[0]);
  }
  return out;
}

export function countDialogueChunks(text: string, dialogueContinuation?: boolean): number {
  return listDialogueChunkTexts(text, dialogueContinuation).length;
}
