#!/usr/bin/env node
/** Forwards argv on Windows: `npm run import-arpp -- --epub=…` */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
loadEnvFile(root);
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const target = path.join(root, "scripts", "import-arpp.ts");
const r = spawnSync(process.execPath, [tsxCli, target, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
