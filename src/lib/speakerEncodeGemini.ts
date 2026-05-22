/**
 * Gemini chapter attribution + mapping to reader dialogue-chunk sidecars.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { getCharactersForBook } from "./characters";
import { listDialogueChunkTexts } from "./dialogueChunks";
import { normalizeDelivery, type DialogueDelivery } from "./dialogueDelivery";
import { canonicalizeSpeaker, speakerChunkMapKey } from "./speakerAttribution";

/** Default encoder / benchmark baseline. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Gemini 3.1 Flash Lite — budget / high-volume alternative ([docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)). */
export const GEMINI_31_FLASH_LITE_MODEL = "gemini-3.1-flash-lite";

/** Fallback when primary model hits rate limits (Gemma 4 26B MoE, instruction-tuned). */
export const GEMMA_FALLBACK_MODEL = "gemma-4-26b-a4b-it";

/** Baseline + alternates scored together by `benchmark-speaker-prompts --compare-models`. */
export const BENCHMARK_COMPARE_MODELS = [
  DEFAULT_GEMINI_MODEL,
  GEMINI_31_FLASH_LITE_MODEL,
  GEMMA_FALLBACK_MODEL,
] as const;

const MODEL_LABELS: Record<string, string> = {
  [DEFAULT_GEMINI_MODEL]: "Gemini 2.5 Flash (baseline)",
  [GEMINI_31_FLASH_LITE_MODEL]: "Gemini 3.1 Flash Lite",
  [GEMMA_FALLBACK_MODEL]: "Gemma 4 26B",
};

export function labelGeminiModel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

export function resolveGeminiModel(): string {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
}

export function resolveGeminiFallbackModel(): string {
  return (process.env.GEMINI_FALLBACK_MODEL || GEMMA_FALLBACK_MODEL).trim();
}

export interface ParagraphCell {
  text: string;
  c: boolean;
}

export interface LlmAttributionRow {
  paragraph_index: number;
  speakers: (string | null)[];
  /** Stage direction per chunk: whisper, shout, normal, sarcastic, … */
  deliveries?: (string | null)[];
}

export interface LlmAttributionResponse {
  attributions: LlmAttributionRow[];
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    attributions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          paragraph_index: { type: Type.INTEGER },
          speakers: {
            type: Type.ARRAY,
            items: { type: Type.STRING, nullable: true },
          },
          deliveries: {
            type: Type.ARRAY,
            items: { type: Type.STRING, nullable: true },
          },
        },
        required: ["paragraph_index", "speakers"],
      },
    },
  },
  required: ["attributions"],
};

export function cellsForChapter(paragraphs: (string | { text: string; c?: boolean })[]): ParagraphCell[] {
  return paragraphs.map((cell) =>
    typeof cell === "string" ? { text: cell, c: false } : { text: cell.text, c: !!cell.c },
  );
}

export interface CharacterRosterEntry {
  name: string;
  aliases: string[];
}

/** Canonical names + distinct aliases for prompt / validation hints. */
export function buildCharacterRoster(bookId: string): CharacterRosterEntry[] {
  return getCharactersForBook(bookId).map((c) => {
    const seen = new Set<string>();
    const aliases: string[] = [];
    for (const a of c.aliases) {
      const t = a.trim();
      if (!t || normalizeRosterKey(t) === normalizeRosterKey(c.name)) continue;
      const key = normalizeRosterKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      aliases.push(t);
    }
    return { name: c.name, aliases };
  });
}

function normalizeRosterKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

export function formatCharacterRosterForPrompt(bookId: string): string {
  return JSON.stringify(buildCharacterRoster(bookId), null, 2);
}

const PREVIOUS_CHAPTER_MAX_CHARS = 2400;
const PREVIOUS_CHAPTER_MAX_PARAGRAPHS = 6;

/**
 * Closing excerpt from the prior chapter (same request — no extra API call).
 * Gives the model material for a mental 2–3 sentence recap of who was speaking.
 */
export function buildPreviousChapterExcerpt(
  chapterTitle: string,
  cells: ParagraphCell[],
): string | null {
  if (cells.length === 0) return null;

  const picked: string[] = [];
  let total = 0;
  for (let i = cells.length - 1; i >= 0 && picked.length < PREVIOUS_CHAPTER_MAX_PARAGRAPHS; i--) {
    const t = cells[i].text.trim();
    if (!t) continue;
    if (total + t.length > PREVIOUS_CHAPTER_MAX_CHARS && picked.length > 0) break;
    picked.unshift(t);
    total += t.length;
    if (total >= PREVIOUS_CHAPTER_MAX_CHARS) break;
  }
  if (picked.length === 0) return null;

  const body = picked.map((p, i) => `[${i}] ${p}`).join("\n\n");
  return `Previous chapter: ${chapterTitle}

Closing context (excerpt only — do not attribute chunks here; use it to resolve "he", "she", "his lady", and continuing exchanges):
${body}`;
}

