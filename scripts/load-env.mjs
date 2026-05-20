#!/usr/bin/env node
/**
 * Load repo-root `.env` into process.env (only keys not already set).
 */
import fs from "fs";
import path from "path";

export function loadEnvFile(cwd) {
  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) return false;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}
