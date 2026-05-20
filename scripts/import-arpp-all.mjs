#!/usr/bin/env node
/**
 * Import every `exports/arpp/*.epub` → `src/data/imported/{id}.json` + speakers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const epubDir = path.join(root, "exports", "arpp");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const importScript = path.join(root, "scripts", "import-arpp.ts");

if (!fs.existsSync(epubDir)) {
  console.error(`No EPUBs in ${epubDir}. Run: npm run export-arpp:all`);
  process.exit(1);
}

const epubs = fs.readdirSync(epubDir).filter((f) => f.endsWith(".epub"));
if (epubs.length === 0) {
  console.error(`No .epub files in ${epubDir}`);
  process.exit(1);
}

for (const name of epubs) {
  const epub = path.join(epubDir, name);
  console.log(`\n→ ${name}`);
  const r = spawnSync(
    process.execPath,
    [tsxCli, importScript, `--epub=${epub}`],
    { stdio: "inherit", cwd: root, env: process.env },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`\nDone. Imported JSON is in src/data/imported/`);
