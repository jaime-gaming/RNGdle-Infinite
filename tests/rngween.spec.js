import { chooseTheme } from "./helpers/appearance.js";
import { test, expect } from "./helpers/clock.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import fs from "node:fs";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  activeTaskIds,
  emptyTasks,
  periodKey,
  TASK_METRICS,
  taskById,
} from "../src/tasks.js";
import {
  claimRngweenAura,
  emptyRngween,
  parseRngween,
  recordRngweenTally,
  rngweenAuraIds,
  rngweenCalendar,
  rngweenState,
  RNGWEEN_AURAS,
  RNGWEEN_ID,
  RNGWEEN_MISSIONS,
} from "../src/rngween.js";
import {
  auraProducts,
  aurasInFamily,
  productById,
  productPrice,
  shopProducts,
  visibleAuraFamilies,
} from "../src/shop-data.js";
import { availableGoals, goalItem, validGoal } from "../src/gameplay-loop.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { rebirthRelevantPurchases } from "../src/rebirth.js";
import { CHANGELOG, LATEST_VERSION } from "../src/changelog.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";

const at = (month, day, hour = 0, minute = 0, second = 0, year = 2026) =>
  Date.UTC(year, month - 1, day, hour, minute, second);
const { decoratesAt, startsAt, endsAt, decorationsEndAt } = rngweenCalendar(
  at(10, 10),
);
const auraIds = RNGWEEN_AURAS.map((aura) => aura.id);
const onlineRoll = (id, time, number = 103001) => ({
  type: "complete",
  id,
  at: time,
  cooldownUntil: 0,
  result: evaluate(number),
});
const finishedEvent = (earned = []) => ({
  ...emptyRngween(),
  counts: { rolls: 200, rare: 40, banked: 5000000, taskClaims: 18 },
  earned,
});
const finishedTasks = (time) => {
  const tasks = emptyTasks();
  for (const cadence of ["daily", "weekly"]) {
    const counts = Object.fromEntries(
      TASK_METRICS.map((metric) => [metric, 0]),
    );
    for (const id of activeTaskIds(tasks, cadence, time)) {
      const task = taskById(id);
      counts[task.metric] = Math.max(counts[task.metric], task.goal);
    }
    tasks[cadence] = {
      ...tasks[cadence],
      period: periodKey(cadence, time),
      counts,
    };
  }
  return tasks;
};

async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
}

// ---- Calendar and transactions -------------------------------------------

test("Halloween uses fixed UTC dates: Oct 21–Nov 3 decoration, Oct 25–31 one-off event", () => {
  expect(rngweenCalendar(decoratesAt - 1)).toMatchObject({
    decorated: false,
    phase: "upcoming",
  });
  expect(rngweenCalendar(decoratesAt)).toMatchObject({
    decorated: true,
    phase: "upcoming",
  });
  expect(rngweenCalendar(startsAt - 1)).toMatchObject({
    decorated: true,
    phase: "upcoming",
  });
  expect(rngweenCalendar(startsAt)).toMatchObject({
    decorated: true,
    phase: "active",
  });
  expect(rngweenCalendar(endsAt - 1)).toMatchObject({
    decorated: true,
    phase: "active",
  });
  expect(rngweenCalendar(endsAt)).toMatchObject({
    decorated: true,
    phase: "ended",
  });
  expect(rngweenCalendar(decorationsEndAt - 1).decorated).toBe(true);
  expect(rngweenCalendar(decorationsEndAt).decorated).toBe(false);
  expect(rngweenCalendar(null)).toMatchObject({
    decorated: false,
    phase: "unavailable",
  });
  for (const year of [2027, 2028, 2030])
    expect(rngweenCalendar(at(10, 28, 12, 0, 0, year))).toMatchObject({
      decorated: false,
      phase: "ended",
    });
  expect(RNGWEEN_ID).toBe("rngween-2026");
});

