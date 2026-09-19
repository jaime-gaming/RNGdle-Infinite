import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { flywheelForDraw } from "../src/flywheel.js";
import { shopProducts } from "../src/shop-data.js";
import { chanceLabels, formatPercent, POPULATION } from "../src/probability.js";
import { createGameIndex } from "../src/game-index.js";
import { originalsByNumber } from "../src/infinite-badges.js";
import manifest from "../src/data/game-index.json" with { type: "json" };
import { evaluate, inflate } from "./helpers/index.js";
import { seedProgress } from "./helpers/progress.js";
import { mockRandom } from "./helpers/random-roll.js";
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const rolls = (p) => p.history.filter((e) => e.type === "roll");
const settled = (p) =>
  expect(p.locator(".roll-experience")).toHaveAttribute("data-settled", "true");
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const pending = (id, flywheel = "charge") => ({
  id,
  number: 604827,
  startedAt: 1000,
  rollMS: 45000,
  cooldownMS: flywheel === "boost" ? 0 : 60000,
  ...(flywheel ? { flywheel } : {}),
});
const complete = (id) => ({
  type: "complete",
  id,
  at: 46000,
  cooldownUntil: 106000,
  result: evaluate(604827),
});

test("chance labels preserve exact endpoints, rare outcomes, independence and non-guaranteed common badges", () => {
  expect(chanceLabels(1)).toEqual({
    percent: "0.0001%",
    frequency: "1 in 1,000,001",
    outcomes: "1 of 1,000,001 possible numbers",
  });
  expect(chanceLabels(81)).toMatchObject({
    percent: "0.0081%",
    frequency: "About 1 in 12,346",
  });
  expect(chanceLabels(14)).toMatchObject({
    percent: "0.0014%",
    frequency: "About 1 in 71,429",
  });
  expect(chanceLabels(900000).frequency).toBe("About 1 in 1.11");
  expect(chanceLabels(1000000)).toMatchObject({
    percent: "99.9999%",
    frequency: "Almost every roll, not guaranteed",
  });
  expect(chanceLabels(0)).toMatchObject({
    percent: "0%",
    frequency: "No matching outcomes",
  });
  expect(chanceLabels(POPULATION)).toMatchObject({
    percent: "100%",
    frequency: "1 in 1",
  });
  expect(formatPercent(0.00000001)).toBe("<0.000001");
  expect(formatPercent(99.99999999)).toBe(">99.999999");
  for (const count of [-1, 1.5, NaN, POPULATION + 1])
    expect(() => chanceLabels(count)).toThrow();
  expect(() => chanceLabels(1, 0)).toThrow();
});

test("tier chances are derived from all effective scores even when cached manifest counts are stale", () => {
  const ep = inflate("ep"),
    badges = inflate("badge"),
    view = new DataView(ep);
  const counts = Array(8).fill(0),
    examples = Array(8).fill(null);
  for (let n = 0; n < POPULATION; n++) {
    const score =
      view.getUint32(n * 4, true) +
      (originalsByNumber.get(n) ?? []).reduce((sum, b) => sum + b.ep, 0);
    const tier = manifest.tiers.findLastIndex((t) => score >= t.minEP);
    counts[tier]++;
    examples[tier] ??= n;
  }
  expect(counts).toEqual([
    10114, 489889, 250019, 149965, 50003, 40011, 7925, 2075,
  ]);
  const original = manifest.tiers.map((t) => t.count);
  try {
    manifest.tiers.forEach((t) => (t.count = 0));
    const game = createGameIndex(ep, badges);
    for (let i = 0; i < 8; i++) {
      const result = game.evaluate(examples[i]);
      expect(result.tierCount).toBe(counts[i]);
      expect(result.tierProbability).toBe((100 * counts[i]) / POPULATION);
      expect(result.totalEP).toBe(evaluate(examples[i]).totalEP);
    }
  } finally {
    manifest.tiers.forEach((t, i) => (t.count = original[i]));
  }
});

