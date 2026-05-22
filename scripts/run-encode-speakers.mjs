#!/usr/bin/env node
/**
 * Launcher so `npm run encode-speakers -- --book=…` forwards argv on Windows.
 * When argv is empty, rebuild flags from npm_config_* (npm run encode-speakers --chapter=0).
 */
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
  const book = (process.env.npm_config_book || process.env.ENCODE_BOOK || "").trim();
  if (book) out.push(`--book=${book}`);
  const chapter = (process.env.npm_config_chapter ?? process.env.ENCODE_CHAPTER ?? "").trim();
  if (chapter !== "" && Number.isFinite(Number(chapter))) {
    out.push(`--chapter=${Math.trunc(Number(chapter))}`);
  }
  const voteRuns = (process.env.npm_config_vote_runs ?? process.env.ENCODE_VOTE_RUNS ?? "").trim();
  if (voteRuns !== "" && Number.isFinite(Number(voteRuns))) {
    out.push(`--vote-runs=${Math.trunc(Number(voteRuns))}`);
  }
  const skip = (process.env.npm_config_skip_chapters || process.env.ENCODE_SKIP_CHAPTERS || "").trim();
  if (skip) out.push(`--skip-chapters=${skip}`);
  if (process.env.npm_config_dry_run === "true" || process.env.ENCODE_DRY_RUN === "1") {
    out.push("--dry-run");
  }
  if (
    process.env.npm_config_force_validated === "true" ||
    process.env.ENCODE_FORCE_VALIDATED === "1"
  ) {
    out.push("--force-validated");
  }
  if (process.env.npm_config_no_progress === "true") {
    out.push("--no-progress");
  }
  return out;
}

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const target = path.join(root, "scripts", "encode-speakers.ts");
const passArgs = process.argv.slice(2);
const forwardArgs = passArgs.length > 0 ? passArgs : argsFromNpmConfig();

if (passArgs.length === 0 && forwardArgs.length > 0) {
  console.log("[run-encode-speakers] argv empty — using flags:", forwardArgs.join(" "));
}

const r = spawnSync(process.execPath, [tsxCli, target, ...forwardArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
