import fs from "node:fs";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockWorldNumbers } from "./helpers/world-random.js";
import {
  RNGWEEN_INTRO_KEY,
  RNGWEEN_WORLD_INTRO_KEY,
} from "../src/rngween-intro.js";
import {
  savedWorld,
  revealWorld,
  completedWorldObjectives,
  completedWorldRoll,
  withWorldPoints,
  withWorldPath,
  openWorldPath,
} from "./helpers/world-roll.js";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
} from "../src/progress.js";
import { chooseTheme } from "./helpers/appearance.js";
import {
  WORLD_BADGES,
  WORLD_MINI_RULES,
  WORLD_MINI_RANGES,
  scoreWorldNumber,
  worldBadgeOdds,
  worldMiniSummary,
  worldFragmentGoals,
} from "../src/rngween-world-badges.js";
import { rngweenCalendar, RNGWEEN_WORLD_SKIN } from "../src/rngween.js";
import {
  RNGWEEN_LIMITED_ITEMS,
  RNGWEEN_PET,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  emptyRngweenLimited,
  rngweenWorldUnlocked,
  retireRngweenLimited,
} from "../src/rngween-limited.js";
import {
  WORLD_ZONES,
  WORLD_SPEED_ITEMS,
  WORLD_LEGACY_STAGES,
  WORLD_REVEAL_MS,
  emptyRngweenWorld,
  parseRngweenWorld,
  worldState,
  worldRevealMS,
  rngweenValleyUnlocked,
  requireWorldZone,
  worldPointsAvailable,
  worldPointsTotal,
  WORLD_POINT_EXCHANGE,
} from "../src/rngween-world-zones.js";
import { rngweenRecord } from "../src/rngween-record.js";
import {
  randomWorldMiniNumber,
  randomWorldNumber,
} from "../src/rngween-world-random.js";
import {
  RNGWEEN_HOURLY_MS,
  RNGWEEN_HOURLY_TASKS,
  eligibleHourlyTasks,
  hourlyTaskById,
  refreshRngweenHourly,
} from "../src/rngween-hourly.js";

const at = Date.UTC(2026, 9, 26, 12);
const opening = Date.UTC(2026, 9, 22, 12);
const end = Date.UTC(2026, 10, 4);
// Zones open in path order; these accounts start with the Patch fragment so
// the Graveyard (the default zone here) is open. Path tests reset it.
const account = (patch = {}) => {
  const p = { ...emptyProgress(), profile: testProfile, ...patch };
  return withWorldPath(p, "graveyard");
};
// Every zone before the Valley already open (path fragments only).
const houseAccount = (patch = {}) =>
  withWorldPath(account(patch), "haunted-house");
// `coins` is World points here: the speed shop takes points, never Pumpkoins.
const funded = (points = 5000) =>
  withWorldPoints(
    houseAccount({
      rngweenLimited: { ...emptyRngweenLimited(), pumpkoins: 5000 },
    }),
    points,
  );
const keyAccount = () =>
  account({
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_WORLD_KEY.id],
    },
  });
const start = (p, zone = "graveyard", number = 1, choice = 1, time = at) =>
  applyProgress(p, {
    type: "rngween-world-roll",
    zone,
    number,
    choice,
    expectedCount: p.rngweenLimited.drawn?.length ?? 0,
    at: time,
    rngweenAt: time,
  });
const finish = (p) => {
  const pending = worldState(p.rngweenLimited).pending;
  return applyProgress(p, {
    type: "rngween-world-reveal",
    id: pending.id,
    at: pending.revealsAt,
    rngweenAt: pending.revealsAt,
  });
};
function words(samples) {
  let i = 0;
  return {
    getRandomValues(a) {
      a[0] = samples[i++ % samples.length];
      return a;
    },
  };
}
async function selectZone(page, id) {
  await page.locator(`[data-world-zone="${id}"]`).click();
}
async function openGraveyardWorld(page) {
  await openWorldPath(page, "graveyard");
  await page.goto("/rngween-world");
  if (!(await savedWorld(page))?.rngweenLimited.world.pending)
    await selectZone(page, "graveyard");
}
async function settle(page) {
  await revealWorld(page);
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending)
    .toBeNull();
}

// Each test uses real deadlines and the real secure worker; the fixture only
// supplies deterministic crypto words and a verified website calendar.
test("World is public with exactly five English phases; aura missions never replace the challenge key", () => {
  expect(WORLD_ZONES.map((z) => z.name)).toEqual([
    "Pumpkin Patch",
    "Graveyard",
    "Blood Moon Ridge",
    "Haunted House",
    "Valley of Horrors",
  ]);
  expect(rngweenWorldUnlocked(account().tasks, account().rngweenLimited)).toBe(
    true,
  );
  expect(rngweenValleyUnlocked(account().rngweenLimited)).toBe(false);
  const p = account();
  p.tasks.rngween.counts = {
    rolls: 300,
    rare: 60,
    banked: 8000000,
    taskClaims: 21,
  };
  expect(rngweenValleyUnlocked(p.rngweenLimited)).toBe(false);
  expect(() => start(p, "valley", 6666, null)).toThrow("Valley needs a key");
  expect(start(p).rngweenLimited.world.pending.zone).toBe("graveyard");
  expect(() => start({ ...p, profile: null })).toThrow("profile");
});

test("Valley alone grants permanent Hexbound at 6666, updates a finite unseen pool and leaves the ordinary game untouched", () => {
  const p = keyAccount();
  let q = start(p, "valley", 6666, null);
  expect(q.owned).not.toContain(RNGWEEN_WORLD_SKIN.id);
  expect(q.rngweenLimited.drawn).toEqual([]);
  q = finish(q);
  expect(q.owned).toContain("hexbound");
  expect(q.rngweenLimited.drawn).toEqual([6666]);
  for (const field of [
    "balance",
    "totalEarned",
    "history",
    "tasks",
    "skillCharge",
    "pendingRoll",
    "pets",
    "receipts",
    "cooldownUntil",
  ])
    expect(q[field]).toEqual(p[field]);
  expect(() => start(q, "valley", 6666, null)).toThrow("unseen");
  expect(() =>
    applyProgress(q, {
      type: "rngween-world-roll",
      zone: "valley",
      number: 7,
      expectedCount: 0,
      at,
    }),
  ).toThrow("pool changed");
  expect(parseAndRepairProgress(JSON.stringify(q)).repairs).toEqual([]);
});

test("all external prices double, old purchases are kept, and Hexbound remains never sold", () => {
  expect([
    RNGWEEN_PET.pumpkoinPrice,
    RNGWEEN_SKILL.pumpkoinPrice,
    RNGWEEN_WORLD_KEY.pumpkoinPrice,
  ]).toEqual([800, 1200, 2000]);
  expect(
    RNGWEEN_LIMITED_ITEMS.filter((i) => i.kind === "aura").map(
      (i) => i.pumpkoinPrice,
    ),
  ).toEqual([5000, 8000, 12000, 20000]);
  expect(RNGWEEN_LIMITED_ITEMS.some((i) => i.id === "hexbound")).toBe(false);
  const p = funded();
  p.rngweenLimited.bought = [
    RNGWEEN_PET.id,
    RNGWEEN_SKILL.id,
    RNGWEEN_WORLD_KEY.id,
  ];
  p.history = [
    {
      id: "old-purchase",
      type: "rngween-purchase",
      at,
      productId: RNGWEEN_WORLD_KEY.id,
      name: "RNGween World Key",
      pumpkoins: 1000,
    },
  ];
  const read = parseAndRepairProgress(JSON.stringify(p));
  expect(read.progress.rngweenLimited.bought).toEqual(p.rngweenLimited.bought);
  expect(read.progress.history[0].pumpkoins).toBe(1000);
  expect(rngweenValleyUnlocked(read.progress.rngweenLimited)).toBe(true);
});

