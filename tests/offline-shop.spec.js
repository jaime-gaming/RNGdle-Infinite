import { test, expect } from "@playwright/test";
import {
  offlinePlan,
  parseOffline,
  OFFLINE_INTERVAL,
  PRESENCE_PREFIX,
} from "../src/offline.js";
import { emptyProgress, applyProgress, PROGRESS_KEY } from "../src/progress.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockRandom } from "./helpers/random-roll.js";
import { evaluate } from "./helpers/index.js";
import { shopProducts } from "../src/shop-data.js";
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const rows = async (p) =>
  (await saved(p)).history.filter((e) => e.source === "offline");
const state = (minutes = 60) => ({
  ...emptyProgress(),
  profile: testProfile,
  owned: ["offline-roller"],
  offline: {
    lastSeenAt: Date.now() - minutes * 60000 - 1000,
    batch: null,
    report: null,
  },
});
async function away(page, minutes = 60, extra = {}) {
  await seedProgress(page, { ...state(minutes), ...extra });
  await mockRandom(page, [604827]);
}
async function collected(page, count) {
  await expect
    .poll(async () => (await rows(page)).length, { timeout: 20000 })
    .toBe(count);
  await expect.poll(async () => (await saved(page)).offline.batch).toBeNull();
}
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();

test("offline accounting uses whole ten-minute periods, caps at 144, and excludes other visible tabs", () => {
  const now = 100000000;
  const plan = (age, p = []) =>
    offlinePlan({ lastSeenAt: now - age }, now, p, "mine", true);
  expect(plan(599999).count).toBe(0);
  expect(plan(600000).count).toBe(1);
  expect(plan(86400000).count).toBe(144);
  expect(plan(864000000).count).toBe(144);
  expect(plan(-1000).count).toBe(0);
  expect(plan(3600000, [{ id: "other", at: now, visible: true }]).count).toBe(
    0,
  );
  expect(offlinePlan({ lastSeenAt: 0 }, now, [], "mine", false).count).toBe(0);
  const b = {
    lastSeenAt: now,
    batch: {
      id: "b",
      since: 0,
      numbers: [604827],
      index: 0,
      ep: 0,
      newBadges: 0,
    },
    report: null,
  };
  expect(parseOffline(b, ["offline-roller"])).toEqual(b);
  expect(() =>
    parseOffline({ ...b, batch: { ...b.batch, numbers: Array(145).fill(1) } }, [
      "offline-roller",
    ]),
  ).toThrow();
  // A vault owner may legitimately hold a larger batch, but never more than it.
  expect(
    parseOffline({ ...b, batch: { ...b.batch, numbers: Array(216).fill(1) } }, [
      "offline-roller",
      "offline-clock-1",
      "offline-vault-1",
    ]).batch.numbers,
  ).toHaveLength(216);
  expect(() =>
    parseOffline({ ...b, batch: { ...b.batch, numbers: Array(217).fill(1) } }, [
      "offline-roller",
      "offline-clock-1",
      "offline-vault-1",
    ]),
  ).toThrow();
  expect(() =>
    parseOffline({ ...b, batch: { ...b.batch, index: 1 } }, ["offline-roller"]),
  ).toThrow();
  expect(() =>
    applyProgress(
      { ...emptyProgress(), balance: 25000000, totalEarned: 25000000 },
      { type: "buy", id: "offline-roller" },
    ),
  ).toThrow("profile");
});

test("returning credits six real scores, discoveries and an automatic summary with a free offline history filter", async ({
  page,
}) => {
  await away(page);
  await page.goto("/");
  await collected(page, 6);
  const result = evaluate(604827);
  expect((await saved(page)).balance).toBe(result.totalEP * 6);
  expect((await saved(page)).discovered).toHaveLength(result.badges.length);
  await expect(
    page.getByRole("region", { name: "Offline rewards" }),
  ).toContainText("6 rolls");
  await nav(page, "History");
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await expect(page.locator('[data-event-type="roll"]')).toHaveCount(6);
  await expect(page.locator('[data-event-type="roll"]').first()).toContainText(
    "Offline roll completed",
  );
  await page.getByRole("button", { name: "Dismiss offline summary" }).click();
  await expect.poll(async () => (await saved(page)).offline.report).toBeNull();
  await page.reload();
  expect(await rows(page)).toHaveLength(6);
  await expect(
    page.getByRole("region", { name: "Offline rewards" }),
  ).toHaveCount(0);
});

test("a long absence pays at most 144 rolls and refresh cannot award them again", async ({
  page,
}) => {
  await away(page, 7 * 24 * 60);
  await page.goto("/");
  await collected(page, 144);
  const before = await saved(page);
  expect(before.balance).toBe(144 * 4663);
  expect(before.receipts).toHaveLength(128);
  expect(new Set(before.history.map((e) => e.id)).size).toBe(
    before.history.length,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  expect((await saved(page)).balance).toBe(before.balance);
  expect(await rows(page)).toHaveLength(144);
});

test("simultaneous returning tabs share a single offline commitment", async ({
  context,
}) => {
  const data = state();
  await context.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: PROGRESS_KEY, data },
  );
  const a = await context.newPage(),
    b = await context.newPage();
  await mockRandom(a, [604827]);
  await mockRandom(b, [1337]);
  await Promise.all([a.goto("/"), b.goto("/")]);
  await collected(a, 6);
  await collected(b, 6);
  const result = await saved(a);
  expect(result.balance).toBe(
    result.history
      .filter((e) => e.source === "offline")
      .reduce((s, e) => s + evaluate(e.number).totalEP, 0),
  );
  expect(result.offline.report.rolls).toBe(6);
  await a.close();
  await b.close();
});

