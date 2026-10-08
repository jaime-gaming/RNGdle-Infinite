import { test, expect } from "./helpers/clock.js";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
  parseProgress,
  PROGRESS_KEY,
  recoverUnsavedRolls,
} from "../src/progress.js";
import {
  emptyTasks,
  nextReset,
  periodKey,
  recordTally,
  taskById,
  taskProgress,
  taskSummary,
  TASKS,
} from "../src/tasks.js";
import { cycleEarnedEp, rebirthRequirement } from "../src/rebirth.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";

// Local-time instants, so the calendar assertions read the same in any zone.
const at = (y, m, d, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

// A settled online roll, as the game records one: a tier, a score and badges.
// Tiers match the EP they carry, as the scoring table gives them.
const roll = (id, time, tier = "trash", ep = 1000, badges = []) => ({
  type: "complete",
  id,
  at: time,
  cooldownUntil: 0,
  result: { number: 1, totalEP: ep, tier, badges },
});

const zeroCounts = () => ({
  rolls: 0,
  rare: 0,
  discovered: 0,
  banked: 0,
  skills: 0,
});

test("periods are local days and Monday-started weeks, and reset at local midnight", () => {
  // Thursday 8 October 2026 counts as its own day, and the week before it
  // began on Monday the 5th.
  expect(periodKey("daily", at(2026, 10, 8, 23, 59))).toBe("2026-10-08");
  expect(periodKey("daily", at(2026, 10, 9, 0, 1))).toBe("2026-10-09");
  expect(periodKey("weekly", at(2026, 10, 8))).toBe("2026-10-05");
  // Sunday still belongs to the week that started on Monday the 5th.
  expect(periodKey("weekly", at(2026, 10, 11, 23, 59))).toBe("2026-10-05");
  expect(periodKey("weekly", at(2026, 10, 12, 0, 1))).toBe("2026-10-12");
  expect(nextReset("daily", at(2026, 10, 8, 23, 0))).toBe(
    at(2026, 10, 9, 0, 0),
  );
  expect(nextReset("weekly", at(2026, 10, 8))).toBe(at(2026, 10, 12, 0, 0));
});

test("online rolls advance every task they count, and offline rolls advance none", () => {
  const base = { ...emptyProgress(), profile: testProfile };
  const online = applyProgress(
    base,
    roll("a", at(2026, 10, 8, 9), "rare", 15000),
  );
  expect(online.tasks.daily.period).toBe("2026-10-08");
  expect(online.tasks.daily.counts).toEqual({
    ...zeroCounts(),
    rolls: 1,
    rare: 1,
    banked: 15000,
  });
  expect(online.tasks.weekly.counts).toEqual(online.tasks.daily.counts);
  // An offline roll is a passive reward, so it is never counted as play.
  const offline = applyProgress(online, {
    ...roll("b", at(2026, 10, 8, 10), "godly", 999),
    source: "offline",
  });
  expect(offline.tasks).toEqual(online.tasks);
});

test("a task pays its reward once per reset, into the wallet and the log", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  for (let i = 0; i < 10; i++)
    state = applyProgress(state, roll(`r${i}`, at(2026, 10, 8, 9) + i * 60000));
  const before = state.balance;
  expect(
    taskProgress(state.tasks, taskById("daily-rolls"), at(2026, 10, 8, 20)),
  ).toMatchObject({ count: 10, complete: true, state: "claimable" });

  const claimed = applyProgress(state, {
    type: "claim-task",
    id: "daily-rolls",
    at: at(2026, 10, 8, 20),
  });
  expect(claimed.balance - before).toBe(10000);
  expect(claimed.totalEarned - state.totalEarned).toBe(10000);
  expect(claimed.history.at(-1)).toMatchObject({
    type: "task",
    taskId: "daily-rolls",
    cadence: "daily",
    ep: 10000,
  });
  // Claimed once: the same task cannot pay again in the same reset.
  expect(() =>
    applyProgress(claimed, {
      type: "claim-task",
      id: "daily-rolls",
      at: at(2026, 10, 8, 21),
    }),
  ).toThrow(/already claimed/);
  // A task that is not finished is refused, and pays nothing.
  expect(() =>
    applyProgress(claimed, {
      type: "claim-task",
      id: "daily-rare",
      at: at(2026, 10, 8, 21),
    }),
  ).toThrow(/Finish this task/);
  expect(() =>
    applyProgress(claimed, { type: "claim-task", id: "not-a-task" }),
  ).toThrow(/does not exist/);
});