test("missions use online progress, require manual collection and never spend EP", () => {
  let state = emptyProgress();
  for (let i = 0; i < 200; i++)
    state = applyProgress(
      state,
      onlineRoll(`halloween-${i}`, startsAt + i * 60000, 109),
    );
  expect(state.tasks.rngween.counts).toEqual({
    rolls: 200,
    rare: 40,
    banked: 5000000,
    taskClaims: 0,
  });
  expect(state.tasks.rngween.earned).toEqual([]);
  expect(state.owned).toEqual([]);
  expect(state.equipped).toBe("none");
  expect(rngweenState(state.tasks, startsAt)).toMatchObject({
    complete: 3,
    collected: 0,
    ready: 3,
    total: 4,
  });
  const balance = state.balance;
  state = applyProgress(state, {
    type: "claim-rngween-aura",
    id: "jack-o-glow",
    at: startsAt,
  });
  expect(state.owned).toEqual(["jack-o-glow"]);
  expect(state.equipped).toBe("jack-o-glow");
  expect(state.balance).toBe(balance);
  expect(state.totalEarned).toBe(balance);
  expect(rngweenAuraIds(state.tasks)).toEqual(["jack-o-glow"]);
  expect(() =>
    applyProgress(state, {
      type: "claim-rngween-aura",
      id: "jack-o-glow",
      at: startsAt,
    }),
  ).toThrow("already been collected");
  expect(() =>
    applyProgress(state, {
      type: "claim-rngween-aura",
      id: "blood-moon",
      at: startsAt,
    }),
  ).toThrow("Complete the mission");
  expect(() =>
    applyProgress(state, {
      type: "claim-rngween-aura",
      id: "static",
      at: startsAt,
    }),
  ).toThrow("does not exist");
  expect(parseProgress(JSON.stringify(state))).toEqual(state);
});

test("no progress outside the event, offline credit, duplicate rolls or future-year unlocks", () => {
  let state = applyProgress(emptyProgress(), onlineRoll("early", startsAt - 1));
  expect(state.tasks.rngween).toEqual(emptyRngween());
  state = applyProgress(state, onlineRoll("opening", startsAt));
  expect(state.tasks.rngween.counts.rolls).toBe(1);
  const duplicate = applyProgress(
    state,
    onlineRoll("opening", startsAt + 1000),
  );
  expect(duplicate).toBe(state);
  const offline = applyProgress(state, {
    ...onlineRoll("offline", startsAt + 2000),
    source: "offline",
  });
  expect(offline.tasks.rngween).toEqual(state.tasks.rngween);
  state = applyProgress(offline, onlineRoll("last", endsAt - 1));
  expect(state.tasks.rngween.counts.rolls).toBe(2);
  const late = applyProgress(state, onlineRoll("late", endsAt));
  expect(late.tasks.rngween).toEqual(state.tasks.rngween);
  const future = applyProgress(
    late,
    onlineRoll("future", at(10, 25, 0, 0, 0, 2027)),
  );
  expect(future.tasks.rngween).toEqual(late.tasks.rngween);
  expect(rngweenState(future.tasks, endsAt).ready).toBe(0);
});

test("unfinished and uncollected auras expire; ownership, not the date, gates equipping", () => {
  const ready = {
    ...emptyProgress(),
    tasks: { ...emptyTasks(), rngween: finishedEvent() },
  };
  for (const time of [startsAt - 1, endsAt, at(10, 25, 12, 0, 0, 2027)]) {
    expect(() =>
      applyProgress(ready, {
        type: "claim-rngween-aura",
        id: "jack-o-glow",
        at: time,
      }),
    ).toThrow("October 25–31");
    expect(
      rngweenState(ready.tasks, time).missions.every(
        (mission) => !mission.claimable,
      ),
    ).toBe(true);
  }
  expect(() =>
    applyProgress(ready, { type: "equip", id: "phantom-veil", at: startsAt }),
  ).toThrow("own this aura");
  const collected = applyProgress(ready, {
    type: "claim-rngween-aura",
    id: "phantom-veil",
    at: endsAt - 1,
  });
  const unequipped = applyProgress(collected, {
    type: "equip",
    id: "none",
    at: endsAt,
  });
  const equipped = applyProgress(unequipped, {
    type: "equip",
    id: "phantom-veil",
    at: at(12, 1),
  });
  expect(equipped.equipped).toBe("phantom-veil");
  expect(equipped.balance).toBe(ready.balance);
  expect(() =>
    applyProgress(equipped, { type: "equip", id: "blood-moon", at: at(12, 1) }),
  ).toThrow("own this aura");
  expect(() => claimRngweenAura(ready.tasks, "witchfire", NaN)).toThrow(
    "October 25–31",
  );
});