test("speed upgrades cost World points in order, only shorten future World reveals and do not alter a committed deadline", () => {
  let p = funded();
  const first = start(p);
  const deadline = first.rngweenLimited.world.pending.revealsAt;
  p = first;
  const balance = p.balance,
    tasks = p.tasks;
  expect(() =>
    applyProgress(p, {
      type: "buy-rngween-world",
      id: WORLD_SPEED_ITEMS[2].id,
      at,
    }),
  ).toThrow("previous");
  for (const [i, item] of WORLD_SPEED_ITEMS.entries()) {
    p = applyProgress(p, { type: "buy-rngween-world", id: item.id, at });
    expect(worldRevealMS(p.rngweenLimited)).toBe(WORLD_REVEAL_MS[i + 1]);
    expect(p.rngweenLimited.world.pending.revealsAt).toBe(deadline);
    expect(() =>
      applyProgress(p, { type: "buy-rngween-world", id: item.id, at }),
    ).toThrow("already own");
  }
  // 5,000 points of badges minus 200 + 500 + 1,000; Pumpkoins untouched.
  expect(worldPointsAvailable(p.rngweenLimited)).toBe(3300);
  expect(p.rngweenLimited.world.spent).toBe(1700);
  expect(p.rngweenLimited.pumpkoins).toBe(5000);
  expect(p.balance).toBe(balance);
  expect(p.tasks).toEqual(tasks);
  expect(parseAndRepairProgress(JSON.stringify(p)).repairs).toEqual([]);
  p = finish(p);
  p = start(p, "haunted-house", 3, 3);
  expect(
    p.rngweenLimited.world.pending.revealsAt -
      p.rngweenLimited.world.pending.startedAt,
  ).toBe(2000);
  expect(() =>
    applyProgress(funded(0), {
      type: "buy-rngween-world",
      id: "wisp-lantern",
      at,
    }),
  ).toThrow("Not enough World points");
  expect(() =>
    applyProgress(funded(), { type: "buy-rngween-world", id: "missing", at }),
  ).toThrow("not for sale");
  expect(() =>
    applyProgress(funded(), {
      type: "buy-rngween-world",
      id: "wisp-lantern",
      at: null,
    }),
  ).toThrow("open October");
});

test("previous paid keys and actual legacy World journeys migrate, not four completed aura missions", () => {
  const p = account();
  delete p.rngweenLimited.world;
  p.rngweenLimited.drawn = [12, 6066];
  const read = parseAndRepairProgress(JSON.stringify(p));
  expect(read.repairs).toEqual([]);
  expect(read.progress.rngweenLimited.world.legacyPass).toBe(true);
  expect(rngweenValleyUnlocked(read.progress.rngweenLimited)).toBe(true);
  expect(read.progress.rngweenLimited.drawn).toEqual([12, 6066]);
  delete p.rngweenLimited.world;
  p.rngweenLimited.drawn = [];
  expect(
    rngweenValleyUnlocked(
      parseAndRepairProgress(JSON.stringify(p)).progress.rngweenLimited,
    ),
  ).toBe(false);
  expect(parseRngweenWorld(null, [12]).repaired).toBe(true);
});

test("malformed pending results, skipped speed purchases and invalid forge flags repair without minting rewards", () => {
  const p = start(keyAccount(), "valley", 6666, null);
  const world = p.rngweenLimited.world;
  for (const patch of [
    { number: 0 },
    { number: 10000 },
    { number: 1.5 },
    { choice: 1 },
    { expectedCount: 7 },
    { revealsAt: at + 1 },
    { speedLevel: 3 },
    { startedAt: end },
    { id: "forged" },
    { serial: 0 },
  ]) {
    const read = parseRngweenWorld(
      { ...world, pending: { ...world.pending, ...patch } },
      [],
    );
    expect(read.repaired).toBe(true);
    expect(read.world.pending).toBeNull();
  }
  const malformed = parseRngweenWorld(
    { ...world, upgrades: ["reapers-hourglass"], keyForged: true },
    [],
  );
  expect(malformed.repaired).toBe(true);
  expect(malformed.world.upgrades).toEqual([]);
  expect(malformed.world.keyForged).toBe(false);
  expect(p.owned).not.toContain("hexbound");
  expect(p.rngweenLimited.pumpkoins).toBe(0);
});

test("Nov 4 retires all temporary World state; an already committed legitimate 6666 keeps its permanent prize", () => {
  let p = funded();
  p.rngweenLimited.bought = [RNGWEEN_WORLD_KEY.id];
  p = start(p, "valley", 6666, null, end - 11000);
  const closed = retireRngweenLimited(p, end);
  expect(closed.rngweenLimited).toEqual({
    id: "rngween-2026",
    auras: [],
    skinEarned: true,
    retired: true,
  });
  expect(closed.owned).toContain("hexbound");
  expect(closed.rngweenLimited).not.toHaveProperty("world");
  expect(closed.rngweenLimited).not.toHaveProperty("pumpkoins");
  expect(
    parseAndRepairProgress(JSON.stringify(closed)).progress.owned,
  ).toContain("hexbound");
  expect(() => start(keyAccount(), "valley", 1, null, end - 9000)).toThrow(
    "closes before",
  );
  expect(() => start(closed)).toThrow("open October");
  expect(() =>
    applyProgress(closed, {
      type: "buy-rngween-world",
      id: "wisp-lantern",
      at,
    }),
  ).toThrow("open October");
});

test("all public World commission variants remain achievable without a key and do not credit an assignment created after the roll", () => {
  const p = account();
  const tasks = eligibleHourlyTasks(p);
  expect(tasks.filter((t) => t.source === "world")).toHaveLength(12);
  const exhausted = keyAccount();
  exhausted.rngweenLimited.drawn = Array.from(
    { length: 9999 },
    (_, i) => i + 1,
  );
  exhausted.rngweenLimited.world = emptyRngweenWorld(
    exhausted.rngweenLimited.drawn,
  );
  expect(
    eligibleHourlyTasks(exhausted).filter((t) => t.source === "world").length,
  ).toBeGreaterThan(0);
  let q = start(account(), "graveyard", 6, 6, opening);
  q = refreshRngweenHourly(q, opening + 5000, true);
  const first = q.rngweenLimited.hourly.slots[0];
  first.taskId = "world-footsteps";
  first.count = 5;
  q = finish(q);
  expect(q.rngweenLimited.hourly.slots[0].count).toBe(5);
  expect(q.history.filter((e) => e.type === "rngween-hourly")).toHaveLength(0);
  expect(rngweenCalendar(opening).hourlyPhase).toBe("active");
  expect(RNGWEEN_HOURLY_TASKS).toHaveLength(60);
  expect(RNGWEEN_HOURLY_MS).toBe(3600000);
});

test("guests can browse and enter through the Reaper but saved rolls require creating a profile", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  // A first visit: the World's opening has not been watched in this browser.
  await page.addInitScript(
    (key) => localStorage.removeItem(key),
    RNGWEEN_WORLD_INTRO_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Speak to The Reaper" }).click();
  const reaper = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await expect(reaper).toContainText("open to anyone");
  await reaper.locator("[data-typing]").click();
  await reaper.getByRole("button", { name: "Enter RNGween World" }).click();
  // A first visit opens with the World's short story; it can be skipped.
  const opening = page.getByRole("dialog", { name: "RNGween World opening" });
  await expect(opening).toContainText("RNGween World");
  await opening.getByRole("button", { name: "Skip the opening" }).click();
  await expect(opening).toHaveCount(0);
  await selectZone(page, "pumpkin-patch");
  await expect(
    page.getByRole("heading", { name: "RNGween World", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Roll in Pumpkin Patch/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("a pending roll survives reload and navigation, resumes the same outcome, and never finishes from a changed device date", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, at);
  await mockWorldNumbers(page, { graveyard: [6, 2] });
  await seedProgress(page);
  await openGraveyardWorld(page);
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  const pending = (await savedWorld(page)).rngweenLimited.world.pending;
  await page.clock.fastForward(2000);
  clock.set(at + 2000);
  await page.reload();
  expect((await savedWorld(page)).rngweenLimited.world.pending).toEqual(
    pending,
  );
  await page.clock.setFixedTime(new Date("2099-12-31T12:00:00Z"));
  await expect(page.locator("[data-world-result]")).toHaveAttribute(
    "data-world-result",
    "pending",
  );
  await page.getByRole("button", { name: "Back to Roll" }).click();
  await page.clock.fastForward(8100);
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending)
    .toBeNull();
  expect((await savedWorld(page)).rngweenLimited.world.last.number).toBe(6);
  expect((await savedWorld(page)).rngweenLimited.world.rounds.graveyard).toBe(
    1,
  );
  await openGraveyardWorld(page);
  await expect(
    page.getByLabel("World number 6", { exact: true }),
  ).toBeVisible();
});

test("the internal shop charges sequential World-point upgrades, keeps a current deadline and reveals future results in two seconds", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, { graveyard: [1] });
  await seedProgress(page, { rngweenLimited: funded(5000).rngweenLimited });
  await openGraveyardWorld(page);
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  const deadline = (await savedWorld(page)).rngweenLimited.world.pending
    .revealsAt;
  await page.getByRole("button", { name: /World shop/ }).click();
  const shop = page.getByRole("dialog", { name: "World shop" });
  await expect(
    shop.getByRole("button", { name: "Previous upgrade required" }),
  ).toHaveCount(2);
  for (const item of WORLD_SPEED_ITEMS) {
    await shop
      .getByRole("button", { name: `Buy ${item.name}`, exact: true })
      .click();
    await expect(
      shop.locator(`[data-world-upgrade="${item.id}"]`),
    ).toContainText("Owned");
  }
  await expect(shop).toContainText(
    "Your saved roll keeps its original 10s deadline",
  );
  expect((await savedWorld(page)).rngweenLimited.world.pending.revealsAt).toBe(
    deadline,
  );
  expect(worldPointsAvailable((await savedWorld(page)).rngweenLimited)).toBe(
    3300,
  );
  expect((await savedWorld(page)).rngweenLimited.pumpkoins).toBe(5000);
  await page.keyboard.press("Escape");
  await expect(shop).not.toBeVisible();
  await settle(page);
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect
    .poll(
      async () =>
        (await savedWorld(page)).rngweenLimited.world.pending?.speedLevel,
    )
    .toBe(3);
  await settle(page);
  expect((await savedWorld(page)).rngweenLimited.world.rounds.graveyard).toBe(
    2,
  );
  await page.reload();
  await expect(
    page.getByText("2s on future rolls", { exact: true }),
  ).toBeVisible();
});

