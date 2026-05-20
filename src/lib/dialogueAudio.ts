/**
 * Dialogue audio paths — aligned with dialogue chunk indexes.
 */

import path from "path";
import { blockId } from "@/lib/arpp/blockIds";
import { speakerChunkMapKey } from "@/lib/speakerAttribution";

export {
  loadDialogueVoiceMap,
  resolveCharacterVoice,
  characterVoicesForExport,
  voiceMapAudioMeta,
  defaultTtsProvider,
  type DialogueVoiceMap,
  type PollyVoiceRef,
} from "@/lib/dialogueVoices";

const QUOTE_TRIM = /^[“"]|[”"]$/g;

export function audioBasename(
  chapterIndex: number,
  paragraphIndex: number,
  chunkIndex: number,
): string {
  return `ch${String(chapterIndex).padStart(2, "0")}-p${String(paragraphIndex).padStart(3, "0")}-${chunkIndex}.mp3`;
}

/** EPUB-relative path under OEBPS (no leading slash). */
export function audioEpubHref(
  bookId: string,
  chapterIndex: number,
  paragraphIndex: number,
  chunkIndex: number,
): string {
  return `audio/${bookId}/${audioBasename(chapterIndex, paragraphIndex, chunkIndex)}`;
}

export function audioDiskPath(
  dataRoot: string,
  bookId: string,
  chapterIndex: number,
  paragraphIndex: number,
  chunkIndex: number,
): string {
  return path.join(dataRoot, "audio", bookId, audioBasename(chapterIndex, paragraphIndex, chunkIndex));
}

export function epubHrefToDiskPath(dataRoot: string, epubHref: string): string {
  const rel = epubHref.replace(/^audio\//, "");
  return path.join(dataRoot, "audio", rel);
}

/** Strip curly/straight quotes for TTS input. */
export function speechTextFromChunk(chunkText: string): string {
  return chunkText.replace(QUOTE_TRIM, "").trim();
}

/** @deprecated Use speechTextFromChunk */
export const pollyTextFromChunk = speechTextFromChunk;

export function chunkMapKeyToBlockId(key: string): string | null {
  const m = /^(\d+):(\d+)$/.exec(key);
  if (!m) return null;
  return blockId(Number(m[1]), Number(m[2]));
}

export function buildAudioChunksForParagraph(
  bookId: string,
  chapterIndex: number,
  paragraphIndex: number,
  chunkCount: number,
): string[] {
  const hrefs: string[] = [];
  for (let k = 0; k < chunkCount; k++) {
    hrefs.push(audioEpubHref(bookId, chapterIndex, paragraphIndex, k));
  }
  return hrefs;
}

export function speakerKeyFromBlockId(blockIdStr: string): string | null {
  const m = /^ch(\d+)-p(\d+)$/.exec(blockIdStr);
  if (!m) return null;
  return speakerChunkMapKey(Number(m[1]), Number(m[2]));
}