test("Flywheel migration validates charge and zero-cooldown snapshots without rewriting legacy prices or progress", () => {
  const legacy = {
    ...emptyProgress(),
    owned: ["starfall", "quickwind-1"],
    balance: 12345,
    totalEarned: 212345,
    history: [
      {
        id: "old-price",
        type: "purchase",
        at: 1000,
        productId: "starfall",
        name: "Starfall",
        ep: 125000,
      },
    ],
    pendingRoll: pending("old", null),
  };
  delete legacy.flywheelCharge;
  const parsed = parseProgress(JSON.stringify(legacy));
  expect(parsed.flywheelCharge).toBe(0);
  expect(parsed.balance).toBe(12345);
  expect(parsed.history[0].ep).toBe(125000);
  expect(parsed.owned).toEqual(legacy.owned);
  expect(parsed.pendingRoll).toEqual(legacy.pendingRoll);
  for (const flywheelCharge of [-1, 5, 0.5, "4"])
    expect(() =>
      parseProgress(
        JSON.stringify({ ...legacy, owned: ["flywheel"], flywheelCharge }),
      ),
    ).toThrow();
  const boost = {
    ...legacy,
    owned: ["flywheel"],
    flywheelCharge: 0,
    pendingRoll: pending("boost", "boost"),
  };
  expect(parseProgress(JSON.stringify(boost)).pendingRoll).toEqual(
    boost.pendingRoll,
  );
  for (const change of [
    { flywheel: undefined, cooldownMS: 0 },
    { flywheel: "charge", cooldownMS: 0 },
    { flywheel: "boost", cooldownMS: 60000 },
    { flywheel: "arbitrary", cooldownMS: 60000 },
  ])
    expect(() =>
      parseProgress(
        JSON.stringify({
          ...boost,
          pendingRoll: { ...boost.pendingRoll, ...change },
        }),
      ),
    ).toThrow();
});

test("two complete Flywheel cycles require four distinct eligible completions each, never offline or pre-purchase rolls", () => {
  let p = { ...emptyProgress(), balance: 1000000, totalEarned: 1000000 };
  p = applyProgress(p, { type: "buy", id: "flywheel" });
  expect(p.balance).toBe(
    1000000 - shopProducts.find((item) => item.id === "flywheel").price,
  );
  expect(p.equipped).toBe("none");
  expect(p.flywheelCharge).toBe(0);
  for (let n = 0; n < 10; n++) {
    const boost = n % 5 === 4,
      id = `cycle-${n}`;
    expect(flywheelForDraw(p)).toBe(boost ? "boost" : "charge");
    p = {
      ...p,
      pendingRoll: pending(id, boost ? "boost" : "charge"),
      ...(boost ? { flywheelCharge: 0 } : {}),
    };
    p = applyProgress(p, complete(id));
    expect(p.flywheelCharge).toBe(boost ? 0 : (n % 5) + 1);
    expect(applyProgress(p, complete(id))).toBe(p);
    p = parseProgress(JSON.stringify(p));
  }
  // 10 credited rolls on top of whatever the Flywheel purchase left behind.
  expect(p.balance).toBe(
    1000000 -
      shopProducts.find((item) => item.id === "flywheel").price +
      10 * rolls(p)[0].ep,
  );
  expect(rolls(p)).toHaveLength(10);
  expect(rolls(p).filter((e) => e.flywheel === "boost")).toHaveLength(2);
  p = { ...p, pendingRoll: pending("before-buy", null) };
  expect(applyProgress(p, complete("before-buy")).flywheelCharge).toBe(0);
  p = { ...p, pendingRoll: pending("offline") };
  expect(
    applyProgress(p, { ...complete("offline"), source: "offline" })
      .flywheelCharge,
  ).toBe(0);
  expect(applyProgress(p, complete("different-id")).flywheelCharge).toBe(0);
});