test("Valley colors every 6 red, never other digits; its animated scenery fits mobile and reduced motion keeps the same deadline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, [6066]);
  await seedProgress(page, { rngweenLimited: keyAccount().rngweenLimited });
  await openGraveyardWorld(page);
  await selectZone(page, "valley");
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(await overflow()).toBe(false);
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(
      async () => (await savedWorld(page)).rngweenLimited.world.pending?.number,
    )
    .toBe(6066);
  expect(
    (await savedWorld(page)).rngweenLimited.world.pending.revealsAt -
      (await savedWorld(page)).rngweenLimited.world.pending.startedAt,
  ).toBe(10000);
  const animation = await page
    .locator(".world-fog")
    .first()
    .evaluate((node) => getComputedStyle(node).animationName);
  expect(animation).toBe("none");
  await settle(page);
  await expect(page.locator(".world-six")).toHaveCount(3);
  expect(
    await page
      .locator(".world-six")
      .first()
      .evaluate((node) => getComputedStyle(node).color),
  ).toBe("rgb(255, 64, 95)");
  await expect(page.locator(".world-digit:not(.world-six)")).toHaveText("0");
  expect((await savedWorld(page)).owned).not.toContain("hexbound");
  await page.getByRole("button", { name: /World shop/ }).click();
  await expect(page.getByRole("dialog", { name: "World shop" })).toBeVisible();
  expect(await overflow()).toBe(false);
  const shop = page.getByRole("dialog", { name: "World shop" });
  // The wallet shows World points now, with a medal instead of a coin.
  await expect(shop.locator(".world-shop-wallet")).toContainText(
    "World points available",
  );
  const mark = await shop
    .locator(".world-shop-wallet > svg")
    .first()
    .boundingBox();
  expect(mark.width).toBeLessThanOrEqual(40);
  expect(mark.height).toBeLessThanOrEqual(40);
  expect(
    await shop.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("World roll and speed purchase require fresh website UTC even after entering the event", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, at);
  await seedProgress(page, { rngweenLimited: funded().rngweenLimited });
  await openGraveyardWorld(page);
  await expect(
    page.getByRole("button", { name: /Roll in Graveyard/ }),
  ).toBeEnabled();
  clock.set(null);
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect(
    page.getByText("Connect to the website to verify RNGween availability.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await savedWorld(page)).rngweenLimited.world.pending).toBeNull();
  await page.getByRole("button", { name: /World shop/ }).click();
  await page
    .getByRole("button", { name: "Buy Wisp Lantern", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Connect to the website",
  );
  expect((await savedWorld(page)).rngweenLimited.pumpkoins).toBe(5000);
  expect((await savedWorld(page)).rngweenLimited.world.upgrades).toEqual([]);
});

test("a committed World result, fragments, paid key and speed upgrades survive rebirth, prestige and rollback unchanged", () => {
  let p = funded();
  p.rngweenLimited.bought = [RNGWEEN_WORLD_KEY.id];
  p = applyProgress(p, { type: "buy-rngween-world", id: "wisp-lantern", at });
  p = finish(start(p, "graveyard", 6, 6));
  p = start(p, "valley", 6666, null);
  p.discovered = allBadgeMetadata.map((badge) => badge.id);
  p.balance = p.totalEarned = p.cycleEarnedEP = 300000000;
  for (const [type, counts] of [
    ["rebirth", { expectedRebirths: 0 }],
    ["ultra-rebirth", { expectedUltraRebirths: 0 }],
    ["rollback", { ultraRebirths: 3, expectedRollbacks: 0 }],
  ]) {
    const reset = applyProgress(
      {
        ...p,
        rebirths: type === "rebirth" ? 0 : 6,
        ...(counts.ultraRebirths
          ? { ultraRebirths: counts.ultraRebirths }
          : {}),
      },
      { type, ...counts, at },
    );
    expect(reset.rngweenLimited).toEqual(p.rngweenLimited);
    const read = parseAndRepairProgress(JSON.stringify(reset));
    expect(read.repairs).toEqual([]);
    expect(read.progress.rngweenLimited.world.pending).toEqual(
      p.rngweenLimited.world.pending,
    );
    const q = finish(read.progress);
    expect(q.owned).toContain("hexbound");
    expect(q.rngweenLimited.drawn).toEqual([6666]);
    expect(rngweenValleyUnlocked(q.rngweenLimited)).toBe(true);
  }
});

test("a failed internal speed-shop save charges no World points and owns nothing until a successful retry", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, { rngweenLimited: funded().rngweenLimited });
  await openGraveyardWorld(page);
  await page.getByRole("button", { name: /World shop/ }).click();
  const shop = page.getByRole("dialog", { name: "World shop" });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreSpeedShopStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "rng-infinite-progress-v1") throw new Error("full");
      return original.call(this, key, value);
    };
  });
  await shop
    .getByRole("button", { name: "Buy Wisp Lantern", exact: true })
    .click();
  await expect(shop.getByRole("alert")).toContainText("not saved");
  expect((await savedWorld(page)).rngweenLimited.world.spent).toBe(0);
  expect((await savedWorld(page)).rngweenLimited.world.upgrades).toEqual([]);
  await page.evaluate(() => window.restoreSpeedShopStorage());
  await shop
    .getByRole("button", { name: "Buy Wisp Lantern", exact: true })
    .click();
  await expect(
    shop.locator('[data-world-upgrade="wisp-lantern"]'),
  ).toContainText("Owned");
  expect((await savedWorld(page)).rngweenLimited.world.spent).toBe(200);
  expect((await savedWorld(page)).rngweenLimited.pumpkoins).toBe(5000);
});

test("fragment zones use fair repeatable 1–99 / 1–999 rejection samples, never choices or the Valley pool", () => {
  for (const [zone, { max }] of Object.entries(WORLD_MINI_RANGES).filter(
    ([id]) => id !== "valley",
  )) {
    expect(randomWorldMiniNumber(zone, words([0xffffffff, 0]))).toBe(1);
    expect(randomWorldMiniNumber(zone, words([max - 1]))).toBe(max);
    const counts = Array(max).fill(0),
      provider = words(Array.from({ length: max * 20 }, (_, i) => i));
    for (let i = 0; i < max * 20; i++)
      counts[randomWorldMiniNumber(zone, provider) - 1]++;
    expect(counts).toEqual(Array(max).fill(20));
    expect(() => randomWorldMiniNumber(zone, {})).toThrow("Secure randomness");
    expect(requireWorldZone(zone).max).toBe(max);
  }
  expect(() => randomWorldMiniNumber("valley", words([0]))).toThrow("Unknown");
  expect(() => requireWorldZone("unknown")).toThrow("Choose Pumpkin Patch");
  expect(randomWorldNumber([1, 2], words([0]))).toBe(3);
});