test("eighteen ordinary task claims unlock Blood Moon; skips and list bonuses do not", () => {
  let state = emptyProgress();
  let time;
  let ids;
  for (let day = 25; day <= 30; day++) {
    time = at(10, day, 12);
    const tasks = finishedTasks(time);
    tasks.rngween = state.tasks.rngween;
    state = { ...state, tasks };
    ids = activeTaskIds(tasks, "daily", time);
    for (const id of ids)
      state = applyProgress(state, { type: "claim-task", id, at: time });
  }
  expect(state.tasks.rngween.counts.taskClaims).toBe(18);
  expect(state.tasks.rngween.earned).toEqual([]);
  expect(state.owned).not.toContain("blood-moon");
  const bonus = applyProgress(state, {
    type: "collect-list-bonus",
    cadence: "daily",
    at: time,
  });
  expect(bonus.tasks.rngween).toEqual(state.tasks.rngween);
  expect(() =>
    applyProgress(bonus, { type: "claim-task", id: ids[0], at: time }),
  ).toThrow("already claimed");
  const balance = bonus.balance;
  state = applyProgress(bonus, {
    type: "claim-rngween-aura",
    id: "blood-moon",
    at: time,
  });
  expect(state.balance).toBe(balance);
  expect(state.owned).toContain("blood-moon");
  expect(state.equipped).toBe("blood-moon");

  for (const time of [startsAt - 1, endsAt]) {
    const tasks = finishedTasks(time);
    const id = activeTaskIds(tasks, "daily", time)[0];
    const outside = applyProgress(
      { ...emptyProgress(), tasks },
      { type: "claim-task", id, at: time },
    );
    expect(outside.tasks.rngween.counts.taskClaims).toBe(0);
  }
  const skip = applyProgress(
    { ...emptyProgress(), balance: 125000, totalEarned: 125000 },
    { type: "buy", id: "task-skip", at: startsAt },
  );
  expect(skip.tasks.rngween.counts.taskClaims).toBe(0);
});

test("exclusive cosmetics have no EP price and cannot enter ordinary stock or EP goals", () => {
  const rich = {
    ...emptyProgress(),
    balance: 100000000,
    totalEarned: 100000000,
  };
  expect(shopProducts).toHaveLength(61);
  expect(auraProducts).toHaveLength(31);
  expect(RNGWEEN_MISSIONS.map((mission) => mission.auraId)).toEqual(auraIds);
  expect(rebirthRelevantPurchases(auraIds)).toEqual([]);
  for (const aura of RNGWEEN_AURAS) {
    expect(productById.get(aura.id)).toBe(aura);
    expect(shopProducts.some((item) => item.id === aura.id)).toBe(false);
    expect(aura).toMatchObject({
      kind: "aura",
      eventOnly: true,
      family: "rngween",
    });
    for (const field of [
      "price",
      "eventPrice",
      "value",
      "charges",
      "requires",
      "lateGame",
    ])
      expect(aura[field]).toBeUndefined();
    expect(productPrice(aura)).toBeNull();
    expect(validGoal(aura.id)).toBe(false);
    expect(goalItem(aura.id)).toBeNull();
    expect(availableGoals(rich).some((item) => item.id === aura.id)).toBe(
      false,
    );
    expect(() => applyProgress(rich, { type: "goal", id: aura.id })).toThrow(
      "Choose an unowned item",
    );
    for (const time of [
      startsAt - 1,
      startsAt,
      endsAt - 1,
      endsAt,
      at(10, 31, 0, 0, 0, 2027),
    ])
      expect(() =>
        applyProgress(rich, { type: "buy", id: aura.id, at: time }),
      ).toThrow("never for sale");
  }
  expect(visibleAuraFamilies([]).map((family) => family.id)).not.toContain(
    "rngween",
  );
  expect(visibleAuraFamilies(["jack-o-glow"]).at(-1).id).toBe("rngween");
  expect(aurasInFamily("rngween", [])).toEqual([]);
  expect(aurasInFamily("rngween", ["phantom-veil"])).toEqual([
    productById.get("phantom-veil"),
  ]);
});

