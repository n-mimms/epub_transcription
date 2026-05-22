/**
 * Majority voting across repeated LLM attribution runs per chapter.
 */

import type { DialogueDelivery } from "./dialogueDelivery";
import {
  applyLlmAttributions,
  attributeChapterWithGemini,
  type LlmAttributionResponse,
} from "./speakerEncodeGemini";

/** Default sampling temperature when ENCODE_VOTE_RUNS > 1. */
export const DEFAULT_VOTE_TEMPERATURE = 0.5;

export function resolveVoteTemperature(override?: number): number {
  if (override != null && Number.isFinite(override)) {
    return Math.max(0, Math.min(2, override));
  }
  const env = (process.env.ENCODE_VOTE_TEMPERATURE ?? "").trim();
  if (env && Number.isFinite(Number(env))) {
    return Math.max(0, Math.min(2, Number(env)));
  }
  return DEFAULT_VOTE_TEMPERATURE;
}

export function resolveVoteRuns(argvValue?: number): number {
  if (argvValue != null && Number.isFinite(argvValue)) {
    return Math.max(1, Math.trunc(argvValue));
  }
  const env = (process.env.ENCODE_VOTE_RUNS ?? process.env.BENCHMARK_VOTE_RUNS ?? "").trim();
  if (env && Number.isFinite(Number(env))) {
    return Math.max(1, Math.trunc(Number(env)));
  }
  return 1;
}

function pickPluralityWinner<T extends string>(
  values: T[],
  tieBreakHint?: string | null,
): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  const tied = [...counts.entries()].filter(([, c]) => c === bestCount).map(([n]) => n);
  if (tied.length === 1) return best;
  if (tieBreakHint && tied.includes(tieBreakHint as T)) return tieBreakHint as T;
  return null;
}

/** Per-chunk plurality over parallel vote arrays (already canonicalized). */
export function pluralityVotePerChunk(
  votes: (string | null)[][],
  tieBreakHints?: (string | null)[],
): (string | null)[] {
  const width = Math.max(0, ...votes.map((r) => r.length), tieBreakHints?.length ?? 0);
  const out: (string | null)[] = [];
  for (let i = 0; i < width; i++) {
    const nonNull = votes.map((r) => r[i]).filter((v): v is string => v != null);
    const hint = tieBreakHints?.[i] ?? null;
    if (nonNull.length === 0) {
      out.push(null);
      continue;
    }
    out.push(pickPluralityWinner(nonNull, hint));
  }
  return out;
}

export function pluralityVoteDeliveriesPerChunk(
  votes: DialogueDelivery[][],
): DialogueDelivery[] {
  const width = Math.max(0, ...votes.map((r) => r.length));
  const out: DialogueDelivery[] = [];
  for (let i = 0; i < width; i++) {
    const vals = votes.map((r) => r[i]).filter(Boolean) as DialogueDelivery[];
    if (vals.length === 0) {
      out.push("normal");
      continue;
    }
    const winner = pickPluralityWinner(vals, null);
    out.push(winner ?? "normal");
  }
  return out;
}

export interface ConsensusChapterResult {
  chunks: Record<string, (string | null)[]>;
  deliveryChunks: Record<string, DialogueDelivery[]>;
  warnings: string[];
}

export async function attributeChapterWithConsensus(
  apiKey: string,
  model: string,
  bookId: string,
  chapterIndex: number,
  chunkCountsByParagraph: Map<number, string[]>,
  systemPrompt: string,
  userPrompt: string,
  opts: {
    runs: number;
    temperature?: number;
    maxRetries?: number;
    /** Tag/addresser heuristic speakers for tie-breaking only. */
    tieBreakHints?: Record<string, (string | null)[]>;
  },
): Promise<ConsensusChapterResult> {
  const runs = Math.max(1, Math.trunc(opts.runs));
  const temperature = resolveVoteTemperature(opts.temperature);
  const warnings: string[] = [];
  const speakerVotesByKey = new Map<string, (string | null)[][]>();
  const deliveryVotesByKey = new Map<string, DialogueDelivery[][]>();

  for (let run = 0; run < runs; run++) {
    const response: LlmAttributionResponse = await attributeChapterWithGemini(
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      opts.maxRetries,
      { temperature },
    );
    const mapped = applyLlmAttributions(
      bookId,
      chapterIndex,
      chunkCountsByParagraph,
      response.attributions,
      warnings,
    );
    for (const [key, row] of Object.entries(mapped.chunks)) {
      if (!speakerVotesByKey.has(key)) speakerVotesByKey.set(key, []);
      speakerVotesByKey.get(key)!.push(row);
    }
    for (const [key, row] of Object.entries(mapped.deliveryChunks)) {
      if (!deliveryVotesByKey.has(key)) deliveryVotesByKey.set(key, []);
      deliveryVotesByKey.get(key)!.push(row);
    }
  }

  const chunks: Record<string, (string | null)[]> = {};
  const deliveryChunks: Record<string, DialogueDelivery[]> = {};

  for (const [key, voteRows] of speakerVotesByKey) {
    const hints = opts.tieBreakHints?.[key];
    chunks[key] = pluralityVotePerChunk(voteRows, hints);
    const dVotes = deliveryVotesByKey.get(key);
    if (dVotes?.length) {
      deliveryChunks[key] = pluralityVoteDeliveriesPerChunk(dVotes);
    }
  }

  return { chunks, deliveryChunks, warnings };
}

/** Encoder label suffix when voting is enabled. */
export function voteEncoderSuffix(runs: number): string {
  return runs > 1 ? `@vote${runs}` : "";
}