test("60 event-only patterns score their fixed-width faces, stack points and leave ordinary metadata alone", () => {
  expect(Object.values(WORLD_BADGES).flat()).toHaveLength(60);
  for (const [zone, { max, digits }] of Object.entries(WORLD_MINI_RANGES)) {
    for (const number of [1, max, Number("6".repeat(digits))]) {
      const scored = scoreWorldNumber(zone, number);
      expect(scored.text.length).toBe(digits);
      expect(scored.points).toBe(
        scored.badges.reduce((sum, badge) => sum + badge.points, 0),
      );
      expect(scored.badges).not.toHaveLength(0);
      expect(scored).not.toHaveProperty("totalEP");
    }
    for (const invalid of [0, max + 1, -1, 1.5, "6", null])
      expect(() => scoreWorldNumber(zone, invalid)).toThrow("own range");
    expect(Object.keys(worldBadgeOdds(zone))).toHaveLength(
      WORLD_BADGES[zone].length,
    );
    expect(
      Object.values(worldBadgeOdds(zone)).every(
        (odds) => odds.count > 0 && odds.total === max,
      ),
    ).toBe(true);
  }
  expect(scoreWorldNumber("graveyard", 1).text).toBe("01");
  expect(
    scoreWorldNumber("haunted-house", 1).badges.map((badge) => badge.id),
  ).toContain("doppelganger");
  expect(scoreWorldNumber("graveyard", 66)).toMatchObject({
    points: 121,
    tier: "legendary",
  });
  expect(scoreWorldNumber("haunted-house", 666)).toMatchObject({
    points: 654,
    tier: "legendary",
  });
  expect(scoreWorldNumber("valley", 6666)).toMatchObject({
    points: 2686,
    tier: "legendary",
  });
  // The Ridge tops out at 666: its own legendary face, never Hexbound.
  expect(scoreWorldNumber("blood-moon-ridge", 666)).toMatchObject({
    points: 654,
    tier: "legendary",
  });
  expect(
    scoreWorldNumber("blood-moon-ridge", 666).badges.map((badge) => badge.id),
  ).toContain("eclipse");
  expect(scoreWorldNumber("graveyard", 13).badges.map((b) => b.id)).toEqual([
    "night-watch",
    "black-cat",
    "cursed-prime",
  ]);
  expect(worldBadgeOdds("blood-moon-ridge").eclipse).toEqual({
    count: 1,
    total: 666,
  });
  expect(worldBadgeOdds("graveyard")["double-hex"]).toEqual({
    count: 1,
    total: 99,
  });
  expect(worldBadgeOdds("haunted-house").infernal).toEqual({
    count: 1,
    total: 999,
  });
  expect(worldBadgeOdds("valley").hexbound).toEqual({ count: 1, total: 9999 });
});

test("new rolls commit versioned numbers, not picks; reload is exact and settlement is idempotent", () => {
  const p = account();
  const pending = start(p, "graveyard", 66, 2);
  const roll = pending.rngweenLimited.world.pending;
  expect(roll).toMatchObject({
    rules: WORLD_MINI_RULES,
    choice: null,
    number: 66,
    startedAt: at,
    revealsAt: at + 10000,
    speedLevel: 0,
  });
  expect(roll).not.toHaveProperty("stage");
  expect(pending.rngweenLimited.world.mini.graveyard.rolls).toBe(0);
  expect(start(pending, "haunted-house", 999)).toBe(pending);
  expect(() =>
    applyProgress(pending, {
      type: "rngween-world-reveal",
      id: roll.id,
      at: at + 9999,
    }),
  ).toThrow("still revealing");
  expect(() =>
    applyProgress(pending, {
      type: "rngween-world-reveal",
      id: "wrong",
      at: roll.revealsAt,
    }),
  ).toThrow("different saved");
  const read = parseAndRepairProgress(JSON.stringify(pending));
  expect(read.repairs).toEqual([]);
  expect(read.progress.rngweenLimited.world.pending).toEqual(roll);
  const settled = finish(read.progress);
  expect(
    worldMiniSummary("graveyard", settled.rngweenLimited.world.mini.graveyard),
  ).toMatchObject({ rolls: 1, score: 121, unique: 4, six: 1, rareRolls: 1 });
  expect(settled.rngweenLimited.world.fragments.graveyard).toBe(false);
  expect(
    applyProgress(settled, {
      type: "rngween-world-reveal",
      id: roll.id,
      at: at + 20000,
    }),
  ).toBe(settled);
  expect(parseAndRepairProgress(JSON.stringify(settled)).repairs).toEqual([]);
});

test("objectives accumulate across Common rolls and repeat badges, award one fragment per zone in path order and forge a nonconsumed free key", () => {
  // A fresh account: only the Pumpkin Patch is open until its fragment is won.
  const fresh = { ...emptyProgress(), profile: testProfile };
  expect(() => start(fresh, "graveyard", 66)).toThrow(
    "Earn the Pumpkin Patch key fragment first.",
  );
  expect(() => start(fresh, "haunted-house", 666)).toThrow(
    "Earn the Blood Moon Ridge key fragment first.",
  );
  let p = completedWorldObjectives(fresh, "pumpkin-patch", at);
  expect(p.rngweenLimited.world.fragments["pumpkin-patch"]).toBe(true);
  p = finish(start(p, "graveyard", 66, 1, at + 20000));
  const before = p.rngweenLimited.world.mini.graveyard;
  p = finish(start(p, "graveyard", 38, 1, at + 25000));
  expect(p.rngweenLimited.world.mini.graveyard.counts["double-hex"]).toBe(1);
  expect(
    worldMiniSummary("graveyard", p.rngweenLimited.world.mini.graveyard).score,
  ).toBe(worldMiniSummary("graveyard", before).score + 1);
  expect(p.rngweenLimited.world.fragments.graveyard).toBe(false);
  // The Ridge stays shut until the Graveyard fragment exists.
  expect(() => start(p, "blood-moon-ridge", 7, 1, at + 30000)).toThrow(
    "Earn the Graveyard key fragment first.",
  );
  p = completedWorldObjectives(p, "graveyard", at + 30000);
  expect(p.rngweenLimited.world.fragments).toEqual({
    "pumpkin-patch": true,
    graveyard: true,
    "haunted-house": false,
    "blood-moon-ridge": false,
  });
  expect(
    worldFragmentGoals(
      "graveyard",
      p.rngweenLimited.world.mini.graveyard,
    ).every((goal) => goal.complete),
  ).toBe(true);
  expect(() => applyProgress(p, { type: "forge-rngween-key", at })).toThrow(
    "all four fragment zones",
  );
  p = completedWorldObjectives(p, "blood-moon-ridge", at + 120000);
  expect(p.owned).not.toContain("hexbound");
  // Three of four is still no key.
  expect(() => applyProgress(p, { type: "forge-rngween-key", at })).toThrow(
    "all four fragment zones",
  );
  p = completedWorldObjectives(p, "haunted-house", at + 250000);
  expect(p.rngweenLimited.world.fragments).toEqual({
    "pumpkin-patch": true,
    graveyard: true,
    "haunted-house": true,
    "blood-moon-ridge": true,
  });
  const score = worldMiniSummary(
    "haunted-house",
    p.rngweenLimited.world.mini["haunted-house"],
  ).score;
  p = applyProgress(p, { type: "forge-rngween-key", at: at + 300000 });
  expect(rngweenValleyUnlocked(p.rngweenLimited)).toBe(true);
  expect(p.rngweenLimited.pumpkoins).toBe(0);
  expect(
    p.history.filter((entry) => entry.type === "rngween-forged-key"),
  ).toHaveLength(1);
  expect(() =>
    applyProgress(p, { type: "forge-rngween-key", at: at + 310000 }),
  ).toThrow("already unlocked");
  p = finish(start(p, "valley", 6066));
  expect(p.rngweenLimited.world.keyForged).toBe(true);
  expect(
    worldMiniSummary(
      "haunted-house",
      p.rngweenLimited.world.mini["haunted-house"],
    ).score,
  ).toBe(score);
  // A save that already played a zone keeps it open even without the
  // previous fragment (saves from before the path rule).
  const legacy = { ...emptyProgress(), profile: testProfile };
  legacy.rngweenLimited.world.rounds.graveyard = 1;
  expect(start(legacy, "graveyard", 66).rngweenLimited.world.pending.zone).toBe(
    "graveyard",
  );
});

test("Rare+ rolls count once despite stacked Rare badges; Infernal 666 never awards the Valley skin", () => {
  let p = finish(start(houseAccount(), "haunted-house", 666));
  expect(p.rngweenLimited.world.mini["haunted-house"].rareRolls).toBe(1);
  expect(p.rngweenLimited.skinEarned).toBe(false);
  expect(p.owned).not.toContain("hexbound");
  expect(p.rngweenLimited.drawn).toEqual([]);
  p = finish(start(p, "haunted-house", 1));
  expect(p.rngweenLimited.world.mini["haunted-house"].rareRolls).toBe(1);
  p = finish(start(p, "haunted-house", 111));
  expect(p.rngweenLimited.world.mini["haunted-house"].rareRolls).toBe(2);
  expect(p.rngweenLimited.world.fragments["haunted-house"]).toBe(false);
});

test("per-zone last/best and badge counts survive JSON, changing zones and other zone results", () => {
  let p = finish(start(houseAccount(), "graveyard", 66));
  p = finish(start(p, "haunted-house", 123));
  p = finish(start(p, "graveyard", 38));
  const mini = p.rngweenLimited.world.mini;
  expect(mini.graveyard.last.number).toBe(38);
  expect(mini.graveyard.best.number).toBe(66);
  expect(mini["haunted-house"].last.number).toBe(123);
  expect(mini["haunted-house"].best.number).toBe(123);
  const read = parseAndRepairProgress(JSON.stringify(p));
  expect(read.repairs).toEqual([]);
  expect(read.progress.rngweenLimited.world.mini).toEqual(mini);
});

