/**
 * Batch-fill `src/data/speakers/{bookId}.json` using Google Gemini (dialogue-chunk attribution).
 *
 * Prerequisites:
 *   - GOOGLE_API_KEY in the environment (Google AI Studio / Gemini API)
 *
 * Usage:
 *   npm run encode-speakers
 *   npm run encode-speakers -- --book=emma
 *   npm run encode-speakers -- --book=pride-and-prejudice --chapter=1
 *   npm run encode-speakers -- --dry-run --book=emma --chapter=0
 *   npm run encode-speakers -- --skip-chapters=0
 *   npm run encode-speakers -- --force-validated
 *
 * Env (Windows-friendly if flags do not reach the script):
 *   GOOGLE_API_KEY, GEMINI_MODEL (default gemini-2.5-flash), GEMINI_FALLBACK_MODEL (default gemma-4-26b-a4b-it on 429)
 *   ENCODE_BOOK, ENCODE_CHAPTER, ENCODE_DRY_RUN, ENCODE_SKIP_CHAPTERS, ENCODE_FORCE_VALIDATED
 *   Or set these in repo-root `.env` (gitignored).
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";
import type { Book } from "../src/lib/bookTypes";
import type { DialogueDelivery } from "../src/lib/dialogueDelivery";
import type { SpeakerAttributionFile } from "../src/lib/speakerAttribution";
import {
  SPEAKER_ATTRIBUTION_SCHEMA_VERSION,
  chapterIndexFromChunkMapKey,
  getManuallyValidatedChapterSet,
} from "../src/lib/speakerAttribution";
import {
  announceRateLimitSwitch,
  applyLlmAttributions,
  attributeChapterWithGemini,
  buildChapterPrompt,
  cellsForChapter,
  isQuotaExhaustedGeminiError,
  isRateLimitGeminiError,
  resolveGeminiFallbackModel,
  resolveGeminiModel,
} from "../src/lib/speakerEncodeGemini";
import { attributeChapterWithHeuristics } from "../src/lib/speakerHeuristics";

function mergeHeuristicAndLlm(
  heuristic: Record<string, (string | null)[]>,
  llm: Record<string, (string | null)[]>,
): Record<string, (string | null)[]> {
  const out = { ...llm };
  for (const [key, hRow] of Object.entries(heuristic)) {
    if (!(key in out)) {
      out[key] = hRow;
      continue;
    }
    out[key] = out[key].map((llmVal, i) => (hRow[i] != null ? hRow[i] : llmVal));
  }
  return out;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);
const booksDir = path.join(root, "src", "data", "books");
const speakersDir = path.join(root, "src", "data", "speakers");


function sha256File(filePath: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function parseSkipChapters(argv: string[]): Set<number> {
  const skip = new Set<number>();
  const fromEnv = (process.env.ENCODE_SKIP_CHAPTERS ?? "").trim();
  const pushList = (s: string) => {
    for (const part of s.split(",")) {
      const n = Math.trunc(Number(part.trim()));
      if (Number.isFinite(n)) skip.add(n);
    }
  };
  if (fromEnv) pushList(fromEnv);
  for (const a of argv) {
    if (a.startsWith("--skip-chapters=")) pushList(a.slice("--skip-chapters=".length));
  }
  return skip;
}

function parseArgs(argv: string[]): {
  book?: string;
  chapter?: number;
  dryRun: boolean;
  showProgress: boolean;
  skipChapters: Set<number>;
  forceValidated: boolean;
} {
  let book =
    (process.env.ENCODE_BOOK || process.env.npm_config_book || "").trim() || undefined;
  const chEnv = (process.env.ENCODE_CHAPTER ?? "").trim();
  let chapter: number | undefined =
    chEnv !== "" && Number.isFinite(Number(chEnv)) ? Math.trunc(Number(chEnv)) : undefined;
  let dryRun =
    process.env.ENCODE_DRY_RUN === "1" ||
    process.env.ENCODE_DRY_RUN === "true" ||
    process.env.npm_config_dry_run === "true";
  let showProgress = true;
  let forceValidated =
    process.env.ENCODE_FORCE_VALIDATED === "1" || process.env.ENCODE_FORCE_VALIDATED === "true";

  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--no-progress") showProgress = false;
    else if (a === "--force-validated") forceValidated = true;
    else if (a.startsWith("--book=")) book = a.slice("--book=".length).trim() || undefined;
    else if (a.startsWith("--chapter=")) {
      const n = Number(a.slice("--chapter=".length));
      chapter = Number.isFinite(n) ? Math.trunc(n) : undefined;
    }
  }
  return { book, chapter, dryRun, showProgress, skipChapters: parseSkipChapters(argv), forceValidated };
}

function writeProgressLine(bookId: string, chapterIndex1: number, totalChapters: number, note: string) {
  const total = Math.max(1, totalChapters);
  const pct =
    note === "complete"
      ? 100
      : Math.min(99, Math.round(((chapterIndex1 - 1) / total) * 100));
  const barW = 26;
  const filled = Math.round((pct / 100) * barW);
  const bar = "█".repeat(filled) + "░".repeat(barW - filled);
  const line = `[${bookId}] ${bar} ${String(pct).padStart(3)}%  chapter ${chapterIndex1}/${total}  ${note}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line.slice(0, 120).padEnd(120)}`);
  } else {
    console.log(line.trimEnd());
  }
}

function clearProgressLine() {
  if (process.stdout.isTTY) {
    process.stdout.write("\r" + " ".repeat(120) + "\r");
  }
}

export function mergeSpeakerFile(
  bookId: string,
  bookJsonPath: string,
  newChunks: Record<string, (string | null)[]>,
  mergeOpts: { forceValidated: boolean; encoder: string },
  newDeliveryChunks?: Record<string, DialogueDelivery[]>,
): SpeakerAttributionFile {
  const outPath = path.join(speakersDir, `${bookId}.json`);
  let prev: Partial<SpeakerAttributionFile> = {};
  if (fs.existsSync(outPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(outPath, "utf8")) as SpeakerAttributionFile;
    } catch {
      prev = {};
    }
  }
  const validated = mergeOpts.forceValidated ? new Set<number>() : getManuallyValidatedChapterSet(prev);
  const filteredNew: Record<string, (string | null)[]> = {};
  const filteredDelivery: Record<string, DialogueDelivery[]> = {};
  for (const [k, v] of Object.entries(newChunks)) {
    const ci = chapterIndexFromChunkMapKey(k);
    if (ci != null && validated.has(ci)) continue;
    filteredNew[k] = v;
    if (newDeliveryChunks?.[k]) filteredDelivery[k] = newDeliveryChunks[k];
  }
  const mergedChunks = { ...(prev.chunks || {}), ...filteredNew };
  const mergedDelivery = { ...(prev.deliveryChunks || {}), ...filteredDelivery };
  const out: SpeakerAttributionFile = {
    schemaVersion: 1 as typeof SPEAKER_ATTRIBUTION_SCHEMA_VERSION,
    bookId,
    source: {
      encoder: mergeOpts.encoder,
      generatedAt: new Date().toISOString(),
      bookJsonSha256: sha256File(bookJsonPath),
    },
    chunks: mergedChunks,
    ...(Object.keys(mergedDelivery).length > 0 ? { deliveryChunks: mergedDelivery } : {}),
    ...(prev.audioChunks ? { audioChunks: prev.audioChunks } : {}),
  };
  if (prev.chapterManualValidation && Object.keys(prev.chapterManualValidation).length > 0) {
    out.chapterManualValidation = { ...prev.chapterManualValidation };
  }
  return out;
}

async function processChapter(
  book: Book,
  bookId: string,
  chapterIndex: number,
  opts: {
    dryRun: boolean;
    apiKey: string;
    model: string;
    fallbackModel: string;
    onModelSwitch?: (nextModel: string) => void;
  },
): Promise<{
  chunks: Record<string, (string | null)[]>;
  deliveryChunks: Record<string, DialogueDelivery[]>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const chunks: Record<string, (string | null)[]> = {};
  const deliveryChunks: Record<string, DialogueDelivery[]> = {};
  const ch = book.chapters[chapterIndex];
  if (!ch) {
    warnings.push(`Chapter index ${chapterIndex} missing in ${bookId}`);
    return { chunks, deliveryChunks, warnings };
  }

  const cells = cellsForChapter(ch.paragraphs);
  const prev =
    chapterIndex > 0 && book.chapters[chapterIndex - 1]
      ? {
          title: book.chapters[chapterIndex - 1].title,
          cells: cellsForChapter(book.chapters[chapterIndex - 1].paragraphs),
        }
      : undefined;
  const { systemPrompt, userPrompt, chunkCountsByParagraph } = buildChapterPrompt(
    bookId,
    book.title,
    book.author,
    ch.title,
    cells,
    { previousChapter: prev },
  );

  let dialogueParagraphs = 0;
  let totalChunks = 0;
  for (const texts of chunkCountsByParagraph.values()) {
    dialogueParagraphs++;
    totalChunks += texts.length;
  }

  if (opts.dryRun) {
    console.log(
      `[dry-run] ${bookId} ch=${chapterIndex} (${ch.title}) paragraphs=${cells.length} withDialogue=${dialogueParagraphs} chunks=${totalChunks} promptChars≈${systemPrompt.length + userPrompt.length}`,
    );
    return { chunks, deliveryChunks, warnings };
  }

  if (totalChunks === 0) {
    return { chunks, deliveryChunks, warnings };
  }

  const heuristicChunks = attributeChapterWithHeuristics(bookId, chapterIndex, cells);
  const heuristicsOnly =
    process.env.ENCODE_HEURISTICS_ONLY === "1" || process.env.ENCODE_HEURISTICS_ONLY === "true";

  if (heuristicsOnly) {
    Object.assign(chunks, heuristicChunks);
    return { chunks, deliveryChunks, warnings };
  }

  const t0 = Date.now();
  let llmModel = opts.model;
  let response;
  try {
    response = await attributeChapterWithGemini(opts.apiKey, llmModel, systemPrompt, userPrompt);
  } catch (err) {
    const fallback = opts.fallbackModel;
    const tryFallback =
      fallback &&
      llmModel !== fallback &&
      (isQuotaExhaustedGeminiError(err) || isRateLimitGeminiError(err));
    if (tryFallback) {
      announceRateLimitSwitch(llmModel, fallback);
      llmModel = fallback;
      opts.onModelSwitch?.(fallback);
      response = await attributeChapterWithGemini(opts.apiKey, llmModel, systemPrompt, userPrompt);
    } else {
      throw err;
    }
  }
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${bookId}] ch ${chapterIndex} attributed ${totalChunks} chunks in ${sec}s (${llmModel})`);

  const mapped = applyLlmAttributions(bookId, chapterIndex, chunkCountsByParagraph, response.attributions, warnings);
  const mergedSpeakers = mergeHeuristicAndLlm(heuristicChunks, mapped.chunks);
  Object.assign(chunks, mergedSpeakers);
  Object.assign(deliveryChunks, mapped.deliveryChunks);

  return { chunks, deliveryChunks, warnings };
}

async function processBook(
  bookPath: string,
  opts: {
    onlyChapter?: number;
    dryRun: boolean;
    showProgress: boolean;
    skipChapters: Set<number>;
    apiKey: string;
    model: string;
    fallbackModel: string;
    onModelSwitch?: (nextModel: string) => void;
    forceValidated: boolean;
    onChapterDone?: (
      bookId: string,
      bookPath: string,
      chapterChunks: Record<string, (string | null)[]>,
      chapterDeliveries: Record<string, DialogueDelivery[]>,
    ) => void;
  },
): Promise<{
  bookId: string;
  chunks: Record<string, (string | null)[]>;
  deliveryChunks: Record<string, DialogueDelivery[]>;
  warnings: string[];
}> {
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Book;
  const bookId = book.id || path.basename(bookPath, ".json");
  const warnings: string[] = [];
  const chunks: Record<string, (string | null)[]> = {};
  const deliveryChunks: Record<string, DialogueDelivery[]> = {};

  let chapterIndices =
    opts.onlyChapter != null && Number.isFinite(opts.onlyChapter)
      ? [opts.onlyChapter]
      : book.chapters.map((_, i) => i);

  if (opts.skipChapters.size > 0) {
    const before = chapterIndices.length;
    chapterIndices = chapterIndices.filter((i) => !opts.skipChapters.has(i));
    if (opts.onlyChapter != null && before === 1 && chapterIndices.length === 0) {
      warnings.push(
        `Skipping chapter ${opts.onlyChapter} (${bookId}): in chapterManualValidation, --skip-chapters, or both.`,
      );
    }
  }

  if (chapterIndices.length === 0) {
    warnings.push(`No chapters to process for ${bookId}.`);
    return { bookId, chunks, deliveryChunks, warnings };
  }

  const totalCh = chapterIndices.length;
  let activeModel = opts.model;

  if (opts.showProgress && !opts.dryRun) {
    console.log(`\n${bookId}: processing ${totalCh} chapter(s) via ${activeModel}.\n`);
  }

  for (let j = 0; j < chapterIndices.length; j++) {
    const ci = chapterIndices[j];
    if (opts.showProgress && !opts.dryRun) {
      writeProgressLine(bookId, j + 1, totalCh, "Gemini…");
    }

    const { chunks: chChunks, deliveryChunks: chDeliveries, warnings: chWarn } = await processChapter(
      book,
      bookId,
      ci,
      {
      dryRun: opts.dryRun,
      apiKey: opts.apiKey,
      model: activeModel,
      fallbackModel: opts.fallbackModel,
      onModelSwitch: (next) => {
        activeModel = next;
        opts.onModelSwitch?.(next);
      },
      },
    );
    warnings.push(...chWarn);
    Object.assign(chunks, chChunks);
    Object.assign(deliveryChunks, chDeliveries);

    if (!opts.dryRun && opts.onChapterDone && Object.keys(chChunks).length > 0) {
      opts.onChapterDone(bookId, bookPath, chChunks, chDeliveries);
    }

    if (opts.showProgress && !opts.dryRun) {
      writeProgressLine(bookId, j + 1, totalCh, "saved");
    }
  }

  if (opts.showProgress && !opts.dryRun) {
    writeProgressLine(bookId, totalCh, totalCh, "complete");
    clearProgressLine();
    console.log(`[${bookId}] done (${totalCh} chapter run(s)).\n`);
  }

  return { bookId, chunks, deliveryChunks, warnings };
}

async function main() {
  const { book, chapter, dryRun, showProgress, skipChapters, forceValidated } = parseArgs(
    process.argv.slice(2),
  );
  const model = resolveGeminiModel();
  const fallbackModel = resolveGeminiFallbackModel();
  const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
  let encoderLabel = `google-${model}`;

  if (!dryRun && !apiKey) {
    console.error(
      "GOOGLE_API_KEY is not set. Get a key from https://aistudio.google.com/apikey\n" +
        "  PowerShell: $env:GOOGLE_API_KEY = \"your-key\"\n" +
        "See docs/encode-speakers.md",
    );
    process.exit(1);
  }

  console.log(
    "[encode-speakers] argv:",
    process.argv.slice(2).join(" ") || "(none)",
    "| book:",
    book ?? "(all)",
    "chapter:",
    chapter != null && Number.isFinite(chapter) ? String(chapter) : "(all)",
    "model:",
    model,
    "skip-chapters:",
    skipChapters.size ? [...skipChapters].sort((a, b) => a - b).join(",") : "(none)",
    "force-validated:",
    forceValidated ? "yes" : "no",
  );

  const names = fs.readdirSync(booksDir).filter((f) => f.endsWith(".json"));
  const targets = book ? names.filter((n) => path.basename(n, ".json") === book) : names;
  if (targets.length === 0) {
    console.error(`No book JSON matched --book=${book}`);
    process.exit(1);
  }

  if (!fs.existsSync(speakersDir)) fs.mkdirSync(speakersDir, { recursive: true });

  for (const name of targets) {
    const bookPath = path.join(booksDir, name);
    let bookId = path.basename(name, ".json");
    try {
      const b = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Book;
      if (b.id) bookId = b.id;
    } catch {
      /* keep basename */
    }

    const sidecarPath = path.join(speakersDir, `${bookId}.json`);
    const skipFromFile = new Set<number>();
    if (!forceValidated && fs.existsSync(sidecarPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(sidecarPath, "utf8")) as Partial<SpeakerAttributionFile>;
        for (const n of getManuallyValidatedChapterSet(raw)) skipFromFile.add(n);
      } catch {
        /* ignore */
      }
    }
    const resolvedSkip = new Set([...skipChapters, ...skipFromFile]);
    if (!forceValidated && skipFromFile.size > 0) {
      console.log(
        `[${bookId}] Skipping ${skipFromFile.size} chapter(s) in chapterManualValidation: ${[...skipFromFile].sort((a, b) => a - b).join(",")}`,
      );
    }

    const { bookId: id, chunks, deliveryChunks, warnings } = await processBook(bookPath, {
      onlyChapter: chapter,
      dryRun,
      showProgress,
      skipChapters: resolvedSkip,
      apiKey,
      model,
      fallbackModel,
      onModelSwitch: (next) => {
        encoderLabel = `google-${next}`;
        console.log(`[encode-speakers] active model is now ${next}`);
      },
      forceValidated,
      onChapterDone: dryRun
        ? undefined
        : (bid, bPath, chapterChunks, chapterDeliveries) => {
            const merged = mergeSpeakerFile(bid, bPath, chapterChunks, {
              forceValidated,
              encoder: encoderLabel,
            }, chapterDeliveries);
            const outPath = path.join(speakersDir, `${bid}.json`);
            fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
          },
    });

    for (const w of warnings) console.warn(w);

    if (dryRun) continue;

    if (Object.keys(chunks).length > 0) {
      const merged = mergeSpeakerFile(id, bookPath, chunks, {
        forceValidated,
        encoder: encoderLabel,
      }, deliveryChunks);
      const outPath = path.join(speakersDir, `${id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
      console.log("wrote", path.relative(root, outPath), "keys", Object.keys(merged.chunks).length);
    }
  }

  if (!dryRun) {
    console.log("\nRun: npm run validate-speakers");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
