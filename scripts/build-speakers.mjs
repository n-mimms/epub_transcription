#!/usr/bin/env node
/**
 * Manage `src/data/speakers/*.json` sidecars (speaker per dialogue chunk).
 *
 * Usage:
 *   node scripts/build-speakers.mjs           — refresh each sidecar (metadata + preserve existing `chunks`)
 *   node scripts/build-speakers.mjs --validate — verify chunk array lengths match the book text
 *
 * Chunk keys are `chapterIndex:paragraphIndex` (0-based). Each array aligns with dialogue
 * segments detected the same way as `countDialogueChunks` in `src/lib/dialogueChunks.ts` (re-exported from readerUtils).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const booksDir = path.join(root, "src", "data", "books");
const speakersDir = path.join(root, "src", "data", "speakers");

/** Mirrors `DIALOGUE_SEGMENT` in readerUtils.ts */
const DIALOGUE_SEGMENT = /([“"][^”"]*[”"])/g;

function countDialogueChunks(text, dialogueContinuation) {
  const probe = dialogueContinuation ? "\u201c" + text : text;
  return (probe.match(new RegExp(DIALOGUE_SEGMENT.source, "g")) || []).length;
}

function paragraphCells(chapter) {
  return chapter.paragraphs.map((cell) =>
    typeof cell === "string" ? { text: cell, c: false } : { text: cell.text, c: !!cell.c },
  );
}

function sha256File(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function writeTemplates() {
  if (!fs.existsSync(speakersDir)) fs.mkdirSync(speakersDir, { recursive: true });
  const now = new Date().toISOString();
  for (const name of fs.readdirSync(booksDir)) {
    if (!name.endsWith(".json")) continue;
    const bookPath = path.join(booksDir, name);
    const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    const id = book.id || name.replace(/\.json$/i, "");
    const outPath = path.join(speakersDir, `${id}.json`);
    let preservedChunks = {};
    let preservedAudioChunks = undefined;
    let preservedDeliveryChunks = undefined;
    let preservedChapterManualValidation = undefined;
    if (fs.existsSync(outPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
        if (prev.chunks && typeof prev.chunks === "object" && !Array.isArray(prev.chunks)) {
          preservedChunks = prev.chunks;
        }
        if (prev.audioChunks && typeof prev.audioChunks === "object" && !Array.isArray(prev.audioChunks)) {
          preservedAudioChunks = prev.audioChunks;
        }
        if (prev.deliveryChunks && typeof prev.deliveryChunks === "object" && !Array.isArray(prev.deliveryChunks)) {
          preservedDeliveryChunks = prev.deliveryChunks;
        }
        if (
          prev.chapterManualValidation &&
          typeof prev.chapterManualValidation === "object" &&
          !Array.isArray(prev.chapterManualValidation)
        ) {
          preservedChapterManualValidation = prev.chapterManualValidation;
        }
      } catch {
        /* ignore corrupt file */
      }
    }
    const payload = {
      schemaVersion: 1,
      bookId: id,
      source: {
        encoder: "template",
        generatedAt: now,
        bookJsonSha256: sha256File(bookPath),
      },
      chunks: preservedChunks,
      ...(preservedAudioChunks ? { audioChunks: preservedAudioChunks } : {}),
      ...(preservedDeliveryChunks ? { deliveryChunks: preservedDeliveryChunks } : {}),
      ...(preservedChapterManualValidation ? { chapterManualValidation: preservedChapterManualValidation } : {}),
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log("wrote", path.relative(root, outPath));
  }
}

function validate() {
  let errors = 0;
  for (const name of fs.readdirSync(booksDir)) {
    if (!name.endsWith(".json")) continue;
    const bookPath = path.join(booksDir, name);
    const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    const id = book.id || name.replace(/\.json$/i, "");
    const spPath = path.join(speakersDir, `${id}.json`);
    if (!fs.existsSync(spPath)) {
      console.error(`missing speakers file for ${id}: ${spPath}`);
      errors++;
      continue;
    }
    const sp = JSON.parse(fs.readFileSync(spPath, "utf8"));
    if (sp.schemaVersion !== 1 || sp.bookId !== id) {
      console.error(`${id}: schemaVersion/bookId mismatch`);
      errors++;
    }
    const chunks = sp.chunks && typeof sp.chunks === "object" ? sp.chunks : {};
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const cells = paragraphCells(book.chapters[ci]);
      for (let pi = 0; pi < cells.length; pi++) {
        const key = `${ci}:${pi}`;
        const expected = countDialogueChunks(cells[pi].text, cells[pi].c);
        if (!(key in chunks)) continue;
        const row = chunks[key];
        if (!Array.isArray(row)) {
          console.error(`${id} ${key}: chunks[key] must be an array`);
          errors++;
          continue;
        }
        if (row.length !== expected) {
          console.error(
            `${id} ${key}: speakers length ${row.length} !== dialogue chunk count ${expected}`,
          );
          errors++;
        }
      }
    }
  }
  if (errors) {
    console.error(`validate failed (${errors} issue(s))`);
    process.exit(1);
  }
  console.log("validate ok");
}

const arg = process.argv[2];
if (arg === "--validate") validate();
else writeTemplates();