test("repair derives points from known badge counts, keeps valid zones and never trusts a forged stored total", () => {
  const p = finish(start(account(), "graveyard", 66));
  const corrupted = structuredClone(p);
  corrupted.rngweenLimited.world.mini.graveyard.score = 1000000;
  corrupted.rngweenLimited.world.mini.graveyard.counts.unknown = 10;
  corrupted.rngweenLimited.world.mini.graveyard.counts["black-cat"] = -5;
  corrupted.rngweenLimited.world.mini["haunted-house"].rareRolls = 100;
  const read = parseAndRepairProgress(JSON.stringify(corrupted));
  expect(read.repairs.length).toBeGreaterThan(0);
  expect(
    worldMiniSummary(
      "graveyard",
      read.progress.rngweenLimited.world.mini.graveyard,
    ).score,
  ).toBe(121);
  expect(read.progress.rngweenLimited.world.mini.graveyard.counts).toEqual(
    p.rngweenLimited.world.mini.graveyard.counts,
  );
  expect(
    read.progress.rngweenLimited.world.mini["haunted-house"].rareRolls,
  ).toBe(0);
  // The seeded path fragments stay; nothing new is invented.
  expect(read.progress.rngweenLimited.world.fragments).toEqual(
    account().rngweenLimited.world.fragments,
  );
  expect(read.progress.balance).toBe(0);
  expect(read.progress.owned).toEqual([]);
  expect(parseAndRepairProgress(JSON.stringify(read.progress)).repairs).toEqual(
    [],
  );
});

test("completed collection receipts repair a missing fragment without paying coins or forging the key", () => {
  const p = completedWorldObjectives(account(), "graveyard", at);
  p.rngweenLimited.world.fragments.graveyard = false;
  const read = parseAndRepairProgress(JSON.stringify(p));
  expect(read.repairs.length).toBeGreaterThan(0);
  expect(read.progress.rngweenLimited.world.fragments.graveyard).toBe(true);
  expect(read.progress.rngweenLimited.world.keyForged).toBe(false);
  expect(read.progress.rngweenLimited.pumpkoins).toBe(0);
  expect(read.progress.history).toEqual(p.history);
});

test("legacy single-step and staged pending results finish under their committed rules; owned keys/fragments remain valid", () => {
  for (const zone of ["graveyard", "haunted-house"]) {
    for (const staged of [false, true]) {
      const p = start(houseAccount(), zone, 1);
      const world = p.rngweenLimited.world;
      const stage = staged ? WORLD_LEGACY_STAGES[zone].length - 1 : 0;
      const number = WORLD_LEGACY_STAGES[zone][stage];
      world.games[zone] = stage;
      world.rounds[zone] = world.wins = world.streak = world.bestStreak = stage;
      world.visited = stage ? [zone] : [];
      world.nextSerial = stage + 2;
      world.pending = {
        ...world.pending,
        id: `rngween-2026:world:${stage + 1}`,
        serial: stage + 1,
        number,
        choice: number,
      };
      delete world.pending.rules;
      if (staged) Object.assign(world.pending, { rules: 2, stage });
      delete world.mini;
      p.rngweenLimited.bought = [RNGWEEN_WORLD_KEY.id];
      const read = parseAndRepairProgress(JSON.stringify(p));
      expect(read.repairs, `${zone}:${staged}`).toEqual([]);
      expect(read.progress.rngweenLimited.world.pending).toEqual(world.pending);
      const q = finish(read.progress);
      expect(q.rngweenLimited.world.fragments[zone]).toBe(true);
      expect(q.rngweenLimited.world.mini[zone].rolls).toBe(0);
      expect(rngweenValleyUnlocked(q.rngweenLimited)).toBe(true);
      expect(parseAndRepairProgress(JSON.stringify(q)).repairs).toEqual([]);
      const next = start(q, zone, WORLD_MINI_RANGES[zone].max);
      expect(next.rngweenLimited.world.pending.rules).toBe(WORLD_MINI_RULES);
      expect(next.rngweenLimited.world.pending.choice).toBeNull();
    }
  }
});

test("old pending ranges and stages cannot be relabelled as larger badge outcomes or skip a reveal", () => {
  const p = start(account(), "graveyard", 99);
  for (const patch of [
    { rules: undefined, choice: 99 },
    { rules: 2, stage: 1, choice: 2 },
    { rules: 3, stage: 1 },
    { rules: 4 },
    { choice: 1 },
    { revealsAt: at + 1 },
  ]) {
    const world = structuredClone(p.rngweenLimited.world);
    Object.assign(world.pending, patch);
    const read = parseRngweenWorld(world, []);
    expect(read.repaired).toBe(true);
    expect(read.world.pending).toBeNull();
    expect(read.world.fragments.graveyard).toBe(false);
    expect(read.world.mini.graveyard.rolls).toBe(0);
  }
});

test("all twelve hourly World varieties are achievable through badges in the two free zones without a key", () => {
  const main = RNGWEEN_HOURLY_TASKS.filter((task) => task.source === "main")
    .slice(0, 3)
    .map((task) => task.id);
  const samples = {
    rolls: 1,
    even: 2,
    odd: 3,
    high: 98,
    low: 1,
    contains6: 6,
    curios: 6,
    newCurios: 1,
    newPlaces: 1,
    hits: 66,
    streak: 6,
  };
  for (const task of RNGWEEN_HOURLY_TASKS.filter(
    (task) => task.source === "world",
  )) {
    let p = refreshRngweenHourly(houseAccount(), opening, true);
    const ids = [task.id, ...main];
    p.rngweenLimited.hourly.dealt = [...ids];
    p.rngweenLimited.hourly.slots = ids.map((taskId, index) => ({
      taskId,
      serial: index + 1,
      startedAt: opening,
      expiresAt: opening + RNGWEEN_HOURLY_MS,
      count: 0,
    }));
    for (let index = 0; index < task.goal * 3; index++) {
      const zone =
        task.metric === "newPlaces" && index === 1
          ? "haunted-house"
          : "graveyard";
      p = finish(
        start(
          p,
          zone,
          samples[task.metric],
          null,
          opening + 1000 + index * 11000,
        ),
      );
      // Finished commissions pay when the player claims them.
      const done = p.rngweenLimited.hourly.slots.find(
        (slot) => slot.taskId === task.id && slot.completedAt !== undefined,
      );
      if (done)
        p = applyProgress(p, {
          type: "claim-rngween-hourly",
          serial: done.serial,
          at: opening + 2000 + index * 11000,
          rngweenAt: opening + 2000 + index * 11000,
        });
      if (p.history.some((entry) => entry.taskId === task.id)) break;
    }
    expect(
      p.history.filter((entry) => entry.taskId === task.id),
      task.id,
    ).toHaveLength(1);
    expect(p.rngweenLimited.drawn).toEqual([]);
    expect(p.rngweenLimited.bought).toEqual([]);
    expect(p.rngweenLimited.world.keyForged).toBe(false);
    expect(p.balance).toBe(0);
    expect(parseAndRepairProgress(JSON.stringify(p)).repairs, task.id).toEqual(
      [],
    );
  }
});