test("four online completions charge a full-length fifth reveal with no cooldown, persistent across reloads", async ({
  page,
}) => {
  test.setTimeout(60000);
  await seedProgress(page, { owned: ["flywheel"] });
  await mockRandom(page, [604827]);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  for (let n = 0; n < 6; n++) {
    await expect(page.locator(".generate")).toBeEnabled();
    await page.locator(".generate").click();
    await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
    const before = await saved(page),
      run = before.pendingRoll,
      boost = n === 4;
    expect(run).toMatchObject({
      flywheel: boost ? "boost" : "charge",
      rollMS: 45000,
      cooldownMS: boost ? 0 : 60000,
    });
    expect(before.cooldownUntil).toBe(
      run.startedAt + 45000 + (boost ? 0 : 60000),
    );
    expect(before.flywheelCharge).toBe(boost ? 0 : n === 5 ? 0 : n);
    await page.clock.fastForward(44000);
    expect(rolls(await saved(page))).toHaveLength(n);
    await page.clock.runFor(1200);
    await settled(page);
    const after = await saved(page);
    expect(after.flywheelCharge).toBe(boost ? 0 : n === 5 ? 1 : n + 1);
    expect(after.balance).toBe((n + 1) * 4663);
    if (!boost) {
      await expect(page.locator(".generate")).toBeDisabled();
      await page.clock.fastForward(60000);
    }
    if (n === 3) {
      await page.unrouteAll({ behavior: "wait" });
      await mockRandom(page, [604827]);
      await page.reload();
      await expect(
        page.getByRole("progressbar", { name: "Flywheel charge" }),
      ).toHaveAttribute("value", "4");
      await expect(page.locator(".roll-hint")).toContainText("no cooldown");
    }
  }
  expect(
    rolls(await saved(page)).filter((e) => e.flywheel === "boost"),
  ).toHaveLength(1);
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toContainText([
    "Flywheel roll completed",
  ]);
});

test("concurrent tabs restore one boosted commitment, consume one charge and settle once", async ({
  page,
  context,
}) => {
  await seedProgress(page, { owned: ["flywheel"], flywheelCharge: 4 });
  const other = await context.newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await other.clock.install();
  await other.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await other.goto("/");
  await expect(page.locator(".generate")).toBeEnabled();
  await expect(other.locator(".generate")).toBeEnabled();
  await Promise.all([
    page.locator(".generate").evaluate((b) => b.click()),
    other.locator(".generate").evaluate((b) => b.click()),
  ]);
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.flywheel)
    .toBe("boost");
  const run = (await saved(page)).pendingRoll;
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    /digits|badges/,
  );
  await expect(other.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    /digits|badges/,
  );
  expect((await saved(other)).pendingRoll.id).toBe(run.id);
  await page.clock.fastForward(46000);
  await other.clock.fastForward(46000);
  await settled(page);
  await settled(other);
  const p = await saved(page);
  expect(p.flywheelCharge).toBe(0);
  expect(rolls(p)).toHaveLength(1);
  expect(p.balance).toBe(evaluate(run.number).totalEP);
  await other.close();
});

test("a failed boosted commit exposes nothing and retains all four charges for retry", async ({
  page,
}) => {
  await seedProgress(page, { owned: ["flywheel"], flywheelCharge: 4 });
  await page.goto("/");
  await page.evaluate((k) => {
    const write = Storage.prototype.setItem;
    window.failBoost = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === k && window.failBoost && JSON.parse(value).pendingRoll)
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }, PROGRESS_KEY);
  await page.locator(".generate").click();
  await expect(page.locator(".roll-load-error")).toContainText(
    "could not be committed",
  );
  expect((await saved(page)).flywheelCharge).toBe(4);
  expect((await saved(page)).pendingRoll).toBeNull();
  await expect(page.locator(".number-artifact")).toHaveCount(0);
  await page.evaluate(() => {
    window.failBoost = false;
  });
  await page.locator(".generate").click();
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.flywheel)
    .toBe("boost");
  expect((await saved(page)).flywheelCharge).toBe(0);
});

test("offline catch-up leaves saved Flywheel charge untouched", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: ["flywheel", "offline-roller"],
    flywheelCharge: 3,
    offline: { lastSeenAt: Date.now() - 7201000, batch: null, report: null },
  });
  await mockRandom(page, [604827]);
  await page.goto("/");
  await expect
    .poll(async () => rolls(await saved(page)).length, { timeout: 20000 })
    .toBe(12);
  await expect.poll(async () => (await saved(page)).offline.batch).toBeNull();
  const p = await saved(page);
  expect(p.flywheelCharge).toBe(3);
  expect(p.balance).toBe(12 * 4663);
  expect(rolls(p).every((e) => e.source === "offline" && !e.flywheel)).toBe(
    true,
  );
});

