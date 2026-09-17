import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { mockRandom, showRoll, startRoll } from "./helpers/random-roll.js";
import { evaluate, inflate } from "./helpers/index.js";
import { createGameIndex } from "../src/game-index.js";
import {
  infiniteBadges,
  allBadgeMetadata,
  originalsByNumber,
} from "../src/infinite-badges.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
import { POPULATION } from "../src/probability.js";

const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const rolls = async (p) =>
  (await saved(p)).history.filter((e) => e.type === "roll");
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const settled = (p) =>
  expect(p.locator(".roll-experience")).toHaveAttribute("data-settled", "true");
const auto = (p) => p.getByRole("switch", { name: "Auto-Roll", exact: true });
async function readyAuto(p, words = [604827, 1337]) {
  await seedProgress(p, { owned: ["auto-roll"] });
  await mockRandom(p, words);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto("/");
  await expect(
    p.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await p.clock.install();
  await p.clock.pauseAt(new Date(Date.now() + 1000));
}
async function enable(p) {
  await auto(p).click();
  await p.clock.runFor(300);
  await settled(p);
}

test("Auto-Roll costs 5,000,000 EP, requires confirmation, does not equip, and persists as an off-by-default tool", async ({
  page,
}) => {
  expect(shopProducts.find((p) => p.id === "auto-roll")).toMatchObject({
    price: 5000000,
    kind: "utility",
  });
  await seedProgress(page, { balance: 5000000, totalEarned: 5000000 });
  await page.goto("/#shop");
  const card = page.locator('[data-product="auto-roll"]');
  await card.getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("5,000,000 EP");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).owned).toEqual([]);
  await card.getByRole("button").click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card.getByRole("button")).toBeDisabled();
  const after = await saved(page);
  expect(after.balance).toBe(0);
  expect(after.equipped).toBe("none");
  expect(after.owned).toEqual(["auto-roll"]);
  expect(after.history.filter((e) => e.type === "purchase")).toHaveLength(1);
  await nav(page, "History");
  await expect(page.locator('[data-event-type="purchase"]')).toContainText(
    "Auto-Roll",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await expect(auto(page)).toHaveAttribute("aria-checked", "false");
  expect((await saved(page)).pendingRoll).toBeNull();
});

test("automatic rolls respect the full cadence with reduced motion, award once and stop on demand", async ({
  page,
}) => {
  await readyAuto(page);
  await enable(page);
  expect((await rolls(page)).map((e) => e.number)).toEqual([604827]);
  await page.clock.fastForward(104000);
  expect(await rolls(page)).toHaveLength(1);
  await page.clock.runFor(1500);
  await expect.poll(async () => (await rolls(page)).length).toBe(2);
  await settled(page);
  expect((await rolls(page)).map((e) => e.number)).toEqual([604827, 1337]);
  expect((await saved(page)).balance).toBe(4663 + 100177458);
  await auto(page).click();
  await page.clock.fastForward(210000);
  expect(await rolls(page)).toHaveLength(2);
  await expect(auto(page)).toHaveAttribute("aria-checked", "false");
});