test("retired progress is dropped without erasing old auras or inheriting Halloween counts", () => {
  const legacy = {
    ...emptyProgress(),
    owned: ["static"],
    equipped: "static",
    tasks: {
      ...emptyTasks(),
      rngween: undefined,
      event: {
        id: "randomness-signal-2026",
        counts: { rolls: 200, rare: 40, banked: 5000000, taskClaims: 18 },
        earned: ["static", "bitstorm", "scramble", "hexdump"],
      },
    },
  };
  const { progress, repairs } = parseAndRepairProgress(JSON.stringify(legacy));
  expect(repairs).toEqual([]);
  expect(progress.owned).toEqual(["static", "bitstorm", "scramble", "hexdump"]);
  expect(progress.equipped).toBe("static");
  expect(progress.tasks.event).toBeUndefined();
  expect(progress.tasks.rngween).toEqual(emptyRngween());
  expect(() =>
    applyProgress(progress, {
      type: "claim-event-aura",
      id: "static",
      at: startsAt,
    }),
  ).toThrow("Unknown progress action");
  expect(parseRngween(legacy.tasks.event).rngween).toEqual(emptyRngween());
});

test("Halloween receipts are validated and restore collected auras after save repair", () => {
  const raw = {
    ...emptyProgress(),
    owned: [],
    tasks: { ...emptyTasks(), rngween: finishedEvent(["witchfire"]) },
  };
  const repaired = parseProgress(JSON.stringify(raw));
  expect(repaired.owned).toEqual(["witchfire"]);
  expect(repaired.tasks.rngween.earned).toEqual(["witchfire"]);
  expect(parseProgress(JSON.stringify(repaired))).toEqual(repaired);
  const damaged = parseRngween({
    ...finishedEvent(),
    counts: { rolls: -1, rare: 900, banked: "400000", taskClaims: 2 },
    earned: [
      "jack-o-glow",
      "phantom-veil",
      "phantom-veil",
      "witchfire",
      "blood-moon",
      "static",
    ],
  });
  expect(damaged.repaired).toBe(true);
  expect(damaged.rngween).toEqual({
    id: RNGWEEN_ID,
    counts: { rolls: 0, rare: 40, banked: 0, taskClaims: 2 },
    earned: ["phantom-veil"],
  });
  const foreign = parseRngween({
    ...finishedEvent(auraIds),
    id: "rngween-2027",
  });
  expect(foreign.rngween).toEqual(emptyRngween());
  expect(foreign.repaired).toBe(true);
  const capped = recordRngweenTally(
    emptyTasks(),
    { rolls: Number.MAX_SAFE_INTEGER, banked: 9999999 },
    startsAt,
  );
  expect(capped.counts.rolls).toBe(200);
  expect(capped.counts.banked).toBe(5000000);
});

