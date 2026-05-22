/**
 * ARPP theatric metadata: reading scenes (soundscape / map hooks) and embedded documents (letters, etc.).
 * Authored under `src/data/theatric/{bookId}.json`, exported as `OEBPS/metadata/theatric.json`.
 */

import type { Book } from "@/lib/bookTypes";
import { parseBlockId } from "@/lib/arpp/blockIds";
import { buildCharacterIdMap } from "@/lib/arpp/characterIds";
import { getCharactersForBook } from "@/lib/characters";
import { compareBlockIds, validateBlockSpanInBook } from "@/lib/arpp/blockSpan";

export const THEATRIC_PROFILE_SCHEMA_VERSION = 1 as const;

/**
 * Semantic class of embedded non-dialogue prose (letters, clippings, …).
 * Known values: `letter`, `diary_entry`, `newspaper_excerpt`, `telegram`, `ship_log`, `other`; additional strings allowed.
 */
export type TheatricEmbeddedKind = string;

export interface TheatricSoundscape {
  /** Human-readable intent for tooling / future synth. */
  description?: string;
  /** EPUB-relative path when an ambient bed exists (e.g. `audio/pride-and-prejudice/sc-ch00-001.mp3`). */
  file?: string | null;
}

export interface TheatricSetting {
  locationDescription?: string;
  city?: string;
  state?: string;
  country?: string;
  timeOfDay?: string;
  season?: string;
  /** Calendar year when known; `null` means explicitly unknown. */
  year?: number | null;
}

export interface TheatricEmbeddedText {
  /** Stable id for UI / cross-refs within the theatric file. */
  id?: string;
  startBlockId: string;
  endBlockId: string;
  kind: TheatricEmbeddedKind;
  /** Keys from `metadata/characters.json` (`buildCharacterIdMap` slugs). */
  senderCharacterId?: string | null;
  recipientCharacterId?: string | null;
  summary?: string;
  /** Ereader skin / animation hints (wax seal, parchment, …). */
  presentation?: Record<string, unknown>;
  /**
   * Short implementation reminders (replaces informal `// DO NOW` JSON comments).
   * Ereader ignores; useful for author handoff.
   */
  doNow?: string[];
}

export interface TheatricScene {
  id?: string;
  startBlockId: string;
  endBlockId: string;
  doNow?: string[];
  soundscape?: TheatricSoundscape;
  setting?: TheatricSetting;
  embeddedTexts?: TheatricEmbeddedText[];
}

export interface TheatricProfile {
  schemaVersion: typeof THEATRIC_PROFILE_SCHEMA_VERSION;
  bookId: string;
  scenes: TheatricScene[];
  /** Spans not tied to a single scene (optional). */
  embeddedTexts?: TheatricEmbeddedText[];
}

function parseDoNow(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const xs = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  return xs.length ? xs : undefined;
}

function parseSoundscape(raw: unknown): TheatricSoundscape | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description : undefined;
  let file: string | null | undefined;
  if (o.file === null) file = null;
  else if (typeof o.file === "string" && o.file.trim()) file = o.file.trim();
  if (description === undefined && file === undefined) return undefined;
  return { ...(description !== undefined ? { description } : {}), ...(file !== undefined ? { file } : {}) };
}

function parseSetting(raw: unknown): TheatricSetting | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: TheatricSetting = {};
  const str = (k: keyof TheatricSetting) => {
    const v = o[k as string];
    if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k as string] = v.trim();
  };
  str("locationDescription");
  str("city");
  str("state");
  str("country");
  str("timeOfDay");
  str("season");
  if (typeof o.year === "number" && Number.isFinite(o.year)) out.year = o.year;
  else if (o.year === null) out.year = null;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parsePresentation(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return { ...(raw as Record<string, unknown>) };
}

function parseEmbeddedKind(raw: unknown): TheatricEmbeddedKind {
  if (typeof raw !== "string" || !raw.trim()) return "other";
  return raw.trim();
}