test("a keyless profile rolls for badges and three objectives per zone, earns distinct fragments and forges without paying", async ({
  page,
}) => {
  test.setTimeout(90000);
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, {
    "pumpkin-patch": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    graveyard: [66, 13, 49, 66, 6],
    "haunted-house": [
      666, 13, 123, 313, 111, 169, 343, 246, 123, 666, 111, 121,
    ],
    "blood-moon-ridge": [666, 606, 616, 626],
  });
  await seedProgress(page);
  await page.goto("/rngween-world");
  await expect(page.locator("[data-world-zone]")).toHaveCount(5);
  await expect(page.locator(".world-choices, .world-run")).toHaveCount(0);
  await expect(page.locator("[data-world-objective]")).toHaveCount(3);
  // Only the Patch is open on a fresh save; the others say what they need.
  await expect(page.locator('[data-world-zone="graveyard"]')).toHaveAttribute(
    "data-open",
    "false",
  );
  await selectZone(page, "graveyard");
  await expect(page.locator("[data-zone-lock=graveyard]")).toContainText(
    "Earn the Pumpkin Patch key fragment",
  );
  await expect(
    page.getByRole("button", { name: /Roll in Graveyard/ }),
  ).toHaveCount(0);
  await page
    .locator("[data-zone-lock=graveyard]")
    .getByRole("button", { name: "Go to Pumpkin Patch" })
    .click();
  // The key lives on its own tab; the stage stays on screen whichever is open.
  await page.getByRole("tab", { name: "Key & prize" }).click();
  await expect(
    page.getByRole("button", { name: "Forge key · free" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Objectives" }).click();
  const rollZone = async (name, times) => {
    for (let index = 0; index < times; index++) {
      await page
        .getByRole("button", { name: new RegExp(`Roll in ${name}`) })
        .click();
      await expect
        .poll(
          async () => (await savedWorld(page)).rngweenLimited.world.pending?.id,
        )
        .toBeTruthy();
      await settle(page);
    }
  };
  await rollZone("Pumpkin Patch", 9);
  await expect(page.locator('[data-world-zone="graveyard"]')).toHaveAttribute(
    "data-open",
    "true",
  );
  await selectZone(page, "graveyard");
  await expect(page.locator("[data-world-badge]")).toHaveCount(12);
  await rollZone("Graveyard", 5);
  await expect(page.locator(".world-fragment-owned")).toContainText(
    "Fragment owned",
  );
  await expect(page.locator("[data-world-points]")).toHaveText("337");
  expect(
    (await savedWorld(page)).rngweenLimited.world.fragments["haunted-house"],
  ).toBe(false);
  // Two of four: the forge stays closed and the page points at the next zone.
  await expect(page.getByRole("button", { name: "Forge the key" })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-world-next-step]")).toContainText(
    "Blood Moon Ridge",
  );
  await selectZone(page, "blood-moon-ridge");
  await expect(page.locator("[data-world-badge]")).toHaveCount(12);
  await rollZone("Blood Moon Ridge", 4);
  await expect(page.locator("[data-result-badge=red-six]")).toBeVisible();
  expect((await savedWorld(page)).owned).not.toContain("hexbound");
  await selectZone(page, "haunted-house");
  await expect(page.locator("[data-world-badge]")).toHaveCount(12);
  await rollZone("Haunted House", 12);
  expect((await savedWorld(page)).owned).not.toContain("hexbound");
  expect(
    Object.values((await savedWorld(page)).rngweenLimited.world.fragments),
  ).toEqual([true, true, true, true]);
  await page.getByRole("button", { name: "Forge the key" }).click();
  await page.getByRole("button", { name: "Forge key · free" }).click();
  await expect(
    page.getByRole("heading", { name: "Your key is ready" }),
  ).toBeVisible();
  expect((await savedWorld(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.getByRole("button", { name: /Enter Valley/ }).click();
  await expect(
    page.getByRole("button", { name: /Roll in the Valley/ }),
  ).toBeEnabled();
  await expect(page.locator("[data-world-badge]")).toHaveCount(12);
});

test("last/best results and event collection remain visible after another zone rolls and a reload", async ({
  page,
}) => {
  const p = finish(
    start(finish(start(houseAccount(), "graveyard", 66)), "haunted-house", 123),
  );
  await mockSeasonClock(page, at + 30000);
  await mockWorldNumbers(page, { "haunted-house": [38] });
  await seedProgress(page, p);
  await openGraveyardWorld(page);
  await selectZone(page, "graveyard");
  await expect(
    page.getByLabel("World number 66", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-world-points]")).toHaveText("121");
  await expect(page.locator("[data-result-badge=double-hex]")).toBeVisible();
  await selectZone(page, "haunted-house");
  await expect(
    page.getByLabel("World number 123", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Roll in Haunted House/ }).click();
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  await settle(page);
  await page.reload();
  await selectZone(page, "graveyard");
  await expect(
    page.getByLabel("World number 66", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".world-best-number")).toHaveText("66");
  expect(
    (await savedWorld(page)).rngweenLimited.world.mini.graveyard.rolls,
  ).toBe(1);
});

test("World uses the owned equipped skin, never a forced unowned Halloween aura, and keeps it through reload", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, { owned: ["starfall"], equipped: "starfall" });
  await openGraveyardWorld(page);
  const box = page.locator(".world-number-box");
  await expect(box).toHaveAttribute("data-cosmetic", "starfall");
  for (const zone of ["haunted-house", "valley", "graveyard"]) {
    await selectZone(page, zone);
    await expect(box).toHaveAttribute("data-cosmetic", "starfall");
    await expect(box).not.toHaveAttribute(
      "data-cosmetic",
      /phantom-veil|witchfire|blood-moon|hexbound/,
    );
  }
  await page.reload();
  await expect(box).toHaveAttribute("data-cosmetic", "starfall");
});

test("two account tabs settle one badge result and objective fragment, never duplicated points", async ({
  page,
  context,
}) => {
  let p = account();
  for (const n of [66, 13, 49, 66]) p = finish(start(p, "graveyard", n));
  await mockSeasonClock(page, at + 60000);
  await mockWorldNumbers(page, { graveyard: [6] });
  await seedProgress(page, p);
  await openGraveyardWorld(page);
  const other = await context.newPage();
  try {
    await other.clock.install();
    await mockSeasonClock(other, at + 60000);
    await mockWorldNumbers(other, { graveyard: [6] });
    await other.goto("/rngween-world");
    await Promise.all(
      [page, other].map((tab) =>
        tab.evaluate(() =>
          document.querySelector(".world-roll-button")?.click(),
        ),
      ),
    );
    await expect
      .poll(
        async () =>
          (await savedWorld(page)).rngweenLimited.world.pending?.serial,
      )
      .toBe(5);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => navigator.locks.query())).held.some(
            (lock) => lock.name.includes("progress"),
          ),
        { timeout: 2000 },
      )
      .toBe(false);
    await Promise.all([
      page.clock.fastForward(10100),
      other.clock.fastForward(10100),
    ]);
    await expect
      .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending)
      .toBeNull();
    const saved = (await savedWorld(page)).rngweenLimited.world;
    expect(saved.nextSerial).toBe(6);
    expect(saved.rounds.graveyard).toBe(5);
    expect(saved.mini.graveyard.rolls).toBe(5);
    expect(worldMiniSummary("graveyard", saved.mini.graveyard).score).toBe(337);
    expect(saved.fragments.graveyard).toBe(true);
    await expect(other.locator(".world-fragment-owned")).toContainText(
      "Fragment owned",
    );
  } finally {
    await other.close();
  }
});

test("failed badge settlement leaves the committed result, counts and skin unchanged until one successful retry", async ({
  page,
}) => {
  let p = account();
  for (const n of [66, 13, 49, 66]) p = finish(start(p, "graveyard", n));
  await mockSeasonClock(page, at + 60000);
  await mockWorldNumbers(page, { graveyard: [6] });
  await seedProgress(page, p);
  await openGraveyardWorld(page);
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  const pending = (await savedWorld(page)).rngweenLimited.world.pending;
  await page.evaluate(() => {
    window.restoreWorldStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "rng-infinite-progress-v1")
        throw new DOMException("Full", "QuotaExceededError");
      return window.restoreWorldStorage.call(this, key, value);
    };
  });
  await revealWorld(page);
  await expect(page.getByText(/World result not saved/)).toBeVisible();
  const failed = (await savedWorld(page)).rngweenLimited.world;
  expect(failed.pending).toEqual(pending);
  expect(failed.mini.graveyard).toEqual(p.rngweenLimited.world.mini.graveyard);
  expect(failed.fragments.graveyard).toBe(false);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.restoreWorldStorage;
  });
  await page.clock.fastForward(3200);
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending)
    .toBeNull();
  expect(
    (await savedWorld(page)).rngweenLimited.world.fragments.graveyard,
  ).toBe(true);
  expect(
    worldMiniSummary(
      "graveyard",
      (await savedWorld(page)).rngweenLimited.world.mini.graveyard,
    ).score,
  ).toBe(337);
  await page.reload();
  expect(
    (await savedWorld(page)).rngweenLimited.world.mini.graveyard.rolls,
  ).toBe(5);
});

test("badge objectives and keyboard-operated collections fit narrow phones in light and dark without changing deadlines", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, { "haunted-house": [666] });
  await seedProgress(page);
  await openWorldPath(page, "haunted-house");
  await openGraveyardWorld(page);
  for (const theme of ["light", "dark"]) {
    await page.goto("/");
    await chooseTheme(page, theme);
    await openGraveyardWorld(page);
    for (const width of [340, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await selectZone(page, "haunted-house");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // The badge book starts folded; Enter on its summary opens and closes it.
      const summary = page.locator(".world-badge-book summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".world-badge-book")).toHaveAttribute(
        "open",
        "",
      );
      await expect(page.locator("[data-world-badge=infernal]")).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(page.locator(".world-badge-book")).not.toHaveAttribute(
        "open",
        "",
      );
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Roll in Haunted House/ }).click();
  await expect
    .poll(
      async () => (await savedWorld(page)).rngweenLimited.world.pending?.number,
    )
    .toBe(666);
  const roll = (await savedWorld(page)).rngweenLimited.world.pending;
  expect(roll.revealsAt - roll.startedAt).toBe(10000);
  await page.clock.fastForward(1000);
  expect(
    (await savedWorld(page)).rngweenLimited.world.mini["haunted-house"].rolls,
  ).toBe(0);
  await settle(page);
  await expect(page.locator("[data-result-badge=infernal]")).toBeVisible();
  expect((await savedWorld(page)).owned).not.toContain("hexbound");
});

