#!/usr/bin/env node
/**
 * Compare `src/data/imported/{id}.json` to `src/data/books/{id}.json` (text + speaker chunk keys).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const booksDir = path.join(root, "src", "data", "books");
const importedDir = path.join(root, "src", "data", "imported");
const speakersDir = path.join(root, "src", "data", "speakers");

const DIALOGUE_SEGMENT = /([“"][^”"]*[”"])/g;

function cellText(cell) {
  return typeof cell === "string" ? cell : cell.text;
}

function countChunks(text, cont) {
  const probe = cont ? "\u201c" + text : text;
  return (probe.match(new RegExp(DIALOGUE_SEGMENT.source, "g")) || []).length;
}

function main() {
  if (!fs.existsSync(importedDir)) {
    console.error("Run: npm run import-arpp:all");
    process.exit(1);
  }

  let failed = 0;
  for (const name of fs.readdirSync(importedDir).filter((f) => f.endsWith(".json") && !f.includes("-speakers"))) {
    const id = name.replace(/\.json$/, "");
    const origPath = path.join(booksDir, `${id}.json`);
    if (!fs.existsSync(origPath)) {
      console.warn(`Skip ${id}: no original book JSON`);
      continue;
    }
    const orig = JSON.parse(fs.readFileSync(origPath, "utf8"));
    const imp = JSON.parse(fs.readFileSync(path.join(importedDir, name), "utf8"));

    let paraMismatch = 0;
    orig.chapters.forEach((ch, ci) => {
      ch.paragraphs.forEach((cell, pi) => {
        const a = cellText(cell);
        const b = cellText(imp.chapters[ci]?.paragraphs[pi]);
        if (a !== b) paraMismatch++;
      });
    });

    const spOrig = fs.existsSync(path.join(speakersDir, `${id}.json`))
      ? JSON.parse(fs.readFileSync(path.join(speakersDir, `${id}.json`), "utf8")).chunks
      : {};
    const spImpPath = path.join(importedDir, `${id}-speakers.json`);
    const spImp = fs.existsSync(spImpPath)
      ? JSON.parse(fs.readFileSync(spImpPath, "utf8")).chunks
      : {};

    let chunkKeyMismatch = 0;
    for (const key of Object.keys(spOrig)) {
      const [c, p] = key.split(":").map(Number);
      const origCell = orig.chapters[c].paragraphs[p];
      const n = countChunks(cellText(origCell), typeof origCell === "object" && origCell.c);
      const impRow = spImp[key];
      if (!impRow || impRow.length !== n) chunkKeyMismatch++;
    }

    const ok = paraMismatch === 0 && chunkKeyMismatch === 0;
    console.log(`${ok ? "✓" : "✗"} ${id}: ${paraMismatch} paragraph diffs, ${chunkKeyMismatch} speaker key mismatches`);
    if (!ok) failed++;
  }

  process.exit(failed ? 1 : 0);
}

main();