function parseEmbeddedText(raw: unknown, label: string): TheatricEmbeddedText {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: embedded text must be an object`);
  }
  const o = raw as Record<string, unknown>;
  const startBlockId = typeof o.startBlockId === "string" ? o.startBlockId.trim() : "";
  const endBlockId = typeof o.endBlockId === "string" ? o.endBlockId.trim() : "";
  if (!startBlockId || !endBlockId) {
    throw new Error(`${label}: startBlockId and endBlockId are required`);
  }
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : undefined;
  const kind = parseEmbeddedKind(o.kind);
  const summary = typeof o.summary === "string" && o.summary.trim() ? o.summary.trim() : undefined;
  const senderCharacterId =
    o.senderCharacterId === null
      ? null
      : typeof o.senderCharacterId === "string" && o.senderCharacterId.trim()
        ? o.senderCharacterId.trim()
        : undefined;
  const recipientCharacterId =
    o.recipientCharacterId === null
      ? null
      : typeof o.recipientCharacterId === "string" && o.recipientCharacterId.trim()
        ? o.recipientCharacterId.trim()
        : undefined;
  const presentation = parsePresentation(o.presentation);
  const doNow = parseDoNow(o.doNow);
  return {
    ...(id ? { id } : {}),
    startBlockId,
    endBlockId,
    kind,
    ...(senderCharacterId !== undefined ? { senderCharacterId } : {}),
    ...(recipientCharacterId !== undefined ? { recipientCharacterId } : {}),
    ...(summary ? { summary } : {}),
    ...(presentation ? { presentation } : {}),
    ...(doNow ? { doNow } : {}),
  };
}

function parseEmbeddedList(raw: unknown, label: string): TheatricEmbeddedText[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${label}: embeddedTexts must be an array`);
  return raw.map((x, i) => parseEmbeddedText(x, `${label}[${i}]`));
}

function parseScene(raw: unknown, index: number): TheatricScene {
  const label = `scenes[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: scene must be an object`);
  }
  const o = raw as Record<string, unknown>;
  const startBlockId = typeof o.startBlockId === "string" ? o.startBlockId.trim() : "";
  const endBlockId = typeof o.endBlockId === "string" ? o.endBlockId.trim() : "";
  if (!startBlockId || !endBlockId) {
    throw new Error(`${label}: startBlockId and endBlockId are required`);
  }
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : undefined;
  const doNow = parseDoNow(o.doNow);
  const soundscape = parseSoundscape(o.soundscape);
  const setting = parseSetting(o.setting);
  const embeddedTexts = parseEmbeddedList(o.embeddedTexts, `${label}.embeddedTexts`);
  return {
    ...(id ? { id } : {}),
    startBlockId,
    endBlockId,
    ...(doNow ? { doNow } : {}),
    ...(soundscape ? { soundscape } : {}),
    ...(setting ? { setting } : {}),
    ...(embeddedTexts?.length ? { embeddedTexts } : {}),
  };
}

/**
 * Parse and normalize theatric JSON for export or import.
 * @throws on invalid shape (caller handles missing file vs bad file).
 */
export function parseTheatricProfile(raw: unknown): TheatricProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("theatric: root must be an object");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== THEATRIC_PROFILE_SCHEMA_VERSION) {
    throw new Error(`theatric: schemaVersion must be ${THEATRIC_PROFILE_SCHEMA_VERSION}`);
  }
  if (typeof o.bookId !== "string" || !o.bookId.trim()) {
    throw new Error("theatric: bookId is required");
  }
  if (!Array.isArray(o.scenes)) {
    throw new Error("theatric: scenes must be an array");
  }
  const scenes = o.scenes.map((s, i) => parseScene(s, i));
  const embeddedTexts = parseEmbeddedList(o.embeddedTexts, "embeddedTexts");
  return {
    schemaVersion: THEATRIC_PROFILE_SCHEMA_VERSION,
    bookId: o.bookId.trim(),
    scenes,
    ...(embeddedTexts?.length ? { embeddedTexts } : {}),
  };
}