test("Reaper, introduction and World copy explain badge objectives without choices, run resets or old slogans", () => {
  for (const filename of [
    "src/components/RngweenWorld.jsx",
    "src/components/RngweenIntro.jsx",
    "src/rngween-reaper.js",
  ]) {
    const source = fs.readFileSync(filename, "utf8");
    expect(source).not.toMatch(
      /two steps|three steps|bone die|wrong choice|run failed|trap the ghost|1 in 12|1 in 36/i,
    );
    expect(source).not.toMatch(/generator|fortune favours|the veil is thin/i);
  }
  // The Reaper reads the objectives from the badge module instead of
  // repeating them in prose, so the names live in one place.
  const badges = fs.readFileSync("src/rngween-world-badges.js", "utf8");
  expect(badges).toContain("Six Mark 3 times");
  const reaper = fs.readFileSync("src/rngween-reaper.js", "utf8");
  expect(reaper).toContain("worldPhaseGoals");
});

test("legacy unseen-pool receipts restore Valley badges and last/best numbers without invented timestamps or payments", () => {
  const p = keyAccount();
  p.rngweenLimited.drawn = [1354, 6066, 6666];
  p.rngweenLimited.world = emptyRngweenWorld(p.rngweenLimited.drawn, true);
  delete p.rngweenLimited.world.mini;
  const migrated = parseAndRepairProgress(JSON.stringify(p));
  expect(migrated.repairs).toEqual([]);
  const stats = migrated.progress.rngweenLimited.world.mini.valley;
  expect(worldMiniSummary("valley", stats)).toMatchObject({
    rolls: 3,
    unique: 9,
    score: 2958,
  });
  expect(stats.counts.hexbound).toBe(1);
  expect(stats.last).toEqual({ number: 6666, serial: null, at: null });
  expect(stats.best).toEqual(stats.last);
  expect(migrated.progress.balance).toBe(p.balance);
  expect(migrated.progress.rngweenLimited.pumpkoins).toBe(0);
  expect(migrated.progress.history).toEqual(p.history);
  expect(
    parseAndRepairProgress(JSON.stringify(migrated.progress)).repairs,
  ).toEqual([]);
  const next = finish(start(migrated.progress, "valley", 1234));
  expect(next.rngweenLimited.world.mini.valley.rolls).toBe(4);
  expect(next.rngweenLimited.world.mini.valley.counts.hexbound).toBe(1);
  expect(next.rngweenLimited.world.mini.valley.best.number).toBe(6666);
  expect(parseAndRepairProgress(JSON.stringify(next)).repairs).toEqual([]);
});

test("an old earned Hexbound is a collected Valley badge, not an impossible unowned badge with a zero chance", async ({
  page,
}) => {
  const p = keyAccount();
  p.rngweenLimited.drawn = [6666];
  p.rngweenLimited.world = emptyRngweenWorld(p.rngweenLimited.drawn, true);
  delete p.rngweenLimited.world.mini;
  await mockSeasonClock(page, at);
  await seedProgress(page, p);
  await openGraveyardWorld(page);
  await selectZone(page, "valley");
  await expect(
    page.getByLabel("World number 6666", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-world-badge=hexbound]")).toContainText(
    "Collected ×1",
  );
  await expect(page.locator(".world-best-number")).toHaveText("6666");
  await expect(page.locator("[data-world-points]")).toHaveText("2,686");
  await page.reload();
  await selectZone(page, "valley");
  await expect(page.locator("[data-world-badge=hexbound]")).toContainText(
    "Collected ×1",
  );
});

test("malformed pre-World pools never brick save migration or manufacture a number beyond the known receipts", () => {
  const p = account();
  delete p.rngweenLimited.world;
  p.rngweenLimited.drawn = [1, 1, 0, "6", 6666, 10000];
  const fixed = parseAndRepairProgress(JSON.stringify(p));
  expect(fixed.repairs.length).toBeGreaterThan(0);
  expect(fixed.progress.profile).toEqual(p.profile);
  expect(fixed.progress.rngweenLimited.drawn).toEqual([1, 6666]);
  expect(fixed.progress.rngweenLimited.world.mini.valley.rolls).toBe(2);
  expect(fixed.progress.rngweenLimited.world.mini.valley.counts.hexbound).toBe(
    1,
  );
  expect(fixed.progress.rngweenLimited.pumpkoins).toBe(0);
});

test("filled event badge collections never receive impossible new-badge commissions while repeatable World errands stay available", () => {
  let p = account();
  // Path order: each zone's fragment opens the next one.
  for (const [zone, numbers] of Object.entries({
    "pumpkin-patch": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    graveyard: [66, 13, 49, 66, 6, 12, 97, 99],
    "blood-moon-ridge": [666, 606, 616, 626, 7, 123, 67],
    "haunted-house": [
      666, 13, 123, 313, 111, 229, 343, 246, 123, 666, 111, 121,
    ],
  }))
    for (const number of numbers) p = finish(start(p, zone, number));
  for (const zone of [
    "pumpkin-patch",
    "graveyard",
    "haunted-house",
    "blood-moon-ridge",
  ])
    expect(
      worldMiniSummary(zone, p.rngweenLimited.world.mini[zone]).unique,
      zone,
    ).toBe(12);
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newCurios"),
  ).toBe(false);
  expect(
    eligibleHourlyTasks(p).some(
      (task) => task.metric === "contains6" && task.source === "world",
    ),
  ).toBe(true);
  p = applyProgress(p, { type: "forge-rngween-key", at });
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newCurios"),
  ).toBe(true);
  for (const number of [1234, 1354, 10, 1353, 1361, 6666])
    p = finish(start(p, "valley", number));
  expect(
    worldMiniSummary("valley", p.rngweenLimited.world.mini.valley).unique,
  ).toBe(12);
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newCurios"),
  ).toBe(false);
  for (let serial = 0; serial < 25; serial++) {
    const board = refreshRngweenHourly(
      p,
      opening + serial * RNGWEEN_HOURLY_MS,
      true,
    );
    expect(
      board.rngweenLimited.hourly.slots.some(
        (slot) => hourlyTaskById.get(slot.taskId).metric === "newCurios",
      ),
    ).toBe(false);
    p = board;
  }
});

test("a pre-assignment pending result reserves its finite badges and zone visit instead of making the next commission inaccessible", () => {
  let initial = houseAccount();
  for (let number = 1; number <= 9; number++)
    initial = finish(
      start(
        initial,
        "pumpkin-patch",
        number,
        null,
        opening - 110000 + number * 11000,
      ),
    );
  // Two unvisited free zones remain (Graveyard, Ridge) before the pending roll.
  initial = finish(
    start(initial, "haunted-house", 123, null, opening - 150000),
  );
  const p = start(initial, "graveyard", 66, null, opening);
  expect(
    eligibleHourlyTasks(initial).some((task) => task.metric === "newPlaces"),
  ).toBe(true);
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newPlaces"),
  ).toBe(false);
  // Only two unseen badges remain, and both are already committed before the
  // assignment. They cannot pay a newly assigned discovery commission.
  const counts = p.rngweenLimited.world.mini.graveyard.counts;
  for (const badge of WORLD_BADGES.graveyard)
    if (!["six-mark", "double-hex"].includes(badge.id)) counts[badge.id] = 1;
  for (const zone of ["haunted-house", "blood-moon-ridge"])
    for (const badge of WORLD_BADGES[zone])
      p.rngweenLimited.world.mini[zone].counts[badge.id] = 1;
  expect(
    eligibleHourlyTasks({
      ...p,
      rngweenLimited: {
        ...p.rngweenLimited,
        world: { ...p.rngweenLimited.world, pending: null },
      },
    }).some((task) => task.metric === "newCurios"),
  ).toBe(true);
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newCurios"),
  ).toBe(false);
});

