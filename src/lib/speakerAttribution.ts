/**
 * Sidecar data: which character speaks each dialogue chunk in a paragraph.
 * Keys align with {@link countDialogueChunks} / {@link tokenizeParagraph} (same probe + regex order).
 *
 * `speaker` values must match {@link CharacterDef.name} for that book so colors resolve via `characters.ts`.
 */

import { getCharactersForBook } from "./characters";
import { normalizeDelivery, type DialogueDelivery } from "./dialogueDelivery";

export const SPEAKER_ATTRIBUTION_SCHEMA_VERSION = 1 as const;

function normalizeSpeakerName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ");
}

/** Map encoder / model speaker string to canonical {@link CharacterDef.name}, or null. */
export function canonicalizeSpeaker(bookId: string, raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const needle = normalizeSpeakerName(String(raw));
  const chars = getCharactersForBook(bookId);
  for (const c of chars) {
    if (normalizeSpeakerName(c.name) === needle) return c.name;
  }
  for (const c of chars) {
    for (const a of c.aliases) {
      if (normalizeSpeakerName(a) === needle) return c.name;
    }
  }
  let best: (typeof chars)[0] | null = null;
  let bestLen = 0;
  for (const c of chars) {
    const pool = [c.name, ...c.aliases].map(normalizeSpeakerName);
    for (const p of pool) {
      if (
        p.length >= 8 &&
        needle.length >= 4 &&
        (needle.includes(p) || p.includes(needle)) &&
        p.length > bestLen
      ) {
        best = c;
        bestLen = p.length;
      }
    }
  }
  return best?.name ?? null;
}

export interface SpeakerAttributionSource {
  encoder?: string;
  generatedAt?: string;
  /** ISO-8601 when dialogue MP3s were last synthesized */
  audioSynthAt?: string;
  /** Provider used for last synth run: `elevenlabs` | `polly` */
  audioProvider?: string;
  /** Optional fingerprint of the book JSON used when this file was produced */
  bookJsonSha256?: string;
}

/** One manually reviewed chapter; keys in the sidecar file are decimal chapter indexes (`"0"`, `"1"`, …). */
export interface ChapterManualValidationEntry {
  /** ISO-8601 timestamp when the chapter was marked reviewed (for audit only). */
  validatedAt: string;
}

export interface SpeakerAttributionFile {
  schemaVersion: typeof SPEAKER_ATTRIBUTION_SCHEMA_VERSION;
  bookId: string;
  source?: SpeakerAttributionSource;
  /**
   * Chapters fully reviewed by a human. Automated encoders should not re-run attribution or overwrite
   * `chunks` for these chapter indexes (unless a run explicitly opts out, e.g. `--force-validated`).
   */
  chapterManualValidation?: Record<string, ChapterManualValidationEntry>;
  /**
   * Sparse map: `"chapterIndex:paragraphIndex"` (0-based) → ordered list of canonical speaker names.
   * Index i matches the i-th curly/straight double-quoted speech segment in that paragraph cell.
   * Use `null` when unknown; omit the key entirely when there is nothing to assert for that paragraph.
   */
  chunks: Record<string, (string | null)[]>;
  /**
   * Parallel to `chunks`: EPUB-relative audio paths (`audio/{bookId}/ch00-p002-0.mp3`), same order as dialogue chunks.
   */
  audioChunks?: Record<string, string[]>;
  /**
   * Parallel to `chunks`: delivery / stage direction per dialogue chunk (`whisper`, `shout`, `normal`, …).
   */
  deliveryChunks?: Record<string, DialogueDelivery[]>;
}

export function speakerChunkMapKey(chapter: number, paragraph: number): string {
  return `${chapter}:${paragraph}`;
}

/** Chapter index from a `chapterIndex:paragraphIndex` chunk map key, or null if malformed. */
export function chapterIndexFromChunkMapKey(key: string): number | null {
  const m = /^(\d+):/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** 0-based chapter indexes listed under {@link SpeakerAttributionFile.chapterManualValidation}. */
export function getManuallyValidatedChapterSet(
  file: Pick<SpeakerAttributionFile, "chapterManualValidation"> | null | undefined,
): Set<number> {
  const m = file?.chapterManualValidation;
  if (!m || typeof m !== "object") return new Set();
  const s = new Set<number>();
  for (const k of Object.keys(m)) {
    if (!/^\d+$/.test(k)) continue;
    const n = Number(k);
    if (Number.isInteger(n) && n >= 0) s.add(n);
  }
  return s;
}

export function getDialogueSpeakersForParagraph(
  file: SpeakerAttributionFile | null | undefined,
  chapter: number,
  paragraph: number,
): (string | null)[] | null {
  if (!file?.chunks) return null;
  const row = file.chunks[speakerChunkMapKey(chapter, paragraph)];
  if (!row || row.length === 0) return null;
  return row;
}

function parseChapterManualValidation(raw: unknown): Record<string, ChapterManualValidationEntry> | undefined {
  if (!raw || typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, ChapterManualValidationEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(k)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const at = (v as Record<string, unknown>).validatedAt;
    if (typeof at === "string" && at.trim()) out[k] = { validatedAt: at.trim() };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseSpeakerAttribution(raw: unknown): SpeakerAttributionFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1 || typeof o.bookId !== "string" || typeof o.chunks !== "object" || o.chunks === null) {
    return null;
  }
  const chunks: Record<string, (string | null)[]> = {};
  for (const [k, v] of Object.entries(o.chunks as Record<string, unknown>)) {
    if (!/^\d+:\d+$/.test(k)) continue;
    if (!Array.isArray(v)) continue;
    chunks[k] = v.map((x) => (x === null ? null : typeof x === "string" ? x : null));
  }
  const chapterManualValidation = parseChapterManualValidation(o.chapterManualValidation);
  const audioChunks = parseAudioChunks(o.audioChunks);
  const deliveryChunks = parseDeliveryChunks(o.deliveryChunks);
  return {
    schemaVersion: 1,
    bookId: o.bookId,
    source: o.source as SpeakerAttributionSource | undefined,
    ...(chapterManualValidation ? { chapterManualValidation } : {}),
    chunks,
    ...(audioChunks ? { audioChunks } : {}),
    ...(deliveryChunks ? { deliveryChunks } : {}),
  };
}

function parseDeliveryChunks(raw: unknown): Record<string, DialogueDelivery[]> | undefined {
  if (!raw || typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, DialogueDelivery[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+:\d+$/.test(k)) continue;
    if (!Array.isArray(v)) continue;
    out[k] = v.map((x) => normalizeDelivery(typeof x === "string" ? x : null));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseAudioChunks(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+:\d+$/.test(k)) continue;
    if (!Array.isArray(v)) continue;
    const paths = v.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (paths.length > 0) out[k] = paths;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