test("Auto-Roll pauses away from the Roll page and in a hidden tab, and resets off on reload", async ({
  page,
}) => {
  await readyAuto(page);
  await enable(page);
  await nav(page, "Badges");
  await page.clock.fastForward(106000);
  expect(await rolls(page)).toHaveLength(1);
  await page.getByRole("button", { name: "RNGdle Infinite home" }).click();
  await page.clock.runFor(300);
  await expect.poll(async () => (await rolls(page)).length).toBe(2);
  await settled(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(106000);
  expect(await rolls(page)).toHaveLength(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(300);
  await expect.poll(async () => (await rolls(page)).length).toBe(3);
  await settled(page);
  await page.reload();
  await expect(auto(page)).toHaveAttribute("aria-checked", "false");
  await page.clock.fastForward(106000);
  expect(await rolls(page)).toHaveLength(3);
});

test("stopping Auto-Roll during a reveal cannot discard its committed number", async ({
  page,
}) => {
  await seedProgress(page, { owned: ["auto-roll"] });
  await startRoll(page, 121212);
  const pending = (await saved(page)).pendingRoll;
  await auto(page).click();
  await auto(page).click();
  expect((await saved(page)).pendingRoll).toEqual(pending);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  expect((await rolls(page)).map((e) => e.id)).toEqual([pending.id]);
  await page.clock.fastForward(106000);
  expect(await rolls(page)).toHaveLength(1);
});

test("Auto-Roll stops on a failed commit without exposing a new number", async ({
  page,
}) => {
  await readyAuto(page);
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await auto(page).click();
  await page.clock.runFor(300);
  await expect(page.locator(".roll-load-error")).toContainText(
    "No number was revealed",
  );
  await expect(auto(page)).toHaveAttribute("aria-checked", "false");
  expect(await rolls(page)).toHaveLength(0);
  expect((await saved(page)).pendingRoll).toBeNull();
  await expect(page.locator(".number-artifact")).toHaveCount(0);
});

test("two account tabs using Auto-Roll share one committed draw and one reward", async ({
  page,
  context,
}) => {
  await readyAuto(page);
  const other = await context.newPage();
  await mockRandom(other, [1337]);
  await other.emulateMedia({ reducedMotion: "reduce" });
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await other.clock.install();
  await other.clock.pauseAt(new Date(Date.now() + 1000));
  await Promise.all([auto(page).click(), auto(other).click()]);
  await Promise.all([page.clock.runFor(300), other.clock.runFor(300)]);
  await settled(page);
  await settled(other);
  const events = await rolls(page);
  expect(events).toHaveLength(1);
  expect((await saved(page)).balance).toBe(evaluate(events[0].number).totalEP);
  expect((await rolls(other))[0].id).toBe(events[0].id);
  await other.close();
});

test("new original rules and full-population odds are exact, and their EP is added to the canonical distribution", () => {
  const counts = [0, 0],
    raw = new DataView(inflate("ep")),
    game = createGameIndex(inflate("ep"), inflate("badge"));
  const tiers = game.tiers.map((t) => ({ ...t, count: 0 }));
  const ranked = [];
  for (let n = 0; n < POPULATION; n++) {
    const s = String(n);
    const pendulum =
      s.length === 6 && s[0] !== s[1] && s === s.slice(0, 2).repeat(3);
    const last =
      s.length === 6 &&
      s.slice(2) === "5959" &&
      Number(s.slice(0, 2)) >= 10 &&
      Number(s.slice(0, 2)) <= 23;
    counts[0] += Number(pendulum);
    counts[1] += Number(last);
    const extra = (pendulum ? 25000 : 0) + (last ? 75000 : 0),
      base = raw.getUint32(n * 4, true);
    const score = base + extra;
    ranked.push(score);
    tiers.findLast((t) => score >= t.minEP).count++;
    const actual = originalsByNumber.get(n) ?? [];
    if (actual.reduce((sum, b) => sum + b.ep, 0) !== extra)
      throw new Error(`Wrong original membership at ${n}`);
    if (extra) {
      const r = game.evaluate(n);
      expect(r.totalEP).toBe(score);
      expect(
        r.badges.reduce((sum, b) => sum + (b.isScoring ? b.ep : 0), 0),
      ).toBe(score);
    }
  }
  expect(counts).toEqual([81, 14]);
  expect(game.tiers).toEqual(tiers);
  expect(allBadgeMetadata).toHaveLength(235);
  for (const [i, b] of infiniteBadges.entries()) {
    expect(b.matchingNumbers).toBe(counts[i]);
    expect(b.probabilityPercent).toBe((100 * counts[i]) / POPULATION);
  }
  for (const n of [121212, 105959, 235959]) {
    const r = game.evaluate(n);
    expect(r.rank.atOrAbove).toBe(ranked.filter((v) => v >= r.totalEP).length);
    expect(r.tierProbability).toBe(
      (100 * tiers.find((t) => t.id === r.tier).count) / POPULATION,
    );
  }
  for (const n of [0, 5959, 95959, 1000000, 111111, 245959, 123456])
    expect(originalsByNumber.has(n)).toBe(false);
});

test("both new badges unlock, render in details/history and persist, without retroactive awards", async ({
  page,
}) => {
  await seedProgress(page);
  await showRoll(page, 121212);
  await nav(page, "Badges");
  await page.getByRole("textbox", { name: "Search badges" }).fill("Pendulum");
  await expect(page.locator(".badge-card")).toHaveCount(1);
  await page.locator(".badge-card").click();
  await expect(page.getByRole("dialog")).toContainText("25,000 EP");
  await expect(page.getByRole("dialog")).toContainText("0.0081%");
  await page.keyboard.press("Escape");
  await page.reload();
  expect((await saved(page)).discovered).toContain("INFINITE_PENDULUM");
  await nav(page, "History");
  await expect(page.locator('[data-event-type="unlock"]')).toContainText(
    "Pendulum",
  );
  const legacy = applyProgress(emptyProgress(), {
    type: "complete",
    id: "old",
    at: 1000,
    result: {
      ...evaluate(121212),
      badges: evaluate(121212).badges.filter(
        (b) => !b.id.startsWith("INFINITE_"),
      ),
      totalEP: 401228,
    },
    cooldownUntil: 0,
  });
  expect(parseProgress(JSON.stringify(legacy)).discovered).not.toContain(
    "INFINITE_PENDULUM",
  );
  const state = applyProgress(legacy, {
    type: "complete",
    id: "new",
    at: 2000,
    result: evaluate(105959),
    cooldownUntil: 0,
  });
  expect(parseProgress(JSON.stringify(state)).discovered).toContain(
    "INFINITE_LAST_SECOND",
  );
  expect(state.history.find((e) => e.id === "new").badges).toContain(
    "INFINITE_LAST_SECOND",
  );
});

test("Auto-Roll uses purchased timings and Last Second appears in the actual badge detail UI", async ({
  page,
}) => {
  const owned = [
    "auto-roll",
    ...shopProducts
      .filter((p) => ["roll", "cooldown"].includes(p.kind))
      .map((p) => p.id),
  ];
  await seedProgress(page, { owned });
  await mockRandom(page, [235959, 121212]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await auto(page).click();
  await page.clock.runFor(300);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  expect((await saved(page)).pendingRoll).toMatchObject({
    rollMS: 15000,
    cooldownMS: 15000,
  });
  await page.clock.runFor(15000);
  await settled(page);
  expect(await rolls(page)).toHaveLength(1);
  await page.clock.fastForward(14900);
  expect(await rolls(page)).toHaveLength(1);
  await page.clock.runFor(500);
  await expect
    .poll(async () => {
      await page.clock.runFor(300);
      return (await saved(page)).pendingRoll?.number;
    })
    .toBe(121212);
  await auto(page).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  await nav(page, "Badges");
  await page
    .getByRole("textbox", { name: "Search badges" })
    .fill("Last Second");
  await expect(page.locator(".badge-card")).toHaveCount(1);
  await page.locator(".badge-card").click();
  await expect(page.getByRole("dialog")).toContainText("75,000 EP");
  await expect(page.getByRole("dialog")).toContainText("0.0014%");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The badge collection" }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  expect((await saved(page)).discovered).toContain("INFINITE_LAST_SECOND");
});

test("deleting the account cancels a queued automatic start and removes its switch", async ({
  page,
}) => {
  await readyAuto(page);
  await auto(page).click();
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
  await expect(auto(page)).toHaveCount(0);
  await page.clock.fastForward(106000);
  expect(await saved(page)).toBeNull();
  await expect(page.locator(".number-artifact")).toHaveCount(0);
});
