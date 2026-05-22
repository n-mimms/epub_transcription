/**
 * Shared --help / -help text for encode-speakers and benchmark-speaker-prompts CLIs.
 */

import fs from "fs";
import path from "path";
import { DEFAULT_VOTE_TEMPERATURE } from "./speakerConsensus";
import {
  BENCHMARK_COMPARE_MODELS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_31_FLASH_LITE_MODEL,
  GEMMA_FALLBACK_MODEL,
  labelGeminiModel,
  resolveGeminiFallbackModel,
  resolveGeminiModel,
} from "./speakerEncodeGemini";
import { PRIDE_AND_PREJUDICE_CHAPTER_II } from "./speakerBenchmarkGroundTruth";

export function wantsCliHelp(argv: string[]): boolean {
  return argv.some((a) => a === "-help" || a === "--help" || a === "-h" || a === "--h");
}

function listBookIds(booksDir: string): string[] {
  if (!fs.existsSync(booksDir)) return [];
  return fs
    .readdirSync(booksDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort();
}

function formatModelTable(): string {
  const rows: { id: string; label: string; role: string }[] = [
    {
      id: DEFAULT_GEMINI_MODEL,
      label: labelGeminiModel(DEFAULT_GEMINI_MODEL),
      role: "Default primary (GEMINI_MODEL)",
    },
    {
      id: GEMINI_31_FLASH_LITE_MODEL,
      label: labelGeminiModel(GEMINI_31_FLASH_LITE_MODEL),
      role: "Budget / high-volume alternate",
    },
    {
      id: GEMMA_FALLBACK_MODEL,
      label: labelGeminiModel(GEMMA_FALLBACK_MODEL),
      role: "429 fallback (GEMINI_FALLBACK_MODEL)",
    },
  ];
  const lines = ["  Model ID                      Label                         Role"];
  lines.push("  " + "-".repeat(72));
  for (const r of rows) {
    lines.push(
      `  ${r.id.padEnd(28)} ${r.label.slice(0, 28).padEnd(28)} ${r.role}`,
    );
  }
  lines.push("");
  lines.push("  You may set GEMINI_MODEL to any Gemini API model ID your key supports.");
  lines.push("  Docs: https://ai.google.dev/gemini-api/docs/models");
  return lines.join("\n");
}

const BENCHMARK_VARIANTS: { id: string; summary: string }[] = [
  { id: "heuristics-only", summary: "Rule-based tags/addresser/ping-pong only (no API)" },
  { id: "current", summary: "Production prompt + previous-chapter excerpt (shipped in encode-speakers)" },
  { id: "ping-pong-rules", summary: "current + extra alternation rules in system prompt" },
  { id: "few-shot", summary: "current + P&P Ch. II worked examples in system prompt" },
  { id: "tags-literal", summary: "Minimal prompt: trust speech tags first" },
  { id: "compact", summary: "Short system prompt, same user prompt as current" },
];

function formatVariantTable(): string {
  const lines = ["  Variant ID          Summary"];
  lines.push("  " + "-".repeat(68));
  for (const v of BENCHMARK_VARIANTS) {
    lines.push(`  ${v.id.padEnd(20)} ${v.summary}`);
  }
  return lines.join("\n");
}

export function printEncodeSpeakersHelp(root: string): void {
  const books = listBookIds(path.join(root, "src", "data", "books"));
  const model = resolveGeminiModel();
  const fallback = resolveGeminiFallbackModel();

  const text = `
encode-speakers — Gemini dialogue attribution → src/data/speakers/{bookId}.json

USAGE
  npm run encode-speakers:help          Recommended (npm may intercept --help)
  node scripts/run-encode-speakers.mjs -help
  npm run encode-speakers -- [options]

  Windows (when argv is dropped after --):
  npm run encode-speakers --chapter=0 --book=pride-and-prejudice
  node scripts/run-encode-speakers.mjs --book=pride-and-prejudice --chapter=0

  Help aliases: -help, --help, -h

PREREQUISITES
  GOOGLE_API_KEY     Required unless --dry-run (https://aistudio.google.com/apikey)
  Repo-root .env     Optional; loaded automatically (gitignored)

WHAT IT DOES (per chapter)
  1. Rule-based heuristics (speech tags, "addressed … with", ping-pong hints)
  2. One Gemini JSON call per chapter (or N calls with majority vote)
  3. Merge: tag/addresser heuristics override LLM; ping-pong does NOT
  4. Writes sidecar incrementally; skips chapterManualValidation unless --force-validated

CLI FLAGS
  --book=ID            Single book under src/data/books/ (default: all books)
  --chapter=N          0-based chapter index only (e.g. 1 = Chapter II)
  --dry-run            No API calls; log paragraph/chunk/prompt stats
  --skip-chapters=0,1  Comma-separated 0-based chapter indexes to skip
  --force-validated    Re-encode chapters listed in chapterManualValidation
  --vote-runs=N        LLM runs per chapter; majority vote per chunk (default 1)
  --no-progress        One log line per chapter instead of progress bar
  -help, --help, -h    Show this message

ENV VARS (Windows-friendly when npm drops flags)
  ENCODE_BOOK              Same as --book=
  ENCODE_CHAPTER           Same as --chapter=
  ENCODE_DRY_RUN=1         Same as --dry-run
  ENCODE_SKIP_CHAPTERS     Same as --skip-chapters= (comma-separated)
  ENCODE_FORCE_VALIDATED=1 Same as --force-validated
  ENCODE_VOTE_RUNS         Same as --vote-runs= (default 1)
  ENCODE_VOTE_TEMPERATURE  Sampling temp when vote-runs > 1 (default ${DEFAULT_VOTE_TEMPERATURE}, range 0–2)
  ENCODE_HEURISTICS_ONLY=1 No Gemini; heuristics only (debug)

GEMINI / MODELS
  GEMINI_MODEL             Primary model (current effective: ${model})
  GEMINI_FALLBACK_MODEL    After 429 retries exhausted (current effective: ${fallback})
  GEMINI_MAX_RETRIES       Transient retry count (default 6; alias ENCODE_MAX_RETRIES)

KNOWN MODEL PRESETS
${formatModelTable()}

AVAILABLE BOOK IDs (src/data/books/)
${books.length ? books.map((b) => `  ${b}`).join("\n") : "  (none found — run npm run extract-books)"}

INDEXING
  Chapter and paragraph indexes are 0-based everywhere.
  Sidecar keys: "chapterIndex:paragraphIndex" (e.g. "1:1" = Ch. II, ¶ 2).
  chapterManualValidation uses decimal chapter keys ("0", "1", …).

OUTPUT
  src/data/speakers/{bookId}.json
    chunks, deliveryChunks (optional), source.encoder (e.g. google-${model}@vote3)

COST
  Default: 1 API call per chapter.
  --vote-runs=N: N calls per chapter (~N× cost).

EXAMPLES
  npm run encode-speakers:help
  node scripts/run-encode-speakers.mjs -help
  npm run encode-speakers -- --dry-run --book=pride-and-prejudice --chapter=1

  $env:GOOGLE_API_KEY = "your-key"
  npm run encode-speakers -- --book=pride-and-prejudice --chapter=1

  $env:GEMINI_MODEL = "${GEMINI_31_FLASH_LITE_MODEL}"
  npm run encode-speakers -- --book=emma

  $env:ENCODE_VOTE_RUNS = "3"
  npm run encode-speakers -- --book=pride-and-prejudice --chapter=1

  node scripts/run-encode-speakers.mjs --book=pride-and-prejudice --vote-runs=3

AFTER ENCODING
  npm run validate-speakers

MORE
  docs/encode-speakers.md
`.trim();

  console.log(text);
}

export function printBenchmarkSpeakerPromptsHelp(root: string): void {
  const compareList = BENCHMARK_COMPARE_MODELS.join(",");
  const model = resolveGeminiModel();

  const text = `
benchmark-speaker-prompts — score attribution prompts vs P&P Chapter II ground truth

USAGE
  npm run benchmark-speaker-prompts:help   Recommended (npm may intercept --help)
  node scripts/run-benchmark-speaker-prompts.mjs -help
  npm run benchmark-speaker-prompts -- [options]

  Help aliases: -help, --help, -h
  (Colloquial name "benchmark-speakers" → this script.)

PREREQUISITES
  GOOGLE_API_KEY     Required unless --heuristics-only
  Ground truth       Manual labels in src/data/speakers/pride-and-prejudice.json keys "1:*"
  Fixture chapter    ${PRIDE_AND_PREJUDICE_CHAPTER_II.bookId} chapter index ${PRIDE_AND_PREJUDICE_CHAPTER_II.chapterIndex} (Chapter II)

CLI FLAGS
  --heuristics-only    Score rule-based path only; no API key needed
  --compare-models     Run variant "current" + heuristics on all preset models (see below)
  --variant=ID         One variant, or comma-separated (e.g. current,few-shot)
  --models=ID,ID       Comma-separated Gemini model IDs (overrides default single model)
  --skip-models=ID     Exclude models from --compare-models or --models list
  --vote-runs=N        After single LLM run, also score consensus vote×N + production merge
  -help, --help, -h    Show this message

ENV VARS
  BENCHMARK_MODELS       Comma-separated model list (same as --models=)
  BENCHMARK_SKIP_MODELS    Comma-separated models to exclude
  BENCHMARK_VOTE_RUNS    Same as --vote-runs= (also reads ENCODE_VOTE_RUNS)
  GEMINI_MODEL           Used when --models not set (current effective: ${model})
  GOOGLE_API_KEY         Required for LLM variants

GEMINI / MODELS
  Default (no --models): ${DEFAULT_GEMINI_MODEL}
  --compare-models preset list:
    ${compareList}

KNOWN MODEL PRESETS
${formatModelTable()}

PROMPT VARIANTS (--variant=)
${formatVariantTable()}

SCORE COLUMNS (each LLM run prints)
  [llm-only]              Raw Gemini output only
  [production]            LLM + merge (tag/addresser heuristics override; matches encode-speakers)
  [voteN+production]      Majority vote across N runs + production merge (when --vote-runs=N>1)

MODES
  Full benchmark (no flags)     All variants × default model; 1.5s pause between API calls
  --compare-models              heuristics-only + current@${compareList}
  --variant=current --vote-runs=3   Single variant + voting column

EXAMPLES
  npm run benchmark-speaker-prompts:help
  node scripts/run-benchmark-speaker-prompts.mjs -help
  npm run benchmark-speaker-prompts -- --heuristics-only

  $env:GOOGLE_API_KEY = "your-key"
  npm run benchmark-speaker-prompts -- --variant=current

  npm run benchmark-speaker-prompts -- --compare-models
  npm run benchmark-speaker-prompts -- --compare-models --skip-models=${DEFAULT_GEMINI_MODEL}

  npm run benchmark-speaker-prompts -- --variant=current,few-shot --models=${GEMINI_31_FLASH_LITE_MODEL}

  npm run benchmark-speaker-prompts -- --variant=current --vote-runs=3

  $env:BENCHMARK_MODELS = "${GEMINI_31_FLASH_LITE_MODEL},${GEMMA_FALLBACK_MODEL}"
  node scripts/run-benchmark-speaker-prompts.mjs --variant=current

WINDOWS NOTE
  If npm drops flags after --, use node scripts/run-benchmark-speaker-prompts.mjs directly
  or set BENCHMARK_MODELS / BENCHMARK_VOTE_RUNS in .env.

MORE
  docs/encode-speakers.md (encoder flags overlap with benchmark)
  src/lib/speakerBenchmarkGroundTruth.ts
`.trim();

  console.log(text);
}