test("World points are the sum of every zone's badge points; the shop spends them without touching Pumpkoins, zone records or the Record", () => {
  expect(WORLD_SPEED_ITEMS.map((item) => item.pointPrice)).toEqual([
    200, 500, 1000,
  ]);
  let p = account();
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9])
    p = completedWorldRoll(p, { zone: "pumpkin-patch", number, at });
  for (const number of [66, 13, 49])
    p = completedWorldRoll(p, { zone: "graveyard", number, at });
  const patch = worldMiniSummary(
    "pumpkin-patch",
    p.rngweenLimited.world.mini["pumpkin-patch"],
  ).score;
  const graves = worldMiniSummary(
    "graveyard",
    p.rngweenLimited.world.mini.graveyard,
  ).score;
  expect(worldPointsAvailable(p.rngweenLimited)).toBe(patch + graves);
  expect(p.rngweenLimited.pumpkoins).toBe(0);
  // Rolls never pay Pumpkoins and the Record's income stays at zero.
  expect(rngweenRecord(p, new Date(at)).earned).toBe(0);
  const funds = worldPointsAvailable(p.rngweenLimited);
  if (funds < 200) p = withWorldPoints(p, 200 - funds);
  const before = worldPointsAvailable(p.rngweenLimited);
  const bought = applyProgress(p, {
    type: "buy-rngween-world",
    id: "wisp-lantern",
    at,
  });
  expect(worldPointsAvailable(bought.rngweenLimited)).toBe(before - 200);
  expect(bought.rngweenLimited.world.spent).toBe(200);
  expect(bought.rngweenLimited.pumpkoins).toBe(0);
  // Zone totals are untouched: the Record and the collections keep them.
  expect(
    worldMiniSummary(
      "pumpkin-patch",
      bought.rngweenLimited.world.mini["pumpkin-patch"],
    ).score,
  ).toBe(patch);
  const record = rngweenRecord(bought, new Date(at));
  expect(record.zones.find((z) => z.id === "pumpkin-patch").points).toBe(patch);
  expect(record.spent).toBe(0);
  expect(bought.history.at(-1)).toMatchObject({
    type: "rngween-world-purchase",
    productId: "wisp-lantern",
    points: 200,
  });
  expect(bought.history.at(-1)).not.toHaveProperty("pumpkoins");
  const again = parseAndRepairProgress(JSON.stringify(bought));
  expect(again.repairs).toEqual([]);
  expect(again.progress.rngweenLimited.world.spent).toBe(200);
  // A spent total above what the zones ever paid is clamped on load.
  const tampered = JSON.parse(JSON.stringify(bought));
  tampered.rngweenLimited.world.spent = 999999;
  const fixed = parseAndRepairProgress(JSON.stringify(tampered));
  expect(fixed.progress.rngweenLimited.world.spent).toBe(before);
  expect(fixed.repairs.length).toBeGreaterThan(0);
  // A save from before the points shop simply starts at zero spent.
  delete tampered.rngweenLimited.world.spent;
  const legacy = parseAndRepairProgress(JSON.stringify(tampered));
  expect(legacy.repairs).toEqual([]);
  expect(legacy.progress.rngweenLimited.world.spent).toBe(0);
});

test("spare World points trade for small fixed blocks of Pumpkoins or EP out of the spent pool, never out of records or badges", () => {
  expect(WORLD_POINT_EXCHANGE).toEqual({
    points: 500,
    pumpkoins: 2,
    ep: 10000,
  });
  let p = funded(2000);
  const patchScore = worldPointsTotal(p.rngweenLimited.world);
  const balance = p.balance;
  const coins = p.rngweenLimited.pumpkoins;
  const coinsOut = applyProgress(p, {
    type: "exchange-world-points",
    to: "pumpkoins",
    blocks: 2,
    at,
  });
  expect(coinsOut.rngweenLimited.pumpkoins).toBe(coins + 4);
  expect(coinsOut.balance).toBe(balance);
  expect(coinsOut.rngweenLimited.world.spent).toBe(1000);
  expect(worldPointsAvailable(coinsOut.rngweenLimited)).toBe(
    worldPointsAvailable(p.rngweenLimited) - 1000,
  );
  // Totals, records and the Pumpkoin ledger of the Record page are unchanged
  // by the trade itself; the Record counts the coins as event income.
  expect(worldPointsTotal(coinsOut.rngweenLimited.world)).toBe(patchScore);
  expect(rngweenRecord(coinsOut, new Date(at)).earned).toBe(4);
  expect(coinsOut.history.at(-1)).toMatchObject({
    type: "rngween-world-exchange",
    points: 1000,
    pumpkoins: 4,
  });
  const epOut = applyProgress(coinsOut, {
    type: "exchange-world-points",
    to: "ep",
    at,
  });
  expect(epOut.balance).toBe(balance + 10000);
  expect(epOut.rngweenLimited.pumpkoins).toBe(coins + 4);
  expect(epOut.rngweenLimited.world.spent).toBe(1500);
  expect(epOut.history.at(-1)).toMatchObject({
    type: "rngween-world-exchange",
    points: 500,
    ep: 10000,
  });
  // The ledger survives a reload intact and nothing is repaired.
  const again = parseAndRepairProgress(JSON.stringify(epOut));
  expect(again.repairs).toEqual([]);
  expect(again.progress.history.slice(-2)).toEqual(epOut.history.slice(-2));
  // Not enough points, a bad block count and a zero account all refuse.
  expect(() =>
    applyProgress(epOut, {
      type: "exchange-world-points",
      to: "ep",
      blocks: 100,
      at,
    }),
  ).toThrow("Not enough World points");
  expect(() =>
    applyProgress(epOut, {
      type: "exchange-world-points",
      to: "ep",
      blocks: 0,
      at,
    }),
  ).toThrow("blocks");
  expect(() =>
    applyProgress(account(), { type: "exchange-world-points", to: "ep", at }),
  ).toThrow("Not enough World points");
  // Same upgrades still buyable afterwards from what is left (2000 − 1500).
  const upgraded = applyProgress(epOut, {
    type: "buy-rngween-world",
    id: "wisp-lantern",
    at,
  });
  expect(worldPointsAvailable(upgraded.rngweenLimited)).toBe(
    worldPointsAvailable(p.rngweenLimited) - 1700,
  );
});

test("the World shop trades 500 points for 2 Pumpkoins or 10,000 EP from the page", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, {
    rngweenLimited: funded(1200).rngweenLimited,
    balance: 5000,
    totalEarned: 5000,
  });
  await openGraveyardWorld(page);
  await page.getByRole("button", { name: /World shop/ }).click();
  const shop = page.getByRole("dialog", { name: "World shop" });
  await shop.locator("[data-world-exchange=pumpkoins]").click();
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.pumpkoins)
    .toBe(5002);
  await shop.locator("[data-world-exchange=ep]").click();
  await expect.poll(async () => (await savedWorld(page)).balance).toBe(15000);
  // funded() rounds up to 1,500 points (three Infernals); spend the rest.
  await shop.locator("[data-world-exchange=ep]").click();
  await expect.poll(async () => (await savedWorld(page)).balance).toBe(25000);
  // Nothing left to trade: both buttons close.
  await expect(shop.locator("[data-world-exchange=ep]")).toBeDisabled();
  await expect(shop.locator("[data-world-exchange=pumpkoins]")).toBeDisabled();
  expect((await savedWorld(page)).rngweenLimited.world.spent).toBe(1500);
});

test("the World renders on the dark theme whatever the setting and hands the saved theme back on the way out", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page);
  await page.goto("/");
  await chooseTheme(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/rngween-world");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("rng-theme"))).toBe(
    "light",
  );
  await page.getByRole("button", { name: "Back to Roll" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/rngween-world");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("the World opening plays once per device, can be stepped through and replayed, and stays still with reduced motion", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, account(), { introSeen: false });
  await page.addInitScript(
    (key) => localStorage.setItem(key, "rngween-2026"),
    RNGWEEN_INTRO_KEY,
  );
  await page.goto("/rngween-world");
  const opening = page.getByRole("dialog", { name: "RNGween World opening" });
  await expect(opening).toHaveAttribute("data-world-intro", "0");
  await opening.getByRole("button", { name: "Next", exact: true }).click();
  await expect(opening).toHaveAttribute("data-world-intro", "1");
  await opening.getByRole("button", { name: "Next", exact: true }).click();
  await opening.getByRole("button", { name: "Next", exact: true }).click();
  await expect(opening).toHaveAttribute("data-world-intro", "3");
  await opening.getByRole("button", { name: "Enter the World" }).click();
  await expect(opening).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Roll in Pumpkin Patch/ }),
  ).toBeVisible();
  // Seen once: a reload goes straight to the zones.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Roll in Pumpkin Patch/ }),
  ).toBeVisible();
  await expect(opening).toHaveCount(0);
  // Replay from the footer, and the reduced-motion version is a still page.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Watch the opening again" }).click();
  await expect(opening).toHaveClass(/is-still/);
  await expect(opening).toHaveAttribute("data-world-intro", "3");
  await opening.getByRole("button", { name: "Close the opening" }).click();
  await expect(opening).toHaveCount(0);
});