test("Halloween ownership, equipped look and task progress survive Rebirth, Prestige and Rollback", () => {
  const base = {
    ...emptyProgress(),
    profile: testProfile,
    owned: [...auraIds, "quickwind-1"],
    equipped: "phantom-veil",
    tasks: { ...emptyTasks(), rngween: finishedEvent(auraIds) },
    discovered: allBadgeMetadata.map((badge) => badge.id),
    cycleEarnedEP: 300000000,
    totalEarned: 300000000,
  };
  for (const [type, counts] of [
    ["rebirth", { expectedRebirths: 0 }],
    ["ultra-rebirth", { expectedUltraRebirths: 0 }],
    ["rollback", { ultraRebirths: 3, expectedRollbacks: 0 }],
  ]) {
    const state = {
      ...base,
      rebirths: type === "rebirth" ? 0 : 6,
      ...(counts.ultraRebirths ? { ultraRebirths: counts.ultraRebirths } : {}),
    };
    const reset = applyProgress(state, { type, ...counts, at: endsAt });
    expect(reset.owned).toEqual(auraIds);
    expect(reset.equipped).toBe("phantom-veil");
    expect(reset.tasks.rngween).toEqual(base.tasks.rngween);
    const reloaded = parseProgress(JSON.stringify(reset));
    expect(reloaded.owned).toEqual(auraIds);
    expect(reloaded.tasks.rngween.earned).toEqual(auraIds);
  }
});

test("0.5.1 release notes describe RNGween and package versions agree", () => {
  expect(LATEST_VERSION).toBe("v0.5.1");
  expect(CHANGELOG[0].title).toBe("RNGween update");
  expect(CHANGELOG[0].body).toHaveLength(3);
  expect(CHANGELOG[0].body.join(" ").length).toBeLessThan(350);
  expect(CHANGELOG[0].body.join(" ")).not.toMatch(/local|timezone/i);
  expect(CHANGELOG[0].body.join(" ")).toContain("October 25–31, 2026");
  expect(CHANGELOG[0].body.join(" ")).toContain("never return");
  expect(JSON.parse(fs.readFileSync("package.json", "utf8")).version).toBe(
    "0.5.1",
  );
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  expect(lock.version).toBe("0.5.1");
  expect(lock.packages[""].version).toBe("0.5.1");
});

// ---- Browser integration --------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
});

test("October decoration has a Halloween favicon but no permanent banner or retired glitch", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(at(10, 21, 12)));
  await mockSeasonClock(page, at(10, 21, 12));
  await page.goto("/tasks");
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await expect(page.locator(".rngween-banner")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon-halloween.svg",
  );
  await expect(
    page.getByRole("heading", { name: "Tasks", level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator(".rngween-event, .signal-event, .tasks-nav-glitch-label"),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("R4ND0MN3S5");
  await expect(page.locator(".rngween-decor")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator(".rngween-decor")).toHaveCSS(
    "pointer-events",
    "none",
  );
});

test("collect a task aura, see only that reward in the shop, equip it free and reload it", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(at(10, 26, 12)));
  await mockSeasonClock(page, at(10, 26, 12));
  const tasks = {
    ...emptyTasks(),
    rngween: {
      ...emptyRngween(),
      counts: { rolls: 200, rare: 1, banked: 100000, taskClaims: 2 },
    },
  };
  await seedProgress(page, { tasks, balance: 123456, totalEarned: 123456 });
  await page.goto("/tasks");
  const panel = page.locator(".rngween-event");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-event-mission]")).toHaveCount(4);
  await expect(panel).toContainText("will not return after this event");
  await expect(
    panel.getByRole("button", { name: "Your Halloween collection" }),
  ).toHaveCount(0);
  await expect(
    panel.locator('[data-event-mission="blood-moon"]'),
  ).toContainText("2 / 18 tasks");
  const reward = panel.locator('[data-event-mission="jack-o-glow"]');
  await expect(reward).toHaveAttribute("data-state", "claimable");
  await reward
    .getByRole("button", { name: "Collect Jack-o'-Glow", exact: true })
    .click();
  await expect(reward).toHaveAttribute("data-state", "collected");
  await expect(
    panel.getByRole("progressbar", { name: "RNGween event progress" }),
  ).toHaveAttribute("value", "1");
  await expect(page.getByRole("status")).toContainText(
    "Jack-o'-Glow collected",
  );
  expect((await saved(page)).balance).toBe(123456);
  expect((await saved(page)).owned).toEqual(["jack-o-glow"]);
  await panel
    .getByRole("button", { name: "Your Halloween collection" })
    .click();
  await expect(page).toHaveURL(/\/shop\/auras\/rngween$/);
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(1);
  await expect(page.locator('[data-product="jack-o-glow"]')).toBeVisible();
  await expect(page.locator(".shop-family")).not.toContainText(
    /Phantom Veil|Witchfire|Blood Moon/,
  );
  await expect(page.locator(".shop-family .shop-price")).toHaveCount(0);
  await expect(page.locator(".shop-family button")).not.toContainText("Buy");
  await expect(page.locator(".shop-family-stat")).toHaveText("1 collected");
  await page.getByRole("button", { name: "Use original appearance" }).click();
  await page
    .locator('[data-product="jack-o-glow"]')
    .getByRole("button", { name: "Equip aura", exact: true })
    .click();
  await expect(page.locator('[data-product="jack-o-glow"]')).toHaveClass(
    /is-equipped/,
  );
  expect((await saved(page)).balance).toBe(123456);
  await page.reload();
  await expect(page.locator('[data-product="jack-o-glow"]')).toHaveClass(
    /is-equipped/,
  );
});

