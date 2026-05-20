#!/usr/bin/env node
/**
 * Export book JSON + speakers sidecar → ARPP EPUB.
 *
 * Usage:
 *   npm run export-arpp --book=pride-and-prejudice
 *   npm run export-arpp --all
 *   npm run export-arpp --book=emma --out=exports/arpp/custom.epub
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { exportBookToArppEpub } from "../src/lib/arpp/exportEpub";
import type { Book } from "../src/lib/bookTypes";
import {
  parseSpeakerAttribution,
  type SpeakerAttributionFile,
} from "../src/lib/speakerAttribution";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const booksDir = path.join(root, "src", "data", "books");
const speakersDir = path.join(root, "src", "data", "speakers");
const dataRoot = path.join(root, "src", "data");
const voicesDir = path.join(dataRoot, "voices");
const defaultOutDir = path.join(root, "exports", "arpp");

function npmConfigKey(name: string): string | undefined {
  const v = process.env[`npm_config_${name.replace(/-/g, "_")}`];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (name === "book") return process.env.EXPORT_BOOK ?? npmConfigKey("book");
  if (name === "out") return process.env.EXPORT_OUT ?? npmConfigKey("out");
  return undefined;
}

function hasFlag(name: string): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  if (name === "all" && (process.env.EXPORT_ALL === "1" || npmConfigKey("all") === "true")) {
    return true;
  }
  if (name === "no-speakers-sidecar" && npmConfigKey("no_speakers_sidecar") === "true") {
    return true;
  }
  return false;
}

async function countEmbeddedAudio(epubPath: string): Promise<number> {
  const zip = await JSZip.loadAsync(fs.readFileSync(epubPath));
  return Object.keys(zip.files).filter(
    (p) => p.startsWith("OEBPS/audio/") && p.endsWith(".mp3"),
  ).length;
}

async function exportOne(bookId: string, outPath: string): Promise<{ audioFiles: number }> {
  const bookPath = path.join(booksDir, `${bookId}.json`);
  if (!fs.existsSync(bookPath)) throw new Error(`Book not found: ${bookPath}`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Book;

  let speakers: SpeakerAttributionFile | null = null;
  const spPath = path.join(speakersDir, `${bookId}.json`);
  if (fs.existsSync(spPath)) {
    speakers = parseSpeakerAttribution(JSON.parse(fs.readFileSync(spPath, "utf8")));
  }

  const audioKeys = speakers?.audioChunks ? Object.keys(speakers.audioChunks).length : 0;
  const audioPaths = speakers?.audioChunks
    ? Object.values(speakers.audioChunks).reduce((n, row) => n + row.length, 0)
    : 0;

  console.log(`\n[export-arpp] ${bookId}`);
  console.log(`  book:     ${path.relative(root, bookPath)}`);
  console.log(`  speakers: ${fs.existsSync(spPath) ? path.relative(root, spPath) : "(none)"}`);
  if (audioPaths > 0) {
    console.log(`  audio:    ${audioPaths} chunk path(s) in sidecar (${audioKeys} paragraphs)`);
  } else {
    console.log(`  audio:    none in sidecar (EPUB will have no dialogue MP3s)`);
  }

  const buf = await exportBookToArppEpub(book, speakers, {
    includeSpeakersSidecar: !hasFlag("no-speakers-sidecar"),
    dataRoot,
    voicesDir,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);

  const audioFiles = await countEmbeddedAudio(outPath);
  const relOut = path.relative(root, outPath);
  console.log(`  wrote:    ${relOut} (${(buf.length / 1024).toFixed(1)} KB)`);
  console.log(`  embedded: ${audioFiles} MP3 file(s) in EPUB`);
  if (audioPaths > 0 && audioFiles === 0) {
    throw new Error(
      `${bookId}: sidecar lists ${audioPaths} audio path(s) but EPUB contains 0 MP3s — run synth-dialogue-audio first`,
    );
  }
  if (audioPaths > 0 && audioFiles < audioPaths) {
    console.warn(
      `  warning:  sidecar expects ${audioPaths} MP3(s), EPUB has ${audioFiles} (partial export?)`,
    );
  }
  console.log(`  status:   OK`);
  return { audioFiles };
}

async function main(): Promise<void> {
  const bookId = arg("book");
  const all = hasFlag("all");
  const out = arg("out");

  if (!bookId && !all) {
    console.error("Usage: npm run export-arpp --book=<id> | --all [--out=path.epub]");
    console.error("Windows: npm run export-arpp --book=pride-and-prejudice  (no extra --)");
    console.error("  or: $env:EXPORT_BOOK='pride-and-prejudice'; npm run export-arpp");
    process.exit(1);
  }

  const started = Date.now();
  let ok = 0;
  let failed = 0;

  if (all) {
    const ids = fs
      .readdirSync(booksDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/i, ""));
    for (const id of ids) {
      try {
        await exportOne(id, path.join(defaultOutDir, `${id}.epub`));
        ok++;
      } catch (e) {
        failed++;
        console.error(`  status:   FAILED — ${e instanceof Error ? e.message : e}`);
      }
    }
  } else {
    const outPath = out
      ? path.isAbsolute(out)
        ? out
        : path.join(root, out)
      : path.join(defaultOutDir, `${bookId}.epub`);
    await exportOne(bookId!, outPath);
    ok = 1;
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nexport-arpp: ${failed > 0 ? "FAILED" : "SUCCESS"} — ${ok} book(s) exported${failed ? `, ${failed} failed` : ""} (${sec}s)`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`\nexport-arpp: FAILED — ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