/** Lenient parse for EPUB import: returns null if missing or not schema v1. */
export function tryParseTheatricProfile(raw: unknown): TheatricProfile | null {
  try {
    return parseTheatricProfile(raw);
  } catch {
    return null;
  }
}

function validateCharacterRef(
  bookId: string,
  field: string,
  value: string | null | undefined,
  validIds: Set<string>,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!validIds.has(value)) {
    return `theatric: ${field} "${value}" is not a character id for book ${bookId}`;
  }
  return undefined;
}

function validateEmbedded(
  book: Book,
  e: TheatricEmbeddedText,
  label: string,
  validIds: Set<string>,
): string[] {
  const err: string[] = [];
  if (!parseBlockId(e.startBlockId)) err.push(`theatric: ${label} invalid startBlockId ${e.startBlockId}`);
  if (!parseBlockId(e.endBlockId)) err.push(`theatric: ${label} invalid endBlockId ${e.endBlockId}`);
  if (parseBlockId(e.startBlockId) && parseBlockId(e.endBlockId) && compareBlockIds(e.startBlockId, e.endBlockId) > 0) {
    err.push(`theatric: ${label} startBlockId must be ≤ endBlockId`);
  }
  const spanErr = validateBlockSpanInBook(book, e.startBlockId, e.endBlockId);
  if (spanErr) err.push(`theatric: ${label} ${spanErr}`);
  const a = validateCharacterRef(book.id, `${label}.senderCharacterId`, e.senderCharacterId ?? undefined, validIds);
  const b = validateCharacterRef(book.id, `${label}.recipientCharacterId`, e.recipientCharacterId ?? undefined, validIds);
  if (a) err.push(a);
  if (b) err.push(b);
  return err;
}

/**
 * Ensure block spans exist in `book` and optional character ids match the roster.
 */
export function validateTheatricAgainstBook(book: Book, profile: TheatricProfile): void {
  const err: string[] = [];
  if (profile.bookId !== book.id) {
    err.push(`theatric.bookId "${profile.bookId}" does not match book.id "${book.id}"`);
  }

  const { roster } = buildCharacterIdMap(getCharactersForBook(book.id));
  const validIds = new Set(roster.map((r) => r.id));

  profile.scenes.forEach((scene, i) => {
    const label = `scenes[${i}]`;
    if (!parseBlockId(scene.startBlockId)) err.push(`theatric: ${label} invalid startBlockId ${scene.startBlockId}`);
    if (!parseBlockId(scene.endBlockId)) err.push(`theatric: ${label} invalid endBlockId ${scene.endBlockId}`);
    if (
      parseBlockId(scene.startBlockId) &&
      parseBlockId(scene.endBlockId) &&
      compareBlockIds(scene.startBlockId, scene.endBlockId) > 0
    ) {
      err.push(`theatric: ${label} startBlockId must be ≤ endBlockId`);
    }
    const spanErr = validateBlockSpanInBook(book, scene.startBlockId, scene.endBlockId);
    if (spanErr) err.push(`theatric: ${label} ${spanErr}`);
    scene.embeddedTexts?.forEach((e, j) => {
      err.push(...validateEmbedded(book, e, `${label}.embeddedTexts[${j}]`, validIds));
    });
  });

  profile.embeddedTexts?.forEach((e, j) => {
    err.push(...validateEmbedded(book, e, `embeddedTexts[${j}]`, validIds));
  });

  if (err.length) throw new Error(err.join("\n"));
}

/** EPUB-relative paths (`audio/...`) referenced by scene `soundscape.file` (non-null strings). */
export function collectTheatricSoundscapeEpubHrefs(profile: TheatricProfile): string[] {
  const out = new Set<string>();
  for (const s of profile.scenes) {
    const f = s.soundscape?.file;
    if (typeof f === "string" && f.trim()) out.add(f.trim());
  }
  return [...out];
}