test("an empty exclusive collection stays hidden, including direct links and a rich wallet", async ({
  page,
}) => {
  await seedProgress(page, { balance: 100000000, totalEarned: 100000000 });
  const website = await mockSeasonClock(page, at(10, 10, 12));
  for (const time of [
    at(10, 10, 12),
    at(10, 28, 12),
    at(11, 1, 12),
    at(10, 28, 12, 0, 0, 2027),
  ]) {
    await page.clock.setFixedTime(new Date(time));
    website.set(time);
    await page.goto("/shop/auras");
    await expect(
      page.locator('.aura-family-banner[data-family="rngween"]'),
    ).toHaveCount(0);
    await expect(page.locator(".aura-family-banner")).toHaveCount(5);
    await page.goto("/shop/auras/rngween");
    await expect(
      page.locator('[data-family="rngween"], .is-event-aura'),
    ).toHaveCount(0);
    await expect(page.locator(".shop-crumb")).not.toContainText("RNGween");
    await expect(page.locator(".shop-card[data-product]")).toHaveCount(0);
    await expect(page.locator(".aura-family-banner")).toHaveCount(5);
  }
});

test("collected Halloween auras remain visible and equipable after the event, unowned ones never leak", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(at(11, 4, 12)));
  await mockSeasonClock(page, at(11, 4, 12));
  await seedProgress(page, {
    owned: ["phantom-veil", "blood-moon"],
    tasks: {
      ...emptyTasks(),
      rngween: finishedEvent(["phantom-veil", "blood-moon"]),
    },
    equipped: "none",
  });
  await page.goto("/shop/auras");
  const banner = page.locator('[data-family="rngween"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("2 collected · yours forever");
  await expect(banner.locator(".number-box")).toHaveCount(2);
  await expect(banner).not.toContainText(/Jack-o'-Glow|Witchfire|2 \/ 4/);
  await banner.click();
  await expect(page).toHaveURL(/\/shop\/auras\/rngween$/);
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(2);
  await expect(page.locator(".is-event-aura .shop-price")).toHaveCount(0);
  await page
    .locator('[data-product="blood-moon"]')
    .getByRole("button", { name: "Equip aura" })
    .click();
  await expect(page.locator('[data-product="blood-moon"]')).toHaveClass(
    /is-equipped/,
  );
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
  await page.goto("/settings");
  await expect(
    page.locator('.wardrobe-grid [data-cosmetic="phantom-veil"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.wardrobe-grid [data-cosmetic="blood-moon"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.wardrobe-grid [data-cosmetic="witchfire"], .wardrobe-grid [data-cosmetic="jack-o-glow"]',
    ),
  ).toHaveCount(0);
  await page.goto("/tasks");
  await expect(page.locator(".rngween-event")).toHaveCount(0);
});

test("the event appears at UTC midnight on Oct 25 without reloading or adding a banner", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(at(10, 24, 23, 59, 59)));
  await mockSeasonClock(page, at(10, 24, 23, 59, 59));
  await page.goto("/tasks");
  await expect(page.locator(".rngween-decor")).toBeAttached();
  await expect(page.locator(".rngween-event")).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.locator(".rngween-event")).toBeVisible();
  await expect(page.locator(".rngween-banner")).toHaveCount(0);
});

