import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import {
  APP_INTERNAL_VERSION,
  getAppBuildId,
  getAppInternalVersion,
  makeVersionUrl,
  fetchPublishedBuild,
  decideUpdateStep,
  snapshotSaveForUpdate,
  recoverSaveAfterUpdate,
  clearGameCaches,
  APP_UPDATE_STORAGE_KEY,
  APP_UPDATE_SAVE_KEY,
  APP_UPDATE_QUERY,
  APP_UPDATE_MAX_RELOADS,
  isLegacyMirrorBuild,
  isNewerVersion,
} from "../src/app-update.js";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { readSavedProgress } from "./helpers/save.js";
import { unpackVaultSave } from "../src/save-codec.js";

test("only the legacy GitHub Pages build shows the mirror notice", () => {
  expect(isLegacyMirrorBuild("/RNGdle-Infinite/")).toBe(true);
  expect(isLegacyMirrorBuild("/")).toBe(false);
});

test("internal version labels compare by release and fix number", () => {
  expect(isNewerVersion("v0.5.2fix5", "v0.5.2fix4")).toBe(true);
  expect(isNewerVersion("v0.5.3", "v0.5.2fix9")).toBe(true);
  expect(isNewerVersion("v0.5.2fix4", "v0.5.2fix4")).toBe(false);
  expect(isNewerVersion("v0.5.2fix3", "v0.5.2fix4")).toBe(false);
  expect(isNewerVersion("RNGdle-Infinitev0.5.1fix9", "v0.5.2fix4")).toBe(false);
  expect(() => isNewerVersion("unknown", APP_INTERNAL_VERSION)).toThrow();
});