test("a new period starts from zero, so an unclaimed reward expires at reset", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  for (let i = 0; i < 10; i++)
    state = applyProgress(state, roll(`d${i}`, at(2026, 10, 8, 9) + i * 60000));
  expect(taskSummary(state.tasks, at(2026, 10, 8, 23)).ready).toBeGreaterThan(
    0,
  );
  // The next day has no record of yesterday's tallies, so nothing is ready.
  const tomorrow = at(2026, 10, 9, 9);
  expect(
    taskProgress(state.tasks, taskById("daily-rolls"), tomorrow),
  ).toMatchObject({
    count: 0,
    state: "open",
  });
  expect(() =>
    applyProgress(state, {
      type: "claim-task",
      id: "daily-rolls",
      at: tomorrow,
    }),
  ).toThrow(/Finish this task/);
  // One roll tomorrow starts the new count from one.
  const next = applyProgress(state, roll("tomorrow", tomorrow));
  expect(next.tasks.daily.period).toBe("2026-10-09");
  expect(next.tasks.daily.counts.rolls).toBe(1);
  expect(next.tasks.daily.claimed).toEqual([]);
});

test("a replayed settlement from an earlier period never reopens a later one", () => {
  const later = recordTally(
    emptyTasks(),
    { ...zeroCounts(), rolls: 1 },
    at(2026, 10, 9),
  );
  // A settlement from the Sunday before (its week began on the 28th) belongs to
  // earlier periods on both cadences, so neither may move.
  const replayed = recordTally(
    later,
    { ...zeroCounts(), rolls: 1 },
    at(2026, 10, 4),
  );
  expect(replayed.daily).toEqual(later.daily);
  expect(replayed.weekly).toEqual(later.weekly);
  // The same week, by contrast, is still the current week and does count.
  const sameWeek = recordTally(
    later,
    { ...zeroCounts(), rolls: 1 },
    at(2026, 10, 8),
  );
  expect(sameWeek.weekly.counts.rolls).toBe(2);
  expect(sameWeek.daily).toEqual(later.daily);
});

test("task EP never counts towards a rebirth, and claimed tasks survive one", () => {
  const rungs = rebirthRequirement(0);
  const ids = allBadgeMetadata.map((b) => b.id);
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    discovered: ids.slice(0, rungs.badges),
  };
  // Enough rolls to claim a daily task, then a rebirth gate worth of cycle EP.
  for (let i = 0; i < 10; i++)
    state = applyProgress(state, roll(`c${i}`, at(2026, 10, 8, 9) + i * 60000));
  state = applyProgress(state, {
    type: "claim-task",
    id: "daily-rolls",
    at: at(2026, 10, 8, 20),
  });
  expect(state.balance).toBe(10000 + 10000);
  // The gate reads roll EP only: the 10,000 reward is not cycle EP.
  expect(cycleEarnedEp(state)).toBe(10000);
  // A roll that clears the first rung's EP gate, then the rebirth itself.
  state = applyProgress(
    state,
    roll("gate", at(2026, 10, 8, 21), "godly", rungs.ep),
  );
  expect(cycleEarnedEp(state)).toBe(10000 + rungs.ep);
  const reborn = applyProgress(state, {
    type: "rebirth",
    expectedRebirths: 0,
    at: at(2026, 10, 9, 9),
  });
  expect(reborn.rebirths).toBe(1);
  // The claim is still on record after the cycle ends, as the account keeps it.
  expect(reborn.tasks.daily.claimed).toEqual(["daily-rolls"]);
});

test("unreadable task progress is reset and reported, while a save without tasks loads empty", () => {
  const broken = parseAndRepairProgress(
    JSON.stringify({ ...emptyProgress(), tasks: "garbage" }),
  );
  expect(broken.progress.tasks).toEqual(emptyTasks());
  expect(broken.repairs.join(" ")).toContain("task progress was unreadable");

  const negative = parseAndRepairProgress(
    JSON.stringify({
      ...emptyProgress(),
      tasks: {
        daily: { period: "2026-10-08", counts: { rolls: -4 }, claimed: [] },
      },
    }),
  );
  expect(negative.progress.tasks.daily.counts.rolls).toBe(0);
  expect(negative.repairs.join(" ")).toContain("task progress was unreadable");

  const legacy = { ...emptyProgress() };
  delete legacy.tasks;
  const loaded = parseAndRepairProgress(JSON.stringify(legacy));
  expect(loaded.progress.tasks).toEqual(emptyTasks());
  expect(loaded.repairs).toEqual([]);

  // Unknown claims and unknown metrics are dropped, not trusted.
  expect(
    parseTasksShape({
      daily: {
        period: "2026-10-08",
        counts: { rolls: 2, nope: 9 },
        claimed: ["daily-rolls", "weekly-rolls", "x"],
      },
    }),
  ).toEqual({
    daily: {
      period: "2026-10-08",
      counts: { ...zeroCounts(), rolls: 2 },
      claimed: ["daily-rolls"],
    },
    weekly: { period: "", counts: zeroCounts(), claimed: [] },
  });
});

// The loader's view of a tasks object, without the rest of a save.
function parseTasksShape(tasks) {
  return parseAndRepairProgress(JSON.stringify({ ...emptyProgress(), tasks }))
    .progress.tasks;
}

test("a save with tasks, claims and their history reloads exactly as it was", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  for (let i = 0; i < 10; i++)
    state = applyProgress(state, roll(`s${i}`, at(2026, 10, 8, 9) + i * 60000));
  state = applyProgress(state, {
    type: "claim-task",
    id: "daily-rolls",
    at: at(2026, 10, 8, 20),
  });
  expect(parseProgress(JSON.stringify(state))).toEqual(state);
});

