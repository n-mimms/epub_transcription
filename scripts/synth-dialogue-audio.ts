#!/usr/bin/env node
/**
 * Synthesize dialogue-chunk MP3s (ElevenLabs default, or AWS Polly) and update speakers sidecar.
 *
 * Usage:
 *   npm run synth-dialogue-audio -- --book=pride-and-prejudice --chapters=0,1
 *   npm run synth-dialogue-audio -- --book=pride-and-prejudice --provider=polly
 *   npm run synth-dialogue-audio -- --book=pride-and-prejudice --dry-run
 *
 * Env: ELEVEN_LABS (default provider), or AWS_* for Polly. See repo-root `.env`.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";
import type { Book, ParagraphCell } from "../src/lib/bookTypes";
import { listDialogueChunkTexts } from "../src/lib/dialogueChunks";
import { normalizeDelivery, type DialogueDelivery } from "../src/lib/dialogueDelivery";
import {
  audioDiskPath,
  audioEpubHref,
  buildAudioChunksForParagraph,
  loadDialogueVoiceMap,
  resolveCharacterVoice,
  speechTextFromChunk,
  defaultTtsProvider,
} from "../src/lib/dialogueAudio";
import {
  parseSpeakerAttribution,
  speakerChunkMapKey,
  type SpeakerAttributionFile,
} from "../src/lib/speakerAttribution";
import { synthesizeElevenLabsMp3 } from "../src/lib/tts/elevenLabs";
import { createPollyClient, synthesizePollyMp3 } from "../src/lib/tts/polly";
import type { TtsProviderId } from "../src/lib/tts/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);
const booksDir = path.join(root, "src", "data", "books");
const speakersDir = path.join(root, "src", "data", "speakers");
const voicesDir = path.join(root, "src", "data", "voices");
const dataRoot = path.join(root, "src", "data");

function npmConfigKey(name: string): string | undefined {
  const v = process.env[`npm_config_${name.replace(/-/g, "_")}`];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.env[`SYNTH_${name.toUpperCase()}`] ?? npmConfigKey(name);
}

function hasFlag(name: string): boolean {
  const envKey = `SYNTH_${name.toUpperCase().replace(/-/g, "_")}`;
  if (process.argv.includes(`--${name}`) || process.env[envKey] === "1") return true;
  if (name === "dry-run" && npmConfigKey("dry_run") === "true") return true;
  if (name === "force" && npmConfigKey("force") === "true") return true;
  return false;
}

function parseChapterFilter(): Set<number> | null {
  const raw = arg("chapters");
  if (!raw?.trim()) return null;
  const set = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Math.trunc(Number(part.trim()));
    if (Number.isFinite(n) && n >= 0) set.add(n);
  }
  return set.size > 0 ? set : null;
}

function resolveProvider(voiceMap: ReturnType<typeof loadDialogueVoiceMap>): TtsProviderId {
  const fromFlag = (arg("provider") ?? process.env.SYNTH_PROVIDER ?? "").trim().toLowerCase();
  if (fromFlag === "polly" || fromFlag === "elevenlabs") return fromFlag;
  return defaultTtsProvider(voiceMap);
}

function cellParts(cell: ParagraphCell): { text: string; dialogueContinuation: boolean } {
  if (typeof cell === "string") return { text: cell, dialogueContinuation: false };
  return { text: cell.text, dialogueContinuation: !!cell.c };
}

function sha256File(filePath: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

interface SynthJob {
  key: string;
  chapterIndex: number;
  paragraphIndex: number;
  chunkIndex: number;
  speaker: string | null;
  speech: string;
  delivery: DialogueDelivery;
  voiceId: string;
  pollyEngine?: string;
  elevenLabsModelId?: string;
  diskPath: string;
  epubHref: string;
}

async function runJob(
  provider: TtsProviderId,
  pollyClient: ReturnType<typeof createPollyClient> | null,
  job: SynthJob,
): Promise<void> {
  if (provider === "elevenlabs") {
    await synthesizeElevenLabsMp3(
      job,
      job.voiceId,
      job.elevenLabsModelId ?? "eleven_v3",
    );
    return;
  }
  if (!pollyClient) throw new Error("Polly client not initialized");
  await synthesizePollyMp3(pollyClient, job, job.voiceId, job.pollyEngine ?? "neural");
}

async function main(): Promise<void> {
  const bookId = arg("book");
  if (!bookId) {
    console.error(
      "Usage: npm run synth-dialogue-audio -- --book=<id> [--chapters=0,1] [--provider=elevenlabs|polly] [--dry-run] [--force]",
    );
    console.error(
      "Windows (if flags drop): npm run synth-dialogue-audio --book=pride-and-prejudice --chapters=0",
    );
    console.error(
      "  or: $env:SYNTH_BOOK='pride-and-prejudice'; $env:SYNTH_CHAPTERS='0'; npm run synth-dialogue-audio",
    );
    process.exit(1);
  }

  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  const chapterFilter = parseChapterFilter();

  const bookPath = path.join(booksDir, `${bookId}.json`);
  const spPath = path.join(speakersDir, `${bookId}.json`);
  if (!fs.existsSync(bookPath)) throw new Error(`Book not found: ${bookPath}`);
  if (!fs.existsSync(spPath)) throw new Error(`Speakers sidecar not found: ${spPath}`);

  const book = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Book;
  const speakers = parseSpeakerAttribution(JSON.parse(fs.readFileSync(spPath, "utf8")));
  if (!speakers) throw new Error(`Invalid speakers file: ${spPath}`);

  const voiceMap = loadDialogueVoiceMap(voicesDir, bookId);
  const provider = resolveProvider(voiceMap);
  const jobs: SynthJob[] = [];
  let skippedExisting = 0;
  let totalInScope = 0;

  book.chapters.forEach((chapter, chapterIndex) => {
    if (chapterFilter && !chapterFilter.has(chapterIndex)) return;

    chapter.paragraphs.forEach((cell, paragraphIndex) => {
      const { text, dialogueContinuation } = cellParts(cell);
      const chunkTexts = listDialogueChunkTexts(text, dialogueContinuation);
      if (chunkTexts.length === 0) return;

      const key = speakerChunkMapKey(chapterIndex, paragraphIndex);
      const speakerRow = speakers.chunks[key] ?? [];
      const deliveryRow = speakers.deliveryChunks?.[key] ?? [];

      chunkTexts.forEach((chunkText, chunkIndex) => {
        totalInScope++;
        const speaker = speakerRow[chunkIndex] ?? null;
        const delivery = normalizeDelivery(deliveryRow[chunkIndex]);
        const resolved = resolveCharacterVoice(voiceMap, speaker, provider);
        const speech = speechTextFromChunk(chunkText);
        if (!speech) return;

        const diskPath = audioDiskPath(dataRoot, bookId, chapterIndex, paragraphIndex, chunkIndex);
        const epubHref = audioEpubHref(bookId, chapterIndex, paragraphIndex, chunkIndex);

        if (!force && fs.existsSync(diskPath)) {
          skippedExisting++;
          return;
        }

        jobs.push({
          key,
          chapterIndex,
          paragraphIndex,
          chunkIndex,
          speaker,
          speech,
          delivery,
          voiceId:
            provider === "elevenlabs"
              ? resolved.elevenlabsVoiceId!
              : resolved.polly!.pollyVoiceId,
          pollyEngine: resolved.polly?.pollyEngine,
          elevenLabsModelId: resolved.elevenLabsModelId,
          diskPath,
          epubHref,
        });
      });
    });
  });

  console.log(
    `${bookId} [${provider}]: ${totalInScope} chunk(s) in scope; ${jobs.length} to synthesize; ${skippedExisting} skipped`,
  );

  if (dryRun) {
    for (const job of jobs.slice(0, 20)) {
      console.log(
        `  ${job.key}[${job.chunkIndex}] ${job.speaker ?? "(default)"} / ${job.delivery} → ${job.voiceId}: ${JSON.stringify(job.speech)}`,
      );
    }
    if (jobs.length > 20) console.log(`  … and ${jobs.length - 20} more`);
    return;
  }

  if (jobs.length === 0) {
    console.log("Nothing to synthesize.");
    return;
  }

  const pollyClient = provider === "polly" ? createPollyClient() : null;
  let done = 0;
  for (const job of jobs) {
    await runJob(provider, pollyClient, job);
    done++;
    if (done % 10 === 0 || done === jobs.length) {
      console.log(`Synthesized ${done}/${jobs.length}`);
    }
  }

  const audioChunks: Record<string, string[]> = { ...(speakers.audioChunks ?? {}) };
  const deliveryChunks: Record<string, DialogueDelivery[]> = { ...(speakers.deliveryChunks ?? {}) };

  book.chapters.forEach((chapter, chapterIndex) => {
    if (chapterFilter && !chapterFilter.has(chapterIndex)) return;
    chapter.paragraphs.forEach((cell, paragraphIndex) => {
      const { text, dialogueContinuation } = cellParts(cell);
      const n = listDialogueChunkTexts(text, dialogueContinuation).length;
      if (n === 0) return;
      const key = speakerChunkMapKey(chapterIndex, paragraphIndex);
      audioChunks[key] = buildAudioChunksForParagraph(bookId, chapterIndex, paragraphIndex, n);
      if (!deliveryChunks[key]) {
        deliveryChunks[key] = Array(n).fill("normal");
      }
    });
  });

  const out: SpeakerAttributionFile = {
    ...speakers,
    audioChunks,
    deliveryChunks,
    source: {
      ...speakers.source,
      audioSynthAt: new Date().toISOString(),
      audioProvider: provider,
      bookJsonSha256: sha256File(bookPath),
    },
  };

  fs.writeFileSync(spPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Updated ${path.relative(root, spPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
