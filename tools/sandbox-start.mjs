#!/usr/bin/env node
// Start a RNGween sandbox with a selectable date.
// Usage: node tools/sandbox-start.mjs [date]
//   date: ISO timestamp, e.g. 2026-10-26T12:00:00Z
//   None: Halloween show start; "live": no override

import { sandboxClock } from "./sandbox-clock.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { REAPER_SHOW_START } from "../src/rngween-finale.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const dateArg = process.argv[2];
const date =
  dateArg === "live"
    ? undefined
    : (dateArg ?? new Date(REAPER_SHOW_START).toISOString());

const viteArgs = [
  "vite",
  "--host",
  "0.0.0.0",
  "--port",
  "5174",
  ...(date ? ["--mode", "rngween-preview"] : []),
];

console.log(`RNGdle Infinite sandbox${date ? ` · ${date}` : " · live clock"}`);
console.log(`http://localhost:5174/`);
if (date) {
  console.log(`Press Ctrl+C to stop. The review clock is set to ${date}.`);
}

const child = spawn("npx", viteArgs, {
  cwd: root,
  env: {
    ...process.env,
    RNGDLE_SANDBOX_DATE: date ?? "",
  },
  stdio: "inherit",
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
  process.exit(0);
});