test("only the rolls this tab failed to save are owed again after a recovery", () => {
  const base = { ...emptyProgress(), profile: testProfile };
  // A roll saved earlier, long enough ago that its receipt has been forgotten.
  const saved = applyProgress(
    base,
    roll("saved-long-ago", at(2026, 10, 8, 9), "common", 5000),
  );
  // Another tab has since removed that entry from the log to free space.
  const stored = {
    ...saved,
    history: saved.history.filter((e) => e.type !== "roll"),
    receipts: [],
  };
  // This tab kept settling rolls in memory while its saves were failing.
  const temporary = applyProgress(
    saved,
    roll("unsaved", at(2026, 10, 8, 10), "common", 3000),
  );

  // Without the list of unsaved rolls, the saved roll would be credited again.
  expect(recoverUnsavedRolls(stored, temporary).balance).toBe(
    stored.balance + 8000,
  );
  // With it, only the roll that never reached storage is paid.
  const recovered = recoverUnsavedRolls(
    stored,
    temporary,
    new Set(["unsaved"]),
  );
  expect(recovered.balance).toBe(stored.balance + 3000);
  expect(
    recovered.history.filter((e) => e.type === "roll").map((e) => e.id),
  ).toEqual(["unsaved"]);
});

test("the Tasks page lists both cadences, and a finished task is claimed once from the page", async ({
  page,
}) => {
  const now = Date.now();
  const counts = { ...zeroCounts(), rolls: 10 };
  await seedProgress(page, {
    balance: 2000,
    totalEarned: 2000,
    tasks: {
      daily: { period: periodKey("daily", now), counts, claimed: [] },
      weekly: {
        period: periodKey("weekly", now),
        counts: { ...zeroCounts(), rolls: 40 },
        claimed: [],
      },
    },
  });
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  for (const name of ["Daily", "Weekly"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  for (const task of TASKS)
    await expect(page.locator(`[data-task="${task.id}"]`)).toBeVisible();
  await expect(page.locator('[data-task="daily-rolls"]')).toHaveAttribute(
    "data-state",
    "claimable",
  );
  await expect(page.locator('[data-task="weekly-rolls"]')).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(page.locator('[data-task="weekly-rolls"]')).toContainText(
    "40 / 100",
  );
  await expect(page.locator(".tasks-summary")).toContainText(
    "1 ready to claim",
  );

  await page
    .getByRole("button", { name: "Claim reward for Roll 10 numbers" })
    .click();
  await expect(page.getByRole("status")).toContainText("+10,000 EP claimed");
  await expect(page.locator('[data-task="daily-rolls"]')).toHaveAttribute(
    "data-state",
    "claimed",
  );
  await expect(
    page.getByRole("button", { name: "Claim reward for Roll 10 numbers" }),
  ).toHaveCount(0);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.balance).toBe(12000);
  expect(saved.tasks.daily.claimed).toEqual(["daily-rolls"]);
  expect(saved.history.at(-1)).toMatchObject({ type: "task", ep: 10000 });
});

test("a ready task shows in the header and on the roll page until it is claimed", async ({
  page,
}) => {
  const now = Date.now();
  await seedProgress(page, {
    tasks: {
      daily: {
        period: periodKey("daily", now),
        counts: { ...zeroCounts(), rolls: 10 },
        claimed: [],
      },
      weekly: {
        period: periodKey("weekly", now),
        counts: zeroCounts(),
        claimed: [],
      },
    },
  });
  await page.goto("/");
  const tab = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Tasks, ready to claim" });
  await expect(tab.locator(".nav-ready-dot")).toHaveCount(1);
  await expect(page.locator(".roll-progress-links")).toContainText(
    "1 task ready to claim",
  );
  await page
    .locator(".roll-progress-links")
    .getByRole("button", {
      name: "1 task ready to claim",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Claim reward for Roll 10 numbers" })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", {
        name: "Tasks",
        exact: true,
      }),
  ).toBeVisible();
  await expect(page.locator(".nav-ready-dot")).toHaveCount(0);
});

test("a claimed task is written to History, and the Tasks filter shows only those", async ({
  page,
}) => {
  const now = Date.now();
  await seedProgress(page, {
    balance: 10000,
    totalEarned: 10000,
    history: [
      {
        id: `task:daily-rolls:${periodKey("daily", now)}`,
        type: "task",
        at: now - 60000,
        taskId: "daily-rolls",
        cadence: "daily",
        name: "Roll 10 numbers",
        ep: 10000,
      },
    ],
  });
  await page.goto("/history");
  const event = page.locator('[data-event-type="task"]');
  await expect(event).toHaveCount(1);
  await expect(event).toContainText("Task claimed · Roll 10 numbers");
  await expect(event).toContainText("+10,000 EP");
  await expect(event).toContainText("Daily task");
  await page
    .getByRole("group", { name: "Activity filters" })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await expect(page.locator(".activity-event")).toHaveCount(1);
});
