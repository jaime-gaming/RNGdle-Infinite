import { defineConfig } from "@playwright/test";
import { introStorageState } from "./tests/helpers/intro.js";
export default defineConfig({
  testDir: "./tests",
  // The suite runs several browsers at once; under that load a reveal or a
  // dialog can take a few seconds longer than on an idle machine, and the
  // multi-browser linking tests pay that price several times over. Wider
  // budgets per test and per assertion, never retries that hide a real bug.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    // The welcome and the World opening are once-per-browser and modal, and the
    // suite runs on today's date — inside the RNGween window. Every context
    // starts with both receipts written; the handful of tests that check the
    // welcome delete them first.
    storageState: introStorageState,
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
        }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
