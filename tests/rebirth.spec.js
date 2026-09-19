import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  parseProgress,
  applyProgress,
  recoverUnsavedRolls,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  BADGE_TOTAL,
  REBIRTH_VISIBLE_AT,
  rebirthBlocker,
  discoveredCount,
} from "../src/rebirth.js";
import { cooldownFraction, parseCooldownWindow } from "../src/cooldown.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
import { rollReceipt } from "../src/gameplay-loop.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom } from "./helpers/random-roll.js";
const ids = allBadgeMetadata.map((b) => b.id);
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const state = () => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids,
  balance: 50000000,
  totalEarned: 50000000,
  owned: shopProducts.map((p) => p.id),
  equipped: "prism",
  flywheelCharge: 4,
  goalId: null,
});
const action = { type: "rebirth", expectedRebirths: 0, at: 200000 };
async function confirm(p) {
  await p.getByRole("button", { name: "Rebirth", exact: true }).click();
  await p
    .getByRole("textbox", { name: "Type REBIRTH to confirm" })
    .fill("REBIRTH");
}
const scale = (p) =>
  p
    .locator(".cooldown-fill")
    .evaluate((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
async function start(p, extra = {}) {
  await seedProgress(p, extra);
  await mockRandom(p, [604827]);
  await p.clock.install();
  await p.clock.pauseAt(new Date(Date.now() + 1000));
  await p.goto("/");
  await p.locator(".generate").click();
  await expect.poll(async () => !!(await saved(p)).pendingRoll).toBe(true);
}

test("rebirth requires every unique valid badge and a finished commitment and cooldown", () => {
  expect(BADGE_TOTAL).toBe(235);
  expect(REBIRTH_VISIBLE_AT).toBe(141);
  expect(
    discoveredCount({ ...state(), discovered: Array(235).fill(ids[0]) }),
  ).toBe(1);
  for (const discovered of [
    ids.slice(0, 140),
    ids.slice(0, 141),
    ids.slice(0, 234),
    [...ids.slice(0, 234), "FAKE"],
  ])
    expect(() => applyProgress({ ...state(), discovered }, action)).toThrow(
      "all 235",
    );
  expect(rebirthBlocker(state(), 200000)).toBe("");
  expect(() =>
    applyProgress({ ...state(), pendingRoll: { id: "pending" } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...state(), offline: { batch: { id: "batch" } } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...state(), cooldownUntil: 200001 }, action),
  ).toThrow("cooldown");
  expect(() => applyProgress({ ...state(), rebirths: 1 }, action)).toThrow(
    "older cycle",
  );
});

test("rebirth resets gameplay but retains profile/history, records once, and never resurrects old rewards", () => {
  const old = applyProgress(
    { ...state(), discovered: [] },
    {
      type: "complete",
      id: "old",
      at: 1000,
      cooldownUntil: 106000,
      result: evaluate(604827),
    },
  );
  const before = { ...old, discovered: ids };
  const next = applyProgress(before, action);
  expect(next).toMatchObject({
    balance: 0,
    totalEarned: 0,
    owned: [],
    discovered: [],
    equipped: "none",
    cooldownUntil: 0,
    cooldownWindow: null,
    flywheelCharge: 0,
    goalId: null,
    pendingRoll: null,
    offline: null,
    rebirths: 1,
    profile: testProfile,
  });
  expect(next.history.slice(0, -1)).toEqual(before.history);
  expect(next.history.at(-1)).toMatchObject({ type: "rebirth", count: 1 });
  expect(parseProgress(JSON.stringify(next))).toEqual(next);
  expect(recoverUnsavedRolls(next, before)).toBe(next);
  expect(rollReceipt(next)).toBeNull();
  expect(
    applyProgress(next, {
      type: "complete",
      id: "old",
      at: 200001,
      cooldownUntil: 200001,
      result: evaluate(604827),
    }),
  ).toBe(next);
  const repeated = applyProgress(next, {
    type: "complete",
    id: "new-cycle",
    at: 300000,
    cooldownUntil: 405000,
    result: evaluate(604827),
  });
  expect(repeated.discovered).toHaveLength(evaluate(604827).badges.length);
  expect(repeated.history.at(-1).type).toBe("unlock");
  expect(() => applyProgress(next, action)).toThrow();
});

test("old saves default to zero rebirths and optional bar snapshots cannot shorten a deadline", () => {
  const legacy = { ...emptyProgress() };
  delete legacy.rebirths;
  delete legacy.cooldownWindow;
  expect(parseProgress(JSON.stringify(legacy)).rebirths).toBe(0);
  for (const rebirths of [-1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      parseProgress(JSON.stringify({ ...legacy, rebirths })),
    ).toThrow();
  expect(
    parseCooldownWindow({ startsAt: 45000, endsAt: 105000 }, 105000, null),
  ).toEqual({ startsAt: 45000, endsAt: 105000 });
  for (const window of [
    { startsAt: 0, endsAt: 105000 },
    { startsAt: -1, endsAt: 59999 },
    { startsAt: 45000, endsAt: 100000 },
    { startsAt: 60000, endsAt: 45000 },
  ])
    expect(parseCooldownWindow(window, 105000, null)).toBeNull();
  const p = parseProgress(
    JSON.stringify({
      ...legacy,
      cooldownUntil: 999999,
      cooldownWindow: { startsAt: 0, endsAt: 0 },
    }),
  );
  expect(p.cooldownUntil).toBe(999999);
  expect(p.cooldownWindow).toBeNull();
});

test("bar maths starts at zero after the reveal, reaches one only at readiness, and handles Flywheel", () => {
  const window = { startsAt: 45000, endsAt: 105000 };
  expect(cooldownFraction(window, 0)).toBe(0);
  expect(cooldownFraction(window, 45000)).toBe(0);
  expect(cooldownFraction(window, 75000)).toBe(0.5);
  expect(cooldownFraction(window, 105000)).toBe(1);
  expect(cooldownFraction(window, 200000)).toBe(1);
  expect(cooldownFraction({ startsAt: 15000, endsAt: 15000 }, 16000)).toBe(0);
  expect(cooldownFraction({ startsAt: 15000, endsAt: 30000 }, 22500)).toBe(0.5);
});

for (const count of [140, 141, 234, 235])
  test(`rebirth visibility at ${count} of 235 badges ignores collection filters`, async ({
    page,
  }) => {
    await seedProgress(page, { discovered: ids.slice(0, count) });
    await page.goto("/#badges");
    const button = page.getByRole("button", { name: "Rebirth", exact: true });
    if (count < 141) await expect(button).toHaveCount(0);
    else if (count < 235) await expect(button).toBeDisabled();
    else await expect(button).toBeEnabled();
    await page
      .getByRole("textbox", { name: "Search badges" })
      .fill("nothing matches this");
    await expect(page.locator(".badge-card")).toHaveCount(0);
    if (count >= 141) await expect(button).toBeVisible();
    else await expect(button).toHaveCount(0);
  });

test("full reset requires typed confirmation, persists once, preserves history and permits rediscovery", async ({
  page,
}) => {
  const initial = applyProgress(
    { ...state(), discovered: [] },
    {
      type: "complete",
      id: "historic",
      at: 1000,
      cooldownUntil: 0,
      result: evaluate(604827),
    },
  );
  initial.discovered = ids;
  await seedProgress(page, initial);
  await mockRandom(page, [604827]);
  await page.goto("/#badges");
  await page.getByRole("button", { name: "Rebirth", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("cosmetics");
  await expect(
    page.getByRole("button", { name: "Confirm rebirth", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Type REBIRTH to confirm" })
    .fill("rebirth");
  await expect(
    page.getByRole("button", { name: "Confirm rebirth", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel rebirth" }).click();
  expect((await saved(page)).rebirths).toBe(0);
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  const after = await saved(page);
  expect(after.balance).toBe(0);
  expect(after.owned).toEqual([]);
  expect(after.discovered).toEqual([]);
  expect(after.history.slice(0, -1)).toEqual(initial.history);
  await nav(page, "History");
  await expect(page.locator('[data-event-type="rebirth"]')).toContainText(
    "Rebirth 1",
  );
  await nav(page, "Badges");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await mockRandom(page, [604827]);
  await page.reload();
  expect((await saved(page)).rebirths).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "RNGdle Infinite home" }).click();
  await page.locator(".generate").click();
  await expect.poll(async () => (await saved(page)).balance).toBe(4663);
  expect((await saved(page)).discovered).toHaveLength(
    evaluate(604827).badges.length,
  );
});

test("a failed rebirth save leaves all progress intact and allows retry", async ({
  page,
}) => {
  await seedProgress(page, state());
  await page.goto("/#badges");
  await expect
    .poll(async () => (await saved(page)).offline?.lastSeenAt)
    .toBeTruthy();
  const before = await saved(page);
  await page.evaluate((k) => {
    const write = Storage.prototype.setItem;
    window.failRebirth = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === k && window.failRebirth && JSON.parse(value).rebirths > 0)
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }, PROGRESS_KEY);
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "progress has not been reset",
  );
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() => {
    window.failRebirth = false;
  });
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
});

test("simultaneous rebirths are applied once and reset the other tab without deleting the profile", async ({
  page,
  context,
}) => {
  await seedProgress(page, state());
  await page.goto("/#badges");
  const other = await context.newPage();
  await other.goto("/#badges");
  await confirm(page);
  await confirm(other);
  await Promise.all([
    page
      .getByRole("button", { name: "Confirm rebirth", exact: true })
      .evaluate((b) => b.click()),
    other
      .getByRole("button", { name: "Confirm rebirth", exact: true })
      .evaluate((b) => b.click()),
  ]);
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  await expect(other.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).profile).toEqual(testProfile);
  expect(
    (await saved(page)).history.filter((e) => e.type === "rebirth"),
  ).toHaveLength(1);
  await other.close();
});

test("a tab missing the rebirth storage event cannot spend or restore old-cycle progress", async ({
  page,
  context,
}) => {
  await seedProgress(page, state());
  await page.goto("/#badges");
  const other = await context.newPage();
  await other.addInitScript(() =>
    window.addEventListener(
      "storage",
      (e) => e.stopImmediatePropagation(),
      true,
    ),
  );
  await other.goto("/#shop");
  await other
    .getByRole("button", { name: "Use original appearance", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).equipped).toBe("none");
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  await other.locator('[data-product="starfall"] button').click();
  await expect(other.locator(".toast")).toContainText("changed");
  expect((await saved(page)).owned).toEqual([]);
  expect((await saved(page)).balance).toBe(0);
  await other.close();
});

test("rebirth waits for cooldown and remains usable on mobile without motion", async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const now = await page.evaluate(() => Date.now());
  await seedProgress(page, { ...state(), cooldownUntil: now + 10000 });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#badges");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeEnabled();
  await confirm(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).rebirths).toBe(0);
});

test("the moving bar uses the cooldown only, is smooth between seconds, survives reload and mid-cooldown upgrades", async ({
  page,
}) => {
  await start(page, { balance: 1000000, totalEarned: 1000000 });
  const pending = (await saved(page)).pendingRoll;
  await page.clock.fastForward(45100);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  expect(await scale(page)).toBeLessThan(0.02);
  await page.clock.fastForward(29800);
  await page.clock.runFor(100);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  const fraction = await scale(page);
  await page.clock.runFor(300);
  expect(await scale(page)).toBeGreaterThan(fraction);
  await nav(page, "Shop");
  await page.locator('[data-product="clockwork-1"] button').click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).cooldownWindow).toEqual({
    startsAt: pending.startedAt + 45000,
    endsAt: pending.startedAt + 105000,
  });
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await page.clock.runFor(300);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  await expect(page.locator(".generate")).toBeDisabled();
  await page.clock.fastForward(30000);
  await expect(page.locator(".generate")).toBeEnabled();
});

test("reduced motion does not advance the bar before reveal time, and Flywheel has no fake cooldown bar", async ({
  page,
}) => {
  await start(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  expect(await scale(page)).toBe(0);
  await page.clock.fastForward(44000);
  expect(await scale(page)).toBe(0);
  await page.clock.fastForward(31000);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  await expect(page.locator(".generate")).toBeDisabled();
});

test("a committed zero-cooldown Flywheel reveal never shows a moving cooldown bar", async ({
  page,
}) => {
  await start(page, { owned: ["flywheel"], flywheelCharge: 4 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect(page.locator(".cooldown-fill")).toHaveCount(0);
  await expect(page.locator(".generate")).toBeDisabled();
  await page.clock.fastForward(45100);
  await expect(page.locator(".generate")).toBeEnabled();
});

test("rebuying items in a new cycle retains both historical purchase prices and distinct receipts", () => {
  const first = applyProgress(
    { ...emptyProgress(), balance: 100000, totalEarned: 100000 },
    { type: "buy", id: "starfall", at: 1000 },
  );
  const reborn = applyProgress({ ...first, discovered: ids }, action);
  const second = applyProgress(
    { ...reborn, balance: 100000, totalEarned: 100000 },
    { type: "buy", id: "starfall", at: 300000 },
  );
  const purchases = parseProgress(JSON.stringify(second)).history.filter(
    (e) => e.type === "purchase",
  );
  expect(purchases).toHaveLength(2);
  const starfallPrice = shopProducts.find((p) => p.id === "starfall").price;
  expect(purchases.map((e) => e.ep)).toEqual([starfallPrice, starfallPrice]);
  expect(purchases[0].id).not.toBe(purchases[1].id);
});

test("registered rebirth fails closed without Web Locks", async ({ page }) => {
  await seedProgress(page, { ...state(), owned: [] });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/#badges");
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Web Locks");
  expect((await saved(page)).rebirths).toBe(0);
  expect((await saved(page)).discovered).toHaveLength(235);
});

test("guest rebirth refuses a failed guard write instead of partially resetting memory", async ({
  page,
}) => {
  await seedProgress(page, { ...state(), profile: null, owned: [] });
  await page.goto("/#badges");
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.failGuard = true;
    Storage.prototype.setItem = function (k, v) {
      if (this === sessionStorage && window.failGuard)
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  });
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "progress has not been reset",
  );
  await expect(
    page.getByRole("progressbar", { name: "Badge collection progress" }),
  ).toHaveAttribute("value", "235");
  await page.evaluate(() => {
    window.failGuard = false;
  });
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".roll-progress-links")).toContainText(
    "0 / 235 badges",
  );
  await expect(page.locator(".roll-progress-links")).toContainText("1 rebirth");
});
