#!/usr/bin/env node
/**
 * Validate `audioChunks` in speakers sidecars: array lengths, on-disk files, speaker key alignment.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const booksDir = path.join(root, "src", "data", "books");
const speakersDir = path.join(root, "src", "data", "speakers");
const dataRoot = path.join(root, "src", "data");

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

function epubHrefToDiskPath(epubHref) {
  const rel = epubHref.replace(/^audio\//, "");
  return path.join(dataRoot, "audio", rel);
}

function main() {
  let errors = 0;
  for (const name of fs.readdirSync(booksDir)) {
    if (!name.endsWith(".json")) continue;
    const bookPath = path.join(booksDir, name);
    const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
    const id = book.id || name.replace(/\.json$/i, "");
    const spPath = path.join(speakersDir, `${id}.json`);
    if (!fs.existsSync(spPath)) continue;

    const sp = JSON.parse(fs.readFileSync(spPath, "utf8"));
    const audioChunks = sp.audioChunks && typeof sp.audioChunks === "object" ? sp.audioChunks : {};
    const deliveryChunks = sp.deliveryChunks && typeof sp.deliveryChunks === "object" ? sp.deliveryChunks : {};
    if (Object.keys(audioChunks).length === 0 && Object.keys(deliveryChunks).length === 0) continue;

    const speakerKeys = new Set(Object.keys(sp.chunks ?? {}));

    for (let ci = 0; ci < book.chapters.length; ci++) {
      const cells = paragraphCells(book.chapters[ci]);
      for (let pi = 0; pi < cells.length; pi++) {
        const key = `${ci}:${pi}`;
        const expected = countDialogueChunks(cells[pi].text, cells[pi].c);
        if (key in deliveryChunks) {
          const drow = deliveryChunks[key];
          if (!Array.isArray(drow)) {
            console.error(`${id} ${key}: deliveryChunks[key] must be an array`);
            errors++;
          } else if (drow.length !== expected) {
            console.error(
              `${id} ${key}: delivery length ${drow.length} !== dialogue chunk count ${expected}`,
            );
            errors++;
          }
        }
        if (!(key in audioChunks)) continue;

        const row = audioChunks[key];
        if (!Array.isArray(row)) {
          console.error(`${id} ${key}: audioChunks[key] must be an array`);
          errors++;
          continue;
        }
        if (row.length !== expected) {
          console.error(
            `${id} ${key}: audio length ${row.length} !== dialogue chunk count ${expected}`,
          );
          errors++;
        }
        if (speakerKeys.has(key) && sp.chunks[key]?.length !== row.length) {
          console.error(
            `${id} ${key}: audioChunks length ${row.length} !== speakers length ${sp.chunks[key].length}`,
          );
          errors++;
        }
        for (const href of row) {
          const disk = epubHrefToDiskPath(href);
          if (!fs.existsSync(disk)) {
            console.error(`${id} ${key}: missing file ${disk}`);
            errors++;
          }
        }
      }
    }

    for (const key of Object.keys(audioChunks)) {
      if (!/^\d+:\d+$/.test(key)) {
        console.error(`${id}: invalid audioChunks key ${key}`);
        errors++;
      }
    }
  }

  if (errors) {
    console.error(`validate-dialogue-audio failed (${errors} issue(s))`);
    process.exit(1);
  }
  console.log("validate-dialogue-audio ok");
}

main();
