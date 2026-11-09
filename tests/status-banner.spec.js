import { readFileSync } from "node:fs";
import { expect, test } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { STATUS_POLL_INTERVAL_MS } from "../src/status-page.js";

const summary = (title, body) => ({
  components: [
    { id: "rngdle", name: "RNGdle Infinite", status: "degraded_performance" },
  ],
  incidents: [
    {
      id: "incident-1",
      name: `RNGdle Infinite: ${title}`,
      status: "investigating",
      impact: "minor",
      incident_updates: [{ body, created_at: "2026-11-08T00:00:00Z" }],
    },
  ],
  scheduled_maintenances: [],
});

test("status notices refresh every minute and reflow the interface", async ({
  page,
}) => {
  expect(STATUS_POLL_INTERVAL_MS).toBe(60_000);
  let calls = 0;
  await page.route("**/api/v2/summary.json", (route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json:
        calls === 1
          ? summary("First incident", "First incident details")
          : summary("Second incident", "Second incident details"),
    });
  });
  await page.goto("/");
  await waitForApp(page);
  const banner = page.getByTestId("status-banner");
  await expect(banner).toContainText("First incident details");

  const geometry = await page.evaluate(() => {
    const header = document.querySelector(".header")?.getBoundingClientRect();
    const notice = document
      .querySelector(".status-banner")
      ?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return {
      headerBottom: header?.bottom ?? 0,
      bannerTop: notice?.top ?? 0,
      bannerBottom: notice?.bottom ?? 0,
      mainTop: main?.top ?? 0,
    };
  });
  expect(geometry.bannerTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.mainTop).toBeGreaterThanOrEqual(geometry.bannerBottom);

  await page.clock.runFor(60_100);
  await expect(banner).toContainText("Second incident details");
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("production config has no App Check or reCAPTCHA site key", () => {
  const env = readFileSync(
    new URL("../.env.production", import.meta.url),
    "utf8",
  );
  const firebase = readFileSync(
    new URL("../src/firebase.js", import.meta.url),
    "utf8",
  );
  expect(env).not.toContain("APPCHECK");
  expect(env).not.toContain("recaptcha");
  expect(firebase).not.toContain("app-check");
  expect(firebase).not.toContain("ReCaptcha");
});
