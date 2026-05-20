#!/usr/bin/env node
/** Forwards argv on Windows: `npm run export-arpp -- --book=…` */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);

function argsFromNpmConfig() {
  const out = [];
  const book = (process.env.npm_config_book || process.env.EXPORT_BOOK || "").trim();
  if (book) out.push(`--book=${book}`);
  if (process.env.EXPORT_ALL === "1" || process.env.npm_config_all === "true") {
    out.push("--all");
  }
  const exportOut = (process.env.npm_config_out || process.env.EXPORT_OUT || "").trim();
  if (exportOut) out.push(`--out=${exportOut}`);
  if (process.env.npm_config_no_speakers_sidecar === "true") {
    out.push("--no-speakers-sidecar");
  }
  return out;
}

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const target = path.join(root, "scripts", "json-to-arpp.ts");
const passArgs = process.argv.slice(2);
const forwardArgs = passArgs.length > 0 ? passArgs : argsFromNpmConfig();
const r = spawnSync(process.execPath, [tsxCli, target, ...forwardArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
