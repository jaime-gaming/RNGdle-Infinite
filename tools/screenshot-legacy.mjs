import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { seedProgress } from "../tests/helpers/progress.js";
import { mockOperationalStatus } from "../tests/helpers/status.js";
const before =
  process.env.LEGACY_PREVIEW_BASE ?? "http://127.0.0.1:5183/RNGdle-Infinite/";
const after =
  process.env.LEGACY_CLOSED_BASE ?? "http://127.0.0.1:5184/RNGdle-Infinite/";
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  await mkdir(new URL("../media/", import.meta.url), { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await mockOperationalStatus(page);
  await seedProgress(page);
  await page.goto(before);
  await page.locator(".legacy-notice").waitFor();
  await page.locator(".header").waitFor();
  await page.screenshot({
    path: new URL("../media/legacy-countdown.png", import.meta.url).pathname,
  });
  await page
    .getByRole("button", { name: "Shutdown & moving your save" })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({
    path: new URL("../media/legacy-shutdown.png", import.meta.url).pathname,
  });
  await page.goto(after);
  await page.locator(".legacy-closed").waitFor();
  await page.screenshot({
    path: new URL("../media/legacy-closed.png", import.meta.url).pathname,
  });
  console.log(
    "Legacy countdown, shutdown information and closed-state screenshots saved.",
  );
} finally {
  await browser.close();
}
