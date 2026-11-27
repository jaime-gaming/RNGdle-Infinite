import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { seedProgress } from "../tests/helpers/progress.js";
import { mockOperationalStatus } from "../tests/helpers/status.js";

const base = process.env.SCREENSHOT_BASE ?? "http://127.0.0.1:5174";
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.clock.install({ time: new Date("2026-12-17T12:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOperationalStatus(page);
  await seedProgress(page, { balance: 3000000, totalEarned: 3000000 });
  await page.goto(`${base}/shop/rngmas`);
  await page
    .getByRole("button", { name: "Festival board", exact: true })
    .click();
  await page.locator("#winter-festival-board").evaluate((node) => {
    node.scrollIntoView({ block: "start" });
  });
  await mkdir(new URL("../media/", import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL("../media/rngmas.png", import.meta.url).pathname,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Rewards", exact: true }).click();
  await page.locator(".festival-collection").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: new URL("../media/rngmas-collection.png", import.meta.url).pathname,
    animations: "disabled",
  });
  console.log("media/rngmas.png (synthetic local profile, December 17 UTC)");
} finally {
  await browser.close();
}
