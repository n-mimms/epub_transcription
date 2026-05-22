#!/usr/bin/env node
/**
 * Import ARPP EPUB → book JSON + speakers JSON (+ optional theatric JSON) for ereader bundling or round-trip checks.
 *
 * Usage:
 *   npm run import-arpp -- --epub=exports/arpp/pride-and-prejudice.epub
 *   npm run import-arpp -- --epub=exports/arpp/pride-and-prejudice.epub --out-dir=src/data/imported
 *
 * When `metadata/theatric.json` is present and valid, also writes `{bookId}-theatric.json`.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { importArppEpub } from "../src/lib/arpp/importEpub";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const epubArg = arg("epub") ?? process.env.IMPORT_EPUB;
  if (!epubArg) {
    console.error("Usage: npm run import-arpp -- --epub=<path> [--out-dir=src/data/imported]");
    process.exit(1);
  }

  const epubPath = path.isAbsolute(epubArg) ? epubArg : path.join(root, epubArg);
  const outDir = arg("out-dir")
    ? path.isAbsolute(arg("out-dir")!)
      ? arg("out-dir")!
      : path.join(root, arg("out-dir")!)
    : path.join(root, "src", "data", "imported");

  const buf = fs.readFileSync(epubPath);
  const { book, speakerAttribution, theatric } = await importArppEpub(buf);

  fs.mkdirSync(outDir, { recursive: true });
  const bookPath = path.join(outDir, `${book.id}.json`);
  const { speakerAttribution: _drop, ...bookOnly } = book;
  fs.writeFileSync(bookPath, JSON.stringify(bookOnly, null, 2));

  if (speakerAttribution) {
    const speakersPath = path.join(outDir, `${book.id}-speakers.json`);
    fs.writeFileSync(speakersPath, JSON.stringify(speakerAttribution, null, 2));
    console.log(`Wrote ${speakersPath}`);
  }

  if (theatric) {
    const theatricPath = path.join(outDir, `${book.id}-theatric.json`);
    fs.writeFileSync(theatricPath, JSON.stringify(theatric, null, 2));
    console.log(`Wrote ${theatricPath}`);
  }

  console.log(`Wrote ${bookPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