test("build identity is read from the page and version checks use the app base path", async () => {
  expect(
    getAppBuildId({
      querySelector: () => ({ content: "release-123" }),
    }),
  ).toBe("release-123");
  expect(
    getAppInternalVersion({
      querySelector: () => ({ content: APP_INTERNAL_VERSION }),
    }),
  ).toBe("v0.6");
  expect(
    makeVersionUrl({
      base: "/preview/",
      origin: "https://game.example",
      now: 17,
    }),
  ).toBe("https://game.example/preview/version.json?_=17");

  let request;
  const published = await fetchPublishedBuild({
    base: "/preview/",
    origin: "https://game.example",
    now: 23,
    fetcher: async (url, options) => {
      request = { url: String(url), options };
      return {
        ok: true,
        json: async () => ({
          version: "0.5.2",
          buildId: "release-456",
          internalVersion: APP_INTERNAL_VERSION,
        }),
      };
    },
  });
  expect(published).toEqual({
    version: "0.5.2",
    buildId: "release-456",
    internalVersion: APP_INTERNAL_VERSION,
  });
  expect(request.url).toBe("https://game.example/preview/version.json?_=23");
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
  await waitForApp(page);

  const buildId = await page
    .locator('meta[name="rngdle-build-id"]')
    .getAttribute("content");
  expect(buildId).toBeTruthy();
  const liveVersion = await page.request.get(
    new URL("/version.json", page.url()).toString(),
  );
  expect(liveVersion.ok()).toBeTruthy();
  expect(APP_INTERNAL_VERSION).toBe("v0.6");
  expect(await liveVersion.json()).toMatchObject({
    buildId,
    internalVersion: APP_INTERNAL_VERSION,
  });
  await expect(
    page.locator('meta[name="rngdle-internal-version"]'),
  ).toHaveAttribute("content", APP_INTERNAL_VERSION);
  await expect(page.getByTestId("settings-internal-version")).toHaveText(
    APP_INTERNAL_VERSION,
  );

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
  await expect(page.getByTestId("settings-update")).toHaveText("Refresh game");

  const saved = await readSavedProgress(page);
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

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("the update decides done, wait, reload or stuck from the build ids alone", () => {
  const intent = { lastReloadAt: 0, reloads: 0 };
  expect(
    decideUpdateStep({ currentBuild: "b1", publishedBuild: "b1", intent }),
  ).toEqual({ kind: "done", reloads: 0 });
  expect(
    decideUpdateStep({ currentBuild: "", publishedBuild: "b1" }),
  ).toMatchObject({ kind: "unreadable" });
  expect(
    decideUpdateStep({
      currentBuild: "b1",
      publishedBuild: "b2",
      intent: { lastReloadAt: 1000, reloads: 2 },
      now: 1500,
      pollMs: 2500,
    }),
  ).toEqual({ kind: "wait", reloads: 2 });
  expect(
    decideUpdateStep({
      currentBuild: "b1",
      publishedBuild: "b2",
      intent: { lastReloadAt: 1000, reloads: 2 },
      now: 9000,
      pollMs: 2500,
    }),
  ).toEqual({ kind: "reload", reloads: 3 });

  expect(
    decideUpdateStep({
      currentBuild: "b1",
      publishedBuild: "b2",
      intent: { lastReloadAt: 0, reloads: APP_UPDATE_MAX_RELOADS },
      now: 90000,
    }),
  ).toEqual({ kind: "stuck", reloads: APP_UPDATE_MAX_RELOADS });
});

test("a save copy is used only when the landed build cannot read the save", () => {
  const save = JSON.stringify({ profile: { id: "p1" }, balance: 42 });

  const local = fakeStorage({ [PROGRESS_KEY]: save });
  const scratch = fakeStorage();
  expect(snapshotSaveForUpdate({ storage: local, scratch, now: 10 })).toBe(
    true,
  );
  expect(recoverSaveAfterUpdate({ storage: local, scratch, now: 20 })).toEqual({
    recovered: false,
  });
  expect(local.map.get(PROGRESS_KEY)).toBe(save);
  expect(scratch.map.has(APP_UPDATE_SAVE_KEY)).toBe(false);

  for (const broken of ["", "<html>not a save</html>"]) {
    const after = fakeStorage(broken ? { [PROGRESS_KEY]: broken } : {});
    const copy = fakeStorage();
    snapshotSaveForUpdate({ storage: local, scratch: copy, now: 10 });
    expect(
      recoverSaveAfterUpdate({ storage: after, scratch: copy, now: 20 }),
    ).toEqual({ recovered: true });
    expect(unpackVaultSave(after.map.get(PROGRESS_KEY))).toBe(save);
  }

  const stale = fakeStorage();
  snapshotSaveForUpdate({ storage: local, scratch: stale, now: 1 });
  const empty = fakeStorage();
  expect(
    recoverSaveAfterUpdate({
      storage: empty,
      scratch: stale,
      now: 2 * 60 * 60 * 1000,
    }),
  ).toEqual({ recovered: false });
  expect(empty.map.has(PROGRESS_KEY)).toBe(false);
});

test("clearing cached files deletes every cache and leaves site data alone", async () => {
  const deleted = [];
  const cacheStorage = {
    keys: async () => ["old-build", "older-build"],
    delete: async (key) => {
      deleted.push(key);
      return true;
    },
  };
  const local = fakeStorage({ [PROGRESS_KEY]: "{}" });
  expect(await clearGameCaches({ cacheStorage })).toEqual({ timedOut: false });
  expect(deleted.sort()).toEqual(["old-build", "older-build"]);
  expect(local.map.get(PROGRESS_KEY)).toBe("{}");

  const hanging = await clearGameCaches({
    cacheStorage: {
      keys: () => new Promise(() => {}),
      delete: async () => true,
    },
    timeoutMs: 1,
  });
  expect(hanging).toEqual({ timedOut: true });
});

test("Reload until updated clears cached files and keeps the saved game and session", async ({
  page,
}) => {
  await seedProgress(page, { balance: 424242, totalEarned: 999999 });
  await page.goto("/settings");
  await waitForApp(page);
  const buildId = await page
    .locator('meta[name="rngdle-build-id"]')
    .getAttribute("content");
  expect(buildId).toBeTruthy();

  await page.evaluate(async () => {
    const cache = await caches.open("rngdle-old-build");
    await cache.put("/stale.js", new Response("old build"));
  });
  expect(await page.evaluate(() => caches.keys())).toContain(
    "rngdle-old-build",
  );

  let served = 0;
  await page.route("**/version.json**", (route) => {
    const build = served++ === 0 ? "an-older-published-build" : buildId;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { version: "test", buildId: build },
    });
  });

  await page.getByTestId("settings-update").click();
  await expect(page.getByTestId("update-status")).toContainText(
    "This device has the latest version.",
    { timeout: 60000 },
  );
  expect(served).toBeGreaterThan(1);

  expect(await page.evaluate(() => caches.keys())).not.toContain(
    "rngdle-old-build",
  );
  await expect(page).not.toHaveURL(new RegExp(APP_UPDATE_QUERY));
  const savedSave = await readSavedProgress(page);
  expect(savedSave.balance).toBe(424242);
  expect(savedSave.totalEarned).toBe(999999);
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      APP_UPDATE_SAVE_KEY,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      APP_UPDATE_STORAGE_KEY,
    ),
  ).toBeNull();
});