test("an online tab and continuous visible heartbeats never produce offline income", async ({
  page,
}) => {
  await away(page);
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ at: Date.now(), visible: true }),
      ),
    PRESENCE_PREFIX + testProfile.id + ":other",
  );
  await page.clock.install();
  await page.goto("/");
  await expect
    .poll(async () => (await saved(page)).offline.lastSeenAt)
    .toBeGreaterThan(Date.now() - 60000);
  expect(await rows(page)).toHaveLength(0);
  await page.clock.fastForward(3600000);
  await expect
    .poll(async () => (await saved(page)).offline.lastSeenAt)
    .toBeGreaterThan(Date.now() + 3500000);
  expect(await rows(page)).toHaveLength(0);
});

test("a hidden tab earns on return but a visible Shop page does not count as offline", async ({
  page,
}) => {
  await away(page, 0);
  await page.goto("/#shop");
  await expect
    .poll(async () => (await saved(page)).offline.lastSeenAt)
    .toBeGreaterThan(Date.now() - 5000);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(async () => (await saved(page)).offline.lastSeenAt)
    .toBeGreaterThan(Date.now());
  await page.clock.fastForward(1200100);
  expect(await rows(page)).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await collected(page, 2);
});

test("failed settlement retains the exact committed numbers and retries without rerolling or losing a manual commitment", async ({
  page,
}) => {
  const now = Date.now(),
    pending = {
      id: "manual",
      number: 1337,
      startedAt: now,
      rollMS: 45000,
      cooldownMS: 60000,
    };
  await away(page, 60, { pendingRoll: pending, cooldownUntil: now + 105000 });
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    window.failOffline = true;
    Storage.prototype.setItem = function (k, v) {
      if (
        window.failOffline &&
        k === key &&
        JSON.parse(v).history.some((e) => e.source === "offline")
      )
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry offline rewards" }),
  ).toBeVisible();
  const committed = (await saved(page)).offline.batch;
  expect(committed.numbers).toEqual(Array(6).fill(604827));
  expect((await saved(page)).balance).toBe(0);
  await page.evaluate(() => {
    window.failOffline = false;
  });
  await page.getByRole("button", { name: "Retry offline rewards" }).click();
  await collected(page, 6);
  expect((await saved(page)).pendingRoll).toEqual(pending);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  expect((await saved(page)).balance).toBe(6 * 4663 + 100177458);
});

test("an interrupted saved batch resumes its IDs and numbers across reload with no extra RNG draw", async ({
  page,
}) => {
  const data = state(0);
  data.offline.batch = {
    id: "retained",
    since: Date.now() - 1200000,
    numbers: [121212, 235959],
    index: 0,
    ep: 0,
    newBadges: 0,
  };
  await seedProgress(page, data);
  await mockRandom(page, [1337]);
  await page.goto("/");
  await collected(page, 2);
  expect((await rows(page)).map((e) => [e.id, e.number])).toEqual([
    ["retained:0", 121212],
    ["retained:1", 235959],
  ]);
  await page.reload();
  expect(await rows(page)).toHaveLength(2);
  expect((await saved(page)).discovered).toContain("INFINITE_LAST_SECOND");
});

test("new premium cosmetics share rarity previews, preserve ownership and respect reduced motion on mobile", async ({
  page,
}) => {
  await seedProgress(page, { balance: 40000000, totalEarned: 40000000 });
  await page.goto("/#shop");
  await expect(page.locator(".aura-preview .number-box")).toHaveCount(7);
  await page.getByLabel("Cosmetic preview rarity").selectOption("godly");
  await expect(page.locator('.aura-preview [data-tier="godly"]')).toHaveCount(
    7,
  );
  for (const id of ["eclipse", "prism", "offline-roller"]) {
    await page.locator(`[data-product="${id}"] button`).click();
    await page
      .getByRole("button", { name: "Confirm purchase", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  expect((await saved(page)).balance).toBe(
    25000000 -
      ["eclipse", "prism", "offline-roller"].reduce(
        (sum, id) => sum + shopProducts.find((p) => p.id === id).price,
        0,
      ),
  );
  expect((await saved(page)).equipped).toBe("prism");
  await page.reload();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  for (const id of ["eclipse", "prism"]) {
    const box = page.locator(`[data-product="${id}"] .number-box`);
    await expect(box).toHaveAttribute("data-cosmetic", id);
    expect(
      await box.evaluate((e) => e.getAnimations({ subtree: true }).length),
    ).toBe(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
});

test("deletion removes offline earnings, commitments and presence without later resurrection", async ({
  page,
}) => {
  await away(page);
  await page.goto("/");
  await collected(page, 6);
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account & progress", exact: true })
    .click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toBeNull();
  expect(
    await page.evaluate(
      (prefix) => Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
      PRESENCE_PREFIX,
    ),
  ).toEqual([]);
  await page.clock.install();
  await page.clock.fastForward(1800000);
  expect(await saved(page)).toBeNull();
});
