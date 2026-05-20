#!/usr/bin/env node
/** Forwards argv on Windows: `npm run synth-dialogue-audio -- --book=…` */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);

/** Windows: `npm run … -- --book=x` often drops argv; npm still sets npm_config_* */
function argsFromNpmConfig() {
  const out = [];
  const book = (process.env.npm_config_book || process.env.SYNTH_BOOK || "").trim();
  if (book) out.push(`--book=${book}`);
  const chapters = (process.env.npm_config_chapters || process.env.SYNTH_CHAPTERS || "").trim();
  if (chapters) out.push(`--chapters=${chapters}`);
  const provider = (process.env.npm_config_provider || process.env.SYNTH_PROVIDER || "").trim();
  if (provider) out.push(`--provider=${provider}`);
  if (process.env.npm_config_dry_run === "true" || process.env.SYNTH_DRY_RUN === "1") {
    out.push("--dry-run");
  }
  if (process.env.npm_config_force === "true" || process.env.SYNTH_FORCE === "1") {
    out.push("--force");
  }
  return out;
}

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const target = path.join(root, "scripts", "synth-dialogue-audio.ts");
const passArgs = process.argv.slice(2);
const forwardArgs = passArgs.length > 0 ? passArgs : argsFromNpmConfig();
const r = spawnSync(process.execPath, [tsxCli, target, ...forwardArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