test("the event ends on Nov 1 UTC, while the Halloween palette and favicon stay for that day", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(at(10, 31, 23, 59, 59)));
  await mockSeasonClock(page, at(10, 31, 23, 59, 59));
  await page.goto("/tasks");
  await expect(page.locator(".rngween-event")).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator(".rngween-event")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon-halloween.svg",
  );
});

test("decoration and favicon revert exactly after Nov 3, preserving the saved dark theme", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(at(11, 3, 23, 59, 59)));
  await mockSeasonClock(page, at(11, 3, 23, 59, 59));
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
  await seedProgress(page, {
    tasks: { ...emptyTasks(), rngween: finishedEvent() },
  });
  await page.goto("/tasks");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await expect(page.locator(".rngween-event")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
  ).toBe("#17121e");
  const regularBackground = await page.evaluate(() => {
    const root = document.documentElement;
    delete root.dataset.season;
    const background = getComputedStyle(root).getPropertyValue("--bg").trim();
    root.dataset.season = "rngween";
    return background;
  });
  await page.clock.runFor(1000);
  await expect(
    page.locator(".rngween-event, .rngween-banner, .rngween-decor"),
  ).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("rng-theme"))).toBe(
    "dark",
  );
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
  ).toBe(regularBackground);
  expect((await saved(page)).owned).toEqual([]);
});

for (const timezoneId of [
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Europe/Madrid",
]) {
  test(`Halloween ignores the device date and ${timezoneId} timezone`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    try {
      await page.clock.install({ time: new Date("2030-02-15T12:00:00Z") });
      await mockSeasonClock(page, startsAt);
      await page.goto("/tasks");
      const calendar = await page.evaluate(
        async ({ start, end }) => {
          const { rngweenCalendar } = await import("/src/rngween.js");
          return {
            before: rngweenCalendar(start - 1),
            start: rngweenCalendar(start),
            last: rngweenCalendar(end - 1),
            end: rngweenCalendar(end),
          };
        },
        { start: startsAt, end: endsAt },
      );
      expect(calendar.start.startsAt).toBe(startsAt);
      expect(calendar.start.endsAt).toBe(endsAt);
      expect(calendar.before.phase).toBe("upcoming");
      expect(calendar.start.phase).toBe("active");
      expect(calendar.last).toMatchObject({ decorated: true, phase: "active" });
      expect(calendar.end).toMatchObject({ decorated: true, phase: "ended" });
      await expect(page.locator(".rngween-event")).toBeVisible();
      await expect(page.locator(".rngween-event")).not.toContainText(
        /local time|local timezone/i,
      );
    } finally {
      await context.close();
    }
  });
}

test("changing the browser clock or reloading cannot open a closed website event", async ({
  page,
}) => {
  await mockSeasonClock(page, at(11, 4, 12));
  await page.clock.setFixedTime(new Date(at(10, 26, 12)));
  await seedProgress(page, {
    tasks: { ...emptyTasks(), rngween: finishedEvent() },
  });
  await page.goto("/tasks");
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
  await page.clock.setFixedTime(new Date(at(10, 25, 12)));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tasks", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
  expect((await saved(page)).owned).toEqual([]);
});

test("an unverifiable website date fails closed without hiding collected cosmetics", async ({
  page,
}) => {
  await mockSeasonClock(page, null);
  await page.clock.setFixedTime(new Date(at(10, 26, 12)));
  await seedProgress(page, {
    owned: ["witchfire"],
    tasks: { ...emptyTasks(), rngween: finishedEvent(["witchfire"]) },
  });
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
  await page.goto("/shop/auras/rngween");
  await expect(page.locator('[data-product="witchfire"]')).toBeVisible();
  await page
    .locator('[data-product="witchfire"]')
    .getByRole("button", { name: "Equip aura" })
    .click();
  await expect(page.locator('[data-product="witchfire"]')).toHaveClass(
    /is-equipped/,
  );
});

