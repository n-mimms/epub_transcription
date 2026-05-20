/**
 * Rule-based speaker hints: speech tags, orphan "addressed … with", ping-pong for untagged quotes.
 */

import { getCharactersForBook } from "./characters";
import { listDialogueChunkTexts } from "./dialogueChunks";
import type { ParagraphCell } from "./speakerEncodeGemini";
import { canonicalizeSpeaker } from "./speakerAttribution";

const SPEECH_VERB =
  /\b(said|replied|cried|exclaimed|asked|answered|continued|remarked|added|interrupted|resumed|observed)\b/i;

const ROLE_TAG_TO_CANONICAL: Record<string, Record<string, string>> = {
  "pride-and-prejudice": {
    "her mother": "Mrs. Bennet",
    "his wife": "Mrs. Bennet",
    "his lady": "Mrs. Bennet",
    "her father": "Mr. Bennet",
    "his father": "Mr. Bennet",
  },
};

function cleanTagPhrase(tagPhrase: string): string {
  return tagPhrase
    .trim()
    .replace(/[;,.]+\s*$/g, "")
    .replace(/\s+/g, " ");
}

/** Map tag text ("her mother", "Elizabeth", "Mr. Bennet") to canonical name. */
export function canonicalizeFromSpeechTag(bookId: string, tagPhrase: string): string | null {
  const raw = cleanTagPhrase(tagPhrase);
  if (!raw) return null;

  const roleMap = ROLE_TAG_TO_CANONICAL[bookId];
  const role = roleMap?.[raw.toLowerCase()];
  if (role) return role;

  return canonicalizeSpeaker(bookId, raw);
}

/**
 * Capture speaker phrase after speech verbs (handles Mr./Mrs., "her mother", "Elizabeth", etc.).
 * Stops before comma/semicolon that precedes adverbs or the next quote.
 */
const INLINE_SPEECH_TAG = new RegExp(
  `\\b(?:said|replied|cried|exclaimed|asked|answered|continued|remarked|added|interrupted)\\s+` +
    `((?:(?:Mr|Mrs|Miss|Lady|Sir)\\.\\s+)?[A-Za-z][A-Za-z.]*(?:\\s+[A-Za-z][A-Za-z.]*)?|her\\s+\\w+|his\\s+\\w+)`,
  "gi",
);

/** All speech-tag phrases in order of appearance (deduped). */
export function extractSpeechTagsInOrder(text: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  INLINE_SPEECH_TAG.lastIndex = 0;
  while ((m = INLINE_SPEECH_TAG.exec(text)) !== null) {
    const t = cleanTagPhrase(m[1]);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }

  return tags;
}

/** Speaker for each dialogue chunk when tags are unambiguous. */
export function speakersFromSpeechTags(
  bookId: string,
  text: string,
  dialogueContinuation: boolean,
): (string | null)[] | null {
  const chunks = listDialogueChunkTexts(text, dialogueContinuation);
  if (chunks.length === 0) return [];

  const tags = extractSpeechTagsInOrder(text);
  if (tags.length === 0) return null;

  const canon = tags.map((t) => canonicalizeFromSpeechTag(bookId, t)).filter(Boolean) as string[];

  if (canon.length === 1) {
    return chunks.map(() => canon[0]);
  }

  if (canon.length === chunks.length) {
    return canon;
  }

  if (canon.length >= 1 && SPEECH_VERB.test(text)) {
    const speaker = canon[0];
    return chunks.map(() => speaker);
  }

  return null;
}

function resolveAddresserFromPriorParagraph(
  bookId: string,
  prevText: string,
): string | null {
  if (/addressed\s+(?:her|him|them)\s+with\s*,?—?\s*$/i.test(prevText.trim())) {
    if (/\bMr\.?\s*Bennet\b/i.test(prevText) || /\bhe suddenly\b/i.test(prevText)) {
      return canonicalizeSpeaker(bookId, "Mr. Bennet");
    }
    if (/\bMrs\.?\s*Bennet\b/i.test(prevText) || /\bhis lady\b/i.test(prevText)) {
      return canonicalizeSpeaker(bookId, "Mrs. Bennet");
    }
  }
  return null;
}

/** Alternate back to the speaker before the most recent (A↔B ping-pong). */
function pingPongSpeaker(lastTwo: [string | null, string | null]): string | null {
  const [a, b] = lastTwo;
  if (a && b && a !== b) return a;
  if (b) return b;
  if (a) return a;
  return null;
}

export interface HeuristicAttributionContext {
  lastTwo: [string | null, string | null];
}

export function attributeChapterWithHeuristics(
  bookId: string,
  chapterIndex: number,
  cells: ParagraphCell[],
): Record<string, (string | null)[]> {
  const chunks: Record<string, (string | null)[]> = {};
  const ctx: HeuristicAttributionContext = { lastTwo: [null, null] };

  const pushSpeaker = (name: string | null) => {
    if (!name) return;
    ctx.lastTwo = [ctx.lastTwo[1], name];
  };

  for (let pi = 0; pi < cells.length; pi++) {
    const n = listDialogueChunkTexts(cells[pi].text, cells[pi].c).length;
    if (n === 0) continue;

    let row: (string | null)[] | null = speakersFromSpeechTags(bookId, cells[pi].text, cells[pi].c);

    if (!row && pi > 0) {
      const addresser = resolveAddresserFromPriorParagraph(bookId, cells[pi - 1].text);
      if (addresser) row = Array(n).fill(addresser);
    }

    if (!row) {
      const alt = pingPongSpeaker(ctx.lastTwo);
      if (alt) row = Array(n).fill(alt);
    }

    if (!row) row = Array(n).fill(null);

    const key = `${chapterIndex}:${pi}`;
    chunks[key] = row;
    const lastNamed = [...row].reverse().find((s) => s != null) ?? null;
    pushSpeaker(lastNamed);
  }

  return chunks;
}
