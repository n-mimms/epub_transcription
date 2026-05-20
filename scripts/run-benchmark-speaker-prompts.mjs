#!/usr/bin/env node
/**
 * Launcher so `npm run benchmark-speaker-prompts -- --models=…` forwards argv on Windows.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const target = path.join(root, "scripts", "benchmark-speaker-prompts.ts");
const passArgs = process.argv.slice(2);

const r = spawnSync(process.execPath, [tsxCli, target, ...passArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