test("collecting an aura needs a fresh website date, not a cached clock after a network failure", async ({
  page,
}) => {
  const website = await mockSeasonClock(page, at(10, 26, 12));
  await seedProgress(page, {
    tasks: { ...emptyTasks(), rngween: finishedEvent() },
  });
  await page.goto("/tasks");
  const reward = page.getByRole("button", {
    name: "Collect Jack-o'-Glow",
    exact: true,
  });
  await expect(reward).toBeEnabled();
  website.set(null);
  await reward.click();
  await expect(page.getByRole("alert")).toContainText(
    "Connect to the website to verify RNGween availability",
  );
  expect((await saved(page)).owned).toEqual([]);
  expect((await saved(page)).tasks.rngween.earned).toEqual([]);
});

test("Halloween fits phones in both themes and reduced motion stills the decoration and auras", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(at(10, 28, 12)));
  await mockSeasonClock(page, at(10, 28, 12));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tasks");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await chooseTheme(page, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    if (theme === "dark")
      await expect(page.locator("html")).toHaveAttribute(
        "data-season",
        "rngween",
      );
    else await expect(page.locator(".rngween-decor")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const bat of await page.locator(".rngween-bat").all())
      await expect(bat).toHaveCSS("animation-name", "none");
    for (const id of auraIds) {
      const box = page.locator(`.rngween-event [data-cosmetic="${id}"]`);
      await expect(box).toHaveCount(1);
      await expect(box.locator(".box-halo")).toHaveCSS(
        "animation-name",
        "none",
      );
      await expect(box.locator(".box-particles i").first()).toHaveCSS(
        "animation-name",
        "none",
      );
    }
  }
});

test("Halloween decorations are actually painted only in dark mode on desktop and phone", async ({
  page,
}) => {
  await mockSeasonClock(page, at(10, 26, 12));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tasks");
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await expect(page.locator("#root")).toHaveCSS("isolation", "isolate");
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await chooseTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      if (theme === "light") {
        await expect(page.locator(".rngween-decor")).toHaveCount(0);
        await expect(page.locator(".rngween-event")).toBeVisible();
        continue;
      }
      const clip = await page.locator(".rngween-pumpkin").first().boundingBox();
      expect(clip).not.toBeNull();
      const painted = await page.screenshot({ clip });
      await page.locator(".rngween-decor").evaluate((decor) => {
        decor.style.visibility = "hidden";
      });
      const withoutDecoration = await page.screenshot({ clip });
      await page.locator(".rngween-decor").evaluate((decor) => {
        decor.style.removeProperty("visibility");
      });
      expect(painted.equals(withoutDecoration)).toBe(false);
      await expect(page.locator(".rngween-event")).toBeVisible();
    }
  }
});

test("the new challenges are harder, without revoking auras collected under the earlier goals", () => {
  expect(RNGWEEN_MISSIONS.map(({ goal }) => goal)).toEqual([
    200, 40, 5000000, 18,
  ]);
  const previous = {
    ...emptyRngween(),
    counts: { rolls: 20, rare: 5, banked: 400000, taskClaims: 6 },
  };
  const tasks = { ...emptyTasks(), rngween: previous };
  expect(rngweenState(tasks, startsAt).ready).toBe(0);
  for (const aura of auraIds)
    expect(() => claimRngweenAura(tasks, aura, startsAt)).toThrow(
      "Complete the mission",
    );
  const grandfathered = parseProgress(
    JSON.stringify({
      ...emptyProgress(),
      equipped: "blood-moon",
      tasks: { ...tasks, rngween: { ...previous, earned: auraIds } },
    }),
  );
  expect(grandfathered.owned).toEqual(auraIds);
  expect(grandfathered.equipped).toBe("blood-moon");
  expect(grandfathered.tasks.rngween.counts).toEqual(previous.counts);
  expect(rngweenState(grandfathered.tasks, startsAt)).toMatchObject({
    collected: 4,
    complete: 4,
    ready: 0,
  });
  expect(parseProgress(JSON.stringify(grandfathered))).toEqual(grandfathered);
});