test("Auto-Roll uses Flywheel but reduced motion still reserves the full reveal deadline", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: ["flywheel", "auto-roll"],
    flywheelCharge: 3,
  });
  await mockRandom(page, [604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await expect(page.locator(".generate")).toBeEnabled();
  await page.getByRole("switch", { name: /Auto-Roll/ }).click();
  await page.clock.runFor(300);
  await expect.poll(async () => rolls(await saved(page)).length).toBe(1);
  await settled(page);
  expect((await saved(page)).flywheelCharge).toBe(4);
  await page.clock.fastForward(104000);
  expect(rolls(await saved(page))).toHaveLength(1);
  await page.clock.runFor(1700);
  await expect.poll(async () => rolls(await saved(page)).length).toBe(2);
  await settled(page);
  expect(rolls(await saved(page))[1].flywheel).toBe("boost");
  expect((await saved(page)).flywheelCharge).toBe(0);
  await page.clock.fastForward(43000);
  expect(rolls(await saved(page))).toHaveLength(2);
  await page.clock.runFor(2500);
  await expect.poll(async () => rolls(await saved(page)).length).toBe(3);
  await settled(page);
  expect((await saved(page)).flywheelCharge).toBe(1);
  await page.getByRole("switch", { name: /Auto-Roll/ }).click();
});

test("Flywheel purchase is confirmed, stays out of aura and timing slots, and renders on mobile without motion", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 1000000,
    totalEarned: 1000000,
    owned: ["starfall"],
    equipped: "starfall",
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#shop");
  const card = page.locator('[data-product="flywheel"]');
  await expect(card).toContainText("600,000 EP");
  await card.getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText("zero charge");
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const p = await saved(page);
  expect(p.balance).toBe(400000);
  expect(p.equipped).toBe("starfall");
  expect(p.flywheelCharge).toBe(0);
  await expect(page.getByTestId("roll-duration")).toHaveText("45s");
  await expect(page.getByTestId("cooldown-duration")).toHaveText("1:00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Flywheel charge" }),
  ).toHaveAttribute("value", "0");
  expect(
    await page
      .locator(".flywheel-meter>svg")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a boosted reveal survives reload with its committed number and fifteen-second deadline intact", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: [
      "flywheel",
      "quickwind-1",
      "quickwind-2",
      "quickwind-3",
      "clockwork-1",
      "clockwork-2",
      "clockwork-3",
    ],
    flywheelCharge: 4,
  });
  await mockRandom(page, [604827]);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await page.locator(".generate").click();
  await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
  const before = await saved(page);
  expect(before.pendingRoll).toMatchObject({
    rollMS: 15000,
    cooldownMS: 0,
    flywheel: "boost",
  });
  await page.clock.fastForward(5000);
  await page.unrouteAll({ behavior: "wait" });
  await mockRandom(page, [604827]);
  await page.reload();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    /digits|badges/,
  );
  expect((await saved(page)).pendingRoll).toEqual(before.pendingRoll);
  expect((await saved(page)).cooldownUntil).toBe(before.cooldownUntil);
  expect((await saved(page)).flywheelCharge).toBe(0);
  await page.clock.fastForward(9000);
  expect(rolls(await saved(page))).toHaveLength(0);
  await page.clock.runFor(1300);
  await settled(page);
  await expect(page.locator(".generate")).toBeEnabled();
  expect(rolls(await saved(page))).toHaveLength(1);
  expect((await saved(page)).balance).toBe(4663);
  await page.locator(".generate").click();
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.flywheel)
    .toBe("charge");
  expect((await saved(page)).pendingRoll).toMatchObject({
    rollMS: 15000,
    cooldownMS: 15000,
  });
});

test("buying Flywheel mid-reveal does not charge an already committed roll or alter its cooldown", async ({
  page,
}) => {
  await seedProgress(page, { balance: 1000000, totalEarned: 1000000 });
  await mockRandom(page, [604827]);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await page.locator(".generate").click();
  await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
  const before = await saved(page);
  expect(before.pendingRoll.flywheel).toBeUndefined();
  await nav(page, "Shop");
  await page.locator('[data-product="flywheel"] button').click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).pendingRoll).toEqual(before.pendingRoll);
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await page.clock.fastForward(46000);
  await settled(page);
  const after = await saved(page);
  expect(after.flywheelCharge).toBe(0);
  expect(after.balance).toBe(404663);
  expect(after.cooldownUntil).toBe(before.cooldownUntil);
  await expect(page.locator(".generate")).toBeDisabled();
});
