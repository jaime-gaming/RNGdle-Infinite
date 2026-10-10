import { test, expect } from "@playwright/test";
import {
  getAppBuildId,
  makeVersionUrl,
  fetchPublishedBuild,
  APP_UPDATE_STORAGE_KEY,
} from "../src/app-update.js";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";

test("build identity is read from the page and version checks use the app base path", async () => {
  expect(
    getAppBuildId({
      querySelector: () => ({ content: "release-123" }),
    }),
  ).toBe("release-123");
  expect(
    makeVersionUrl({
      base: "/RNGdle-Infinite/",
      origin: "https://game.example",
      now: 17,
    }),
  ).toBe("https://game.example/RNGdle-Infinite/version.json?_=17");

  let request;
  const buildId = await fetchPublishedBuild({
    base: "/RNGdle-Infinite/",
    origin: "https://game.example",
    now: 23,
    fetcher: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, json: async () => ({ buildId: "release-456" }) };
    },
  });
  expect(buildId).toBe("release-456");
  expect(request.url).toBe(
    "https://game.example/RNGdle-Infinite/version.json?_=23",
  );
  expect(request.options).toMatchObject({ cache: "no-store" });
});

test("Settings refreshes once when current and keeps the saved game intact", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 987654,
    totalEarned: 1234567,
    owned: ["auto-roll"],
  });
  await page.goto("/settings");

  const buildId = await page
    .locator('meta[name="rngdle-build-id"]')
    .getAttribute("content");
  expect(buildId).toBeTruthy();
  const liveVersion = await page.request.get(
    new URL("/version.json", page.url()).toString(),
  );
  expect(liveVersion.ok()).toBeTruthy();
  expect((await liveVersion.json()).buildId).toBe(buildId);

  // Return the build already in this page after its deliberate cache-busted
  // reload, exercising the successful end of the retry flow deterministically.
  await page.route("**/version.json**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { version: "test", buildId },
    }),
  );
  await page.getByTestId("settings-update").click();
  await expect(page.getByTestId("update-status")).toContainText(
    "latest version",
    { timeout: 10000 },
  );
  await expect(page.getByTestId("settings-update")).toHaveText(
    "Reload until updated",
  );

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.balance).toBe(987654);
  expect(saved.totalEarned).toBe(1234567);
  expect(saved.owned).toContain("auto-roll");
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      APP_UPDATE_STORAGE_KEY,
    ),
  ).toBeNull();
});