export interface BuildChapterPromptOptions {
  /** When set (chapter index ≥ 1), adds prior-chapter closing excerpt to the user prompt. */
  previousChapter?: { title: string; cells: ParagraphCell[] };
}

const SPEECH_TAG_BEFORE =
  /\b(said|replied|cried|exclaimed|asked|answered|continued|remarked|added|interrupted)\s+([^,."“”]+?)\s*,?\s*[“"]/i;
const SPEECH_TAG_AFTER =
  /[”"]\s*,?\s*(said|replied|cried|exclaimed|asked|answered|continued|remarked|added|interrupted)\s+([^,."“”]+?)(?=[,.]|\s+[“"]|$)/i;
const ADDRESS_ORPHAN_END = /addressed\s+(?:her|him|them)\s+with\s*,?—?\s*$/i;
const WITH_EMDASH_END = /with\s*,?—?\s*$/i;

/** Local attribution hints: speech tags, prior paragraph leading into orphan quotes. */
export function buildChunkContextHint(cells: ParagraphCell[], pi: number): string | null {
  const text = cells[pi].text;
  const hints: string[] = [];

  const before = SPEECH_TAG_BEFORE.exec(text);
  if (before) hints.push(`Speech tag before quote: "${before[1]} ${before[2].trim()}"`);

  const after = SPEECH_TAG_AFTER.exec(text);
  if (after) hints.push(`Speech tag after quote: "${after[1]} ${after[2].trim()}"`);

  const hasInlineTag = /\b(said|replied|cried|exclaimed|asked|answered)\b/i.test(text);

  if (pi > 0 && !hasInlineTag) {
    const prev = cells[pi - 1].text.trim();
    const tail = prev.length > 200 ? prev.slice(-200) : prev;
    if (ADDRESS_ORPHAN_END.test(prev) || WITH_EMDASH_END.test(prev)) {
      hints.push(
        `Orphan quote: prior paragraph ends "...${tail}" — the character who addressed someone (not the addressee) usually speaks here`,
      );
    } else if (listDialogueChunkTexts(text, cells[pi].c).length > 0) {
      hints.push(`Prior paragraph tail: "...${tail}"`);
    }
  }

  if (cells[pi].c && pi > 0) {
    hints.push("This paragraph continues the same quoted speech from the previous paragraph cell");
  }

  return hints.length > 0 ? hints.join("; ") : null;
}

export function buildChapterPrompt(
  bookId: string,
  title: string,
  author: string,
  chapterTitle: string,
  cells: ParagraphCell[],
  opts?: BuildChapterPromptOptions,
): { systemPrompt: string; userPrompt: string; chunkCountsByParagraph: Map<number, string[]> } {
  const chunkCountsByParagraph = new Map<number, string[]>();
  const chunkBlocks: string[] = [];

  for (let pi = 0; pi < cells.length; pi++) {
    const chunks = listDialogueChunkTexts(cells[pi].text, cells[pi].c);
    if (chunks.length === 0) continue;
    chunkCountsByParagraph.set(pi, chunks);
    const contextHint = buildChunkContextHint(cells, pi);
    const lines = chunks.map((t, i) => `    ${i}: ${t}`).join("\n");
    const contextLine = contextHint ? `  context: ${contextHint}\n` : "";
    chunkBlocks.push(
      `[${pi}] (${chunks.length} chunk${chunks.length === 1 ? "" : "s"})\n${contextLine}${lines}`,
    );
  }

  const numberedParagraphs = cells.map((cell, i) => `[${i}] ${cell.text}`).join("\n\n");

  const rosterJson = formatCharacterRosterForPrompt(bookId);

  const systemPrompt = `You are a literary analysis expert attributing dialogue in classic English novels.
For each numbered dialogue chunk below, identify who speaks that exact quoted line.
Use speech tags, the per-chunk "context" hints, and full paragraph text.

Rules:
- Prefer explicit speech tags ("said her mother", "replied Elizabeth") over guesswork.
- A name or nickname inside quotation marks (e.g. "Lizzy", "my dear") is usually the person spoken TO, not the speaker.
- If the prior sentence says he/she "addressed her/him with" and the next paragraph is only a quote, the addresser speaks—not the addressee.
- Untagged quotes in a family argument usually ALTERNATE between the last two speakers (ping-pong), e.g. Mrs. Bennet ↔ Mr. Bennet ↔ Elizabeth—not all Elizabeth.
- Do not default to the protagonist; attribute from tags and context only.
- Map roles/aliases in prose to canonical roster names.

Character roster (JSON). Use ONLY the "name" field in your output (exact spelling). "aliases" are how they may appear in prose:
${rosterJson}

If the speaker truly cannot be determined, use null for that chunk index.
Attribute only the listed chunks—not narration outside quotes.

For each chunk, set delivery in the deliveries array (same length as speakers):
normal (default), whisper, shout, soft, emphatic, or sarcastic — from speech tags and tone (e.g. "she whispered" → whisper).`;

  const previousBlock =
    opts?.previousChapter != null
      ? buildPreviousChapterExcerpt(opts.previousChapter.title, opts.previousChapter.cells)
      : null;

  const userPrompt = `Book: "${title}" by ${author}
Chapter: ${chapterTitle}
${previousBlock ? `\n${previousBlock}\n` : ""}
Full chapter paragraphs (zero-indexed, for context):
${numberedParagraphs}

Dialogue chunks to attribute (paragraph index, then chunk index):
${chunkBlocks.join("\n\n")}

Return one attribution row per paragraph that has chunks. Each speakers and deliveries array MUST have exactly as many entries as that paragraph's chunk count.`;

  return { systemPrompt, userPrompt, chunkCountsByParagraph };
}

export function applyLlmAttributions(
  bookId: string,
  chapterIndex: number,
  chunkCountsByParagraph: Map<number, string[]>,
  rows: LlmAttributionRow[],
  warnings: string[],
): { chunks: Record<string, (string | null)[]>; deliveryChunks: Record<string, DialogueDelivery[]> } {
  const chunks: Record<string, (string | null)[]> = {};
  const deliveryChunks: Record<string, DialogueDelivery[]> = {};

  for (const [pi, expectedChunks] of chunkCountsByParagraph) {
    const key = speakerChunkMapKey(chapterIndex, pi);
    chunks[key] = Array(expectedChunks.length).fill(null);
    deliveryChunks[key] = Array(expectedChunks.length).fill("normal");
  }

  for (const row of rows) {
    const pi = row.paragraph_index;
    if (!Number.isInteger(pi) || pi < 0) {
      warnings.push(`Invalid paragraph_index ${row.paragraph_index} (ch ${chapterIndex})`);
      continue;
    }
    const expected = chunkCountsByParagraph.get(pi);
    if (!expected) {
      warnings.push(`Unexpected attribution for paragraph ${pi} with no dialogue chunks (ch ${chapterIndex})`);
      continue;
    }
    const key = speakerChunkMapKey(chapterIndex, pi);
    const rowOut = Array(expected.length).fill(null) as (string | null)[];
    const deliveryOut = Array(expected.length).fill("normal") as DialogueDelivery[];
    const speakers = row.speakers ?? [];
    const deliveries = row.deliveries ?? [];
    if (speakers.length !== expected.length) {
      warnings.push(
        `${key}: speakers length ${speakers.length} !== chunk count ${expected.length}; filling what fits`,
      );
    }
    if (deliveries.length > 0 && deliveries.length !== expected.length) {
      warnings.push(
        `${key}: deliveries length ${deliveries.length} !== chunk count ${expected.length}; filling what fits`,
      );
    }
    for (let i = 0; i < expected.length; i++) {
      const raw = i < speakers.length ? speakers[i] : null;
      rowOut[i] = canonicalizeSpeaker(bookId, raw);
      const dRaw = i < deliveries.length ? deliveries[i] : null;
      deliveryOut[i] = normalizeDelivery(dRaw);
    }
    chunks[key] = rowOut;
    deliveryChunks[key] = deliveryOut;
  }

  return { chunks, deliveryChunks };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Billing / plan quota used up — retries will not help. */
export function isQuotaExhaustedGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /exceeded your current quota|check your plan and billing|billing details|quota.?exhausted|insufficient.?quota|free.?tier.?limit/i.test(
      msg,
    ) || (/\b429\b/.test(msg) && /quota/i.test(msg) && /exceeded|billing|plan/i.test(msg))
  );
}

/** HTTP 429 / rate limit — may switch models after failure. */
export function isRateLimitGeminiError(err: unknown): boolean {
  if (isQuotaExhaustedGeminiError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b|RESOURCE_EXHAUSTED|rate.?limit|too many requests/i.test(msg)) {
    return true;
  }
  const o = err as { status?: number; code?: number; error?: { code?: number; status?: string } };
  const httpCode = o?.status ?? o?.code ?? o?.error?.code;
  if (httpCode === 429) return true;
  return o?.error?.status === "RESOURCE_EXHAUSTED";
}

/** Loud banner when the encoder switches models after rate limiting. */
export function announceRateLimitSwitch(fromModel: string, toModel: string): void {
  const bar = "=".repeat(72);
  console.error(`\n${bar}`);
  console.error("*** GEMINI API RATE LIMIT (429) — SWITCHING MODEL FOR REMAINDER OF RUN ***");
  console.error(`*** From: ${fromModel}`);
  console.error(`*** To:   ${toModel}`);
  console.error("*** Override fallback via GEMINI_FALLBACK_MODEL.");
  console.error(`${bar}\n`);
}

/** Transient Gemini / gateway errors worth retrying (503 demand spikes, short rate limits). */
export function isRetryableGeminiError(err: unknown): boolean {
  if (isQuotaExhaustedGeminiError(err)) return false;

  const msg = err instanceof Error ? err.message : String(err);
  if (
    /\b(500|502|503|504)\b|UNAVAILABLE|high demand|overloaded|try again later/i.test(msg)
  ) {
    return true;
  }
  // Transient 429 (RPM/TPM throttle) — not billing quota exhaustion.
  if (/\b429\b|RESOURCE_EXHAUSTED|rate.?limit|too many requests/i.test(msg)) {
    return true;
  }
  const o = err as {
    status?: number;
    code?: number;
    error?: { code?: number; status?: string };
  };
  const httpCode = o?.status ?? o?.code ?? o?.error?.code;
  if (httpCode === 429 || httpCode === 500 || httpCode === 502 || httpCode === 503 || httpCode === 504) {
    return true;
  }
  return o?.error?.status === "UNAVAILABLE";
}

/** Exponential backoff with jitter; capped at 60s. */
export function geminiRetryDelayMs(attempt: number, baseMs = 3000): number {
  const exp = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 800);
  return Math.min(exp + jitter, 60_000);
}

