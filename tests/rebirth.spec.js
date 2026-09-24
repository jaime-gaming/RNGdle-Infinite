import { test, expect } from "./helpers/clock.js";
import {
  emptyProgress,
  parseProgress,
  applyProgress,
  recoverUnsavedRolls,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  BADGE_TOTAL,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  REBIRTH_VISIBLE_AT,
  discoveredCount,
  rebirthBlocker,
  rebirthRequirement,
  ultraRebirthAvailable,
  ultraRebirthBlocker,
} from "../src/rebirth.js";
import { cooldownFraction, parseCooldownWindow } from "../src/cooldown.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
import { rollReceipt } from "../src/gameplay-loop.js";
import { skillForPet, skillSlots } from "../src/skills.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom } from "./helpers/random-roll.js";

const ids = allBadgeMetadata.map((b) => b.id);
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const state = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids,
  balance: 50000000,
  totalEarned: 50000000,
  owned: shopProducts.map((p) => p.id),
  equipped: "prism",
  flywheelCharge: 4,
  goalId: null,
  ...extra,
});
const action = { type: "rebirth", expectedRebirths: 0, at: 200000 };
async function confirm(p, word = "REBIRTH") {
  await p.getByRole("button", { name: "Rebirth", exact: true }).click();
  await p.getByRole("textbox", { name: `Type ${word} to confirm` }).fill(word);
}
const scale = (p) =>
  p
    .locator(".cooldown-fill")
    .evaluate((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
async function start(p, extra = {}) {
  await seedProgress(p, extra);
  await mockRandom(p, [604827]);
  await p.clock.pauseAt(new Date(Date.now() + 1000));
  await p.goto("/");
  await p.locator(".generate").click();
  await expect.poll(async () => !!(await saved(p)).pendingRoll).toBe(true);
}

test("the ladder climbs from half the collection to all of it", () => {
  expect(BADGE_TOTAL).toBe(235);
  // The icon shows up at 30%, the first rebirth asks for 50%.
  expect(REBIRTH_VISIBLE_AT).toBe(71);
  expect(REBIRTH_STEPS).toEqual([0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  expect(REBIRTH_TOTAL).toBe(6);
  expect(rebirthRequirement(0)).toEqual({
    rebirth: 1,
    percent: 50,
    badges: 118,
  });
  expect(rebirthRequirement(1)).toEqual({
    rebirth: 2,
    percent: 60,
    badges: 141,
  });
  expect(rebirthRequirement(2).badges).toBe(165);
  expect(rebirthRequirement(3).badges).toBe(188);
  expect(rebirthRequirement(4).badges).toBe(212);
  expect(rebirthRequirement(5)).toEqual({
    rebirth: 6,
    percent: 100,
    badges: 235,
  });
  expect(rebirthRequirement(6)).toBeNull();
  // Only unique, real badges count.
  expect(
    discoveredCount({ ...state(), discovered: Array(235).fill(ids[0]) }),
  ).toBe(1);
  // Below the current rung the panel says exactly how many are left.
  const below = { ...state(), discovered: ids.slice(0, 117) };
  expect(rebirthBlocker(below, 200000)).toMatch(/Discover 118 badges \(50%\)/);
  expect(() => applyProgress(below, action)).toThrow(/Discover/);
  // A committed roll, an offline batch or a running cooldown still blocks it.
  expect(() =>
    applyProgress({ ...state(), pendingRoll: { id: "pending" } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...state(), offline: { batch: { id: "batch" } } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...state(), cooldownUntil: 200001 }, action),
  ).toThrow("cooldown");
  expect(() =>
    applyProgress(
      { ...state(), rebirths: 1, discovered: ids.slice(0, 140) },
      {
        ...action,
        expectedRebirths: 1,
      },
    ),
  ).toThrow(/Discover 141 badges \(60%\)/);
  expect(rebirthBlocker(state(), 200000)).toBe("");
  expect(() => applyProgress({ ...state(), rebirths: 1 }, action)).toThrow(
    "older cycle",
  );
});

test("rebirth keeps the wallet, the workshop, the companions and the skills", () => {
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
  const before = {
    ...old,
    owned: ["quickwind-1", "starfall", "flywheel", "surge", "skill-bay-1"],
    discovered: ids,
    pets: ["pebble"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    skillCharge: { surge: 4 },
    receipts: ["old"],
  };
  const next = applyProgress(before, action);
  expect(next).toMatchObject({
    // Kept: everything the ladder is not about.
    balance: before.balance,
    totalEarned: before.totalEarned,
    pets: ["pebble"],
    activePet: "pebble",
    skillCharge: { surge: 4 },
    flywheelCharge: 4,
    profile: testProfile,
    rebirths: 1,
    // Cleared: the collection, the auras, the history and the cycle's bookkeeping.
    discovered: [],
    equipped: "none",
    goalId: null,
    pendingRoll: null,
    cooldownUntil: 0,
    cooldownWindow: null,
    receipts: [],
  });
  expect(next.owned).not.toContain("prism");
  expect(next.owned).toContain("quickwind-1");
  expect(next.skills).toContain("surge");
  // Rebirth 1 grants its ladder skill and puts it in a free slot.
  expect(next.skills).toContain("reborn-drive");
  expect(next.equippedSkills).toContain("reborn-drive");
  // The activity feed restarts with the rebirth that opened the cycle.
  expect(next.history).toHaveLength(1);
  expect(next.history[0]).toMatchObject({
    type: "rebirth",
    count: 1,
    skill: "reborn-drive",
  });
  expect(parseProgress(JSON.stringify(next))).toEqual(next);
  expect(recoverUnsavedRolls(next, before)).toBe(next);
  expect(rollReceipt(next)).toBeNull();
  // The cycle's committed roll and its receipts are gone, so there is nothing
  // left to settle: a stale receipt cannot be replayed into the new cycle.
  expect(next.pendingRoll).toBeNull();
  expect(next.receipts).toEqual([]);
  expect(next.history.some((e) => e.id === "old")).toBe(false);
  // And a new cycle rolls normally.
  const repeated = applyProgress(next, {
    type: "complete",
    id: "new-cycle",
    at: 300000,
    cooldownUntil: 405000,
    result: evaluate(604827),
  });
  expect(repeated.discovered).toHaveLength(evaluate(604827).badges.length);
  expect(repeated.history.at(-1).type).toBe("unlock");
});

test("every rung of the ladder grants its own skill, and the last one opens the ultra-rebirth", () => {
  let progress = {
    ...state(),
    pets: ["moth"],
    activePet: "moth",
    // Start with a full rack so the ladder skills have to wait their turn.
    skills: ["surge", "trail"],
    equippedSkills: ["surge", "trail"],
    owned: [...shopProducts.map((p) => p.id)],
  };
  const granted = [];
  for (let step = 0; step < REBIRTH_TOTAL; step++) {
    const requirement = rebirthRequirement(step);
    expect(requirement.percent).toBe(50 + step * 10);
    expect(discoveredCount(progress)).toBeGreaterThanOrEqual(
      requirement.badges,
    );
    const next = applyProgress(progress, {
      type: "rebirth",
      expectedRebirths: step,
      at: 200000 + step,
      eventId: `r${step + 1}`,
    });
    expect(next.rebirths).toBe(step + 1);
    expect(next.history).toEqual([
      expect.objectContaining({ type: "rebirth", count: step + 1 }),
    ]);
    // The next rung asks for ten points more, and the collection is empty
    // again: rediscovery is the work, everything else is kept.
    const following = rebirthRequirement(next.rebirths);
    if (following) {
      // Ten points more is 23 or 24 badges, depending on the rounding.
      expect(following.badges).toBeGreaterThan(requirement.badges);
      expect(following.badges).toBeLessThanOrEqual(requirement.badges + 24);
      expect(following.percent).toBe(requirement.percent + 10);
    }
    expect(discoveredCount(next)).toBe(0);
    if (next.history[0].skill) granted.push(next.history[0].skill);
    progress = { ...next, discovered: ids };
  }
  expect(granted).toHaveLength(REBIRTH_TOTAL);
  expect(new Set(granted).size).toBe(REBIRTH_TOTAL);
  for (const id of granted) expect(progress.skills).toContain(id);
  // The rack never grows past its slots: with both bays owned that is four,
  // and later ladder skills simply wait until the player swaps them in.
  expect(skillSlots(progress.owned)).toBe(4);
  expect(progress.equippedSkills).toHaveLength(4);
  expect(progress.equippedSkills).toContain("reborn-drive");
  // The ladder is complete: rebirth is finished, the ultra-rebirth is next.
  expect(rebirthRequirement(REBIRTH_TOTAL)).toBeNull();
  expect(
    rebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toMatch(/ladder is complete/);
  expect(
    ultraRebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toBe("");
  expect(
    ultraRebirthAvailable({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toBe(true);
  // Two steps short, the ultra-rebirth is not even offered.
  expect(
    ultraRebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL - 2 }, 300000),
  ).toMatch(/ladder first/);
});

test("old saves default to zero rebirths and ultra-rebirths, and optional bar snapshots cannot shorten a deadline", () => {
  const legacy = { ...emptyProgress() };
  delete legacy.rebirths;
  delete legacy.ultraRebirths;
  delete legacy.skills;
  delete legacy.equippedSkills;
  delete legacy.skillCharge;
  delete legacy.cooldownWindow;
  const parsed = parseProgress(JSON.stringify(legacy));
  expect(parsed.rebirths).toBe(0);
  expect(parsed.ultraRebirths).toBe(0);
  expect(parsed.skills).toEqual([]);
  expect(parsed.equippedSkills).toEqual([]);
  expect(parsed.skillCharge).toEqual({});
  for (const rebirths of [-1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      parseProgress(JSON.stringify({ ...legacy, rebirths })),
    ).toThrow();
  for (const ultraRebirths of [-1, 0.5, "1"])
    expect(() =>
      parseProgress(JSON.stringify({ ...legacy, ultraRebirths })),
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

for (const [count, rebirths, expected] of [
  [70, 0, "hidden"],
  [71, 0, "disabled"],
  [117, 0, "disabled"],
  [118, 0, "ready"],
  [140, 1, "disabled"],
  [141, 1, "ready"],
])
  test(`rebirth at ${count} of 235 badges and ${rebirths} rebirths reads "${expected}" on its own page`, async ({
    page,
  }) => {
    await seedProgress(page, {
      discovered: ids.slice(0, count),
      rebirths,
    });
    // Rebirth is its own page now; the state is driven by the save alone.
    await page.goto("/#rebirth");
    const button = page.getByRole("button", { name: "Rebirth", exact: true });
    if (expected === "hidden") {
      // Rebirth says nothing at all before it unlocks: no ladder, no locked
      // panel, and the direct link quietly returns to the roll page.
      await expect(button).toHaveCount(0);
      await expect(page.locator(".rebirth-page, .rebirth-ladder")).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("heading", { name: "Rebirth", level: 1 }),
      ).toHaveCount(0);
      await expect(page).toHaveURL(/\/(roll)?$/);
      return;
    }
    if (expected === "ready") {
      await expect(button).toBeEnabled();
    } else {
      await expect(button).toBeDisabled();
    }
    await expect(
      page.getByRole("heading", { name: "Rebirth", level: 1 }),
    ).toBeVisible();
  });

test("rebirth asks for typed confirmation, applies once, and keeps the wallet and the workshop", async ({
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
  await page.goto("/#rebirth");
  await page.getByRole("button", { name: "Rebirth", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Keep:");
  await expect(dialog).toContainText("EP");
  await expect(
    page.getByRole("button", { name: "Confirm rebirth", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Type REBIRTH to confirm" })
    .fill("rebirth");
  await expect(
    page.getByRole("button", { name: "Confirm rebirth", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
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
  // The wallet and every non-cosmetic upgrade survive the cycle.
  expect(after.balance).toBe(initial.balance);
  expect(after.owned).toContain("quickwind-1");
  expect(after.owned).not.toContain("prism");
  // The collection, the aura and the activity history start over.
  expect(after.discovered).toEqual([]);
  expect(after.equipped).toBe("none");
  expect(after.history).toHaveLength(1);
  await nav(page, "History");
  await expect(page.locator('[data-event-type="rebirth"]')).toContainText(
    "Rebirth 1",
  );
  await page.goto("/#rebirth");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeDisabled();
  await nav(page, "Badges");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await mockRandom(page, [604827]);
  await page.reload();
  expect((await saved(page)).rebirths).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "RNGdle Infinite home" }).click();
  await page.locator(".generate").click();
  // Rolled EP still lands in the kept wallet, unchanged by the cycle.
  await expect
    .poll(async () => (await saved(page)).balance)
    .toBe(after.balance + evaluate(604827).totalEP);
  expect((await saved(page)).discovered).toHaveLength(
    evaluate(604827).badges.length,
  );
});

test("a failed rebirth save leaves all progress intact and allows retry", async ({
  page,
}) => {
  await seedProgress(page, state());
  await page.goto("/#rebirth");
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
  await page.goto("/#rebirth");
  const other = await context.newPage();
  await other.goto("/#rebirth");
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
  await page.goto("/#rebirth");
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
  // The stale tab neither spent EP nor resurrected the old aura.
  const after = await saved(page);
  expect(after.owned).not.toContain("starfall");
  expect(after.owned).toContain("quickwind-1");
  expect(after.balance).toBe(50000000);
  await other.close();
});

test("rebirth waits for cooldown and remains usable on mobile without motion", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const now = await page.evaluate(() => Date.now());
  await seedProgress(page, { ...state(), cooldownUntil: now + 10000 });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#rebirth");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeEnabled();
  await confirm(page);
  // The dialog and the page behind it fit the smallest phone: no sideways
  // scroll while the typed confirmation is on screen.
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

test("a new cycle starts a fresh history and a rebuy is credited at the catalogue price", () => {
  const first = applyProgress(
    { ...emptyProgress(), balance: 100000, totalEarned: 100000 },
    { type: "buy", id: "starfall", at: 1000 },
  );
  const reborn = applyProgress(
    { ...first, discovered: ids, balance: 100000 },
    action,
  );
  // The aura is gone and so is the purchase that bought it.
  expect(reborn.owned).not.toContain("starfall");
  expect(reborn.history.map((e) => e.type)).toEqual(["rebirth"]);
  const second = applyProgress(
    { ...reborn, balance: 100000, totalEarned: 100000 },
    { type: "buy", id: "starfall", at: 300000 },
  );
  const purchases = parseProgress(JSON.stringify(second)).history.filter(
    (e) => e.type === "purchase",
  );
  expect(purchases).toHaveLength(1);
  expect(purchases[0]).toMatchObject({
    productId: "starfall",
    ep: shopProducts.find((p) => p.id === "starfall").price,
  });
});

test("the pet a rebirth keeps still brings its signature skill", () => {
  const next = applyProgress(
    { ...state(), pets: ["pebble"], activePet: "pebble" },
    action,
  );
  expect(next.pets).toEqual(["pebble"]);
  expect(skillForPet("pebble")).toBeTruthy();
  expect(parseProgress(JSON.stringify(next)).activePet).toBe("pebble");
});

test("registered rebirth fails closed without Web Locks", async ({ page }) => {
  await seedProgress(page, { ...state(), owned: [] });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/#rebirth");
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
  await page.goto("/#rebirth");
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
  // The ladder still points at rung one: nothing was reset in memory.
  await expect(
    page.locator(".rebirth-ladder li.is-current .rebirth-rung-name"),
  ).toHaveText("#1");
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