function resolveMaxRetries(override?: number): number {
  if (override != null && Number.isFinite(override)) return Math.max(1, Math.trunc(override));
  const env = (process.env.GEMINI_MAX_RETRIES ?? process.env.ENCODE_MAX_RETRIES ?? "").trim();
  if (env && Number.isFinite(Number(env))) return Math.max(1, Math.trunc(Number(env)));
  return 6;
}

export interface AttributeChapterGeminiOptions {
  /** Sampling temperature (0–2). Omitted = model default (deterministic-ish). */
  temperature?: number;
}

export async function attributeChapterWithGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxRetries?: number,
  geminiOpts?: AttributeChapterGeminiOptions,
): Promise<LlmAttributionResponse> {
  const ai = new GoogleGenAI({ apiKey });
  const retries = resolveMaxRetries(maxRetries);
  let lastErr: unknown;
  const temperature = geminiOpts?.temperature;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const config: {
        responseMimeType: string;
        responseJsonSchema: typeof RESPONSE_SCHEMA;
        temperature?: number;
      } = {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
      };
      if (temperature != null && Number.isFinite(temperature)) {
        config.temperature = Math.max(0, Math.min(2, temperature));
      }
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        config,
      });

      const text = response.text;
      if (!text?.trim()) throw new Error("Empty response from Gemini");
      const parsed = JSON.parse(text) as LlmAttributionResponse;
      if (!parsed.attributions || !Array.isArray(parsed.attributions)) {
        throw new Error("Response missing attributions array");
      }
      return parsed;
    } catch (err) {
      lastErr = err;
      if (isQuotaExhaustedGeminiError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[gemini] ${model} quota exhausted — not retrying: ${msg.slice(0, 200)}`,
        );
        throw err;
      }
      if (attempt < retries - 1 && isRetryableGeminiError(err)) {
        const delay = geminiRetryDelayMs(attempt);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[gemini] ${model} attempt ${attempt + 1}/${retries} failed; retry in ${(delay / 1000).toFixed(1)}s: ${msg.slice(0, 160)}`,
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
