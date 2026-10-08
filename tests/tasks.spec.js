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
  ACTIVE_PER_PERIOD,
  activeTaskIds,
  emptyTasks,
  nextReset,
  periodKey,
  recordTally,
  skipStatus,
  taskById,
  taskProgress,
  taskSummary,
  TASK_CADENCES,
  TASK_METRICS,
  TASKS,
} from "../src/tasks.js";
import { formatEP } from "../src/roll-data.js";
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

const zeroCounts = () =>
  Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));

const DAY = 24 * 60 * 60 * 1000;

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
  // The peak is the best single roll of the period: this roll's own EP.
  expect(online.tasks.daily.counts).toEqual({
    ...zeroCounts(),
    rolls: 1,
    rare: 1,
    banked: 15000,
    peakEP: 15000,
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
  const reward = taskById("daily-rolls").reward;
  expect(claimed.balance - before).toBe(reward);
  expect(claimed.totalEarned - state.totalEarned).toBe(reward);
  expect(claimed.history.at(-1)).toMatchObject({
    type: "task",
    taskId: "daily-rolls",
    cadence: "daily",
    ep: reward,
  });
  // Claimed once: the same task cannot pay again in the same reset.
  expect(() =>
    applyProgress(claimed, {
      type: "claim-task",
      id: "daily-rolls",
      at: at(2026, 10, 8, 21),
    }),
  ).toThrow(/already claimed/);
  // A task on the list that is not finished is refused, and pays nothing.
  const unfinished = activeTaskIds(
    claimed.tasks,
    "daily",
    at(2026, 10, 8, 21),
  ).find((id) => id !== "daily-rolls");
  expect(() =>
    applyProgress(claimed, {
      type: "claim-task",
      id: unfinished,
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
      id: activeTaskIds(state.tasks, "daily", tomorrow)[0],
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
  expect(state.balance).toBe(10000 + taskById("daily-rolls").reward);
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
      swaps: [],
      bonus: false,
    },
    weekly: {
      period: "",
      counts: zeroCounts(),
      claimed: [],
      swaps: [],
      bonus: false,
    },
    skip: { tokens: 0, boughtAt: null },
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
  // Whatever the day deals, the first daily task is finished and the weekly
  // list is partway along. The page shows exactly the tasks the day deals.
  const [dailyId] = activeTaskIds(emptyTasks(), "daily", now);
  const daily = taskById(dailyId);
  const tasks = {
    ...emptyTasks(),
    daily: {
      period: periodKey("daily", now),
      counts: { ...zeroCounts(), [daily.metric]: daily.goal },
      claimed: [],
      swaps: [],
    },
    weekly: {
      period: periodKey("weekly", now),
      counts: { ...zeroCounts(), rolls: 40 },
      claimed: [],
      swaps: [],
    },
  };
  await seedProgress(page, { balance: 2000, totalEarned: 2000, tasks });
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  for (const name of ["Daily", "Weekly"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  for (const cadence of TASK_CADENCES)
    for (const id of activeTaskIds(tasks, cadence, now))
      await expect(page.locator(`[data-task="${id}"]`)).toBeVisible();
  // Only the tasks on the list are shown: the rest of each pool stays hidden.
  await expect(page.locator("[data-task]")).toHaveCount(
    TASK_CADENCES.length * ACTIVE_PER_PERIOD,
  );
  await expect(page.locator(`[data-task="${dailyId}"]`)).toHaveAttribute(
    "data-state",
    "claimable",
  );
  await expect(page.locator(".tasks-summary")).toContainText(
    `${taskSummary(tasks, now).ready} to claim`,
  );

  await page
    .getByRole("button", { name: `Claim reward for ${daily.title}` })
    .click();
  const notice = page.locator("article.toast.is-reward");
  await expect(notice).toContainText(`+${formatEP(daily.reward)} EP`);
  await expect(notice).toContainText(daily.title);
  await expect(page.locator(`[data-task="${dailyId}"]`)).toHaveAttribute(
    "data-state",
    "claimed",
  );
  await expect(
    page.getByRole("button", { name: `Claim reward for ${daily.title}` }),
  ).toHaveCount(0);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.balance).toBe(2000 + daily.reward);
  expect(saved.tasks.daily.claimed).toEqual([dailyId]);
  expect(saved.history.at(-1)).toMatchObject({
    type: "task",
    ep: daily.reward,
  });
});

test("a ready task shows in the header and on the roll page until it is claimed", async ({
  page,
}) => {
  const now = Date.now();
  const [dailyId] = activeTaskIds(emptyTasks(), "daily", now);
  const daily = taskById(dailyId);
  const tasks = {
    ...emptyTasks(),
    daily: {
      period: periodKey("daily", now),
      counts: { ...zeroCounts(), [daily.metric]: daily.goal },
      claimed: [],
      swaps: [],
    },
  };
  const ready = taskSummary(tasks, now).ready;
  await seedProgress(page, { tasks });
  await page.goto("/");
  const tab = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Tasks, ready to claim" });
  await expect(tab.locator(".nav-ready-dot")).toHaveCount(1);
  await expect(page.locator(".roll-progress-links")).toContainText(
    `${ready} ${ready === 1 ? "task" : "tasks"} ready to claim`,
  );
  await page
    .locator(".roll-progress-links")
    .getByRole("button", {
      name: `${ready} ${ready === 1 ? "task" : "tasks"} ready to claim`,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Claim reward for ${daily.title}` })
    .click();
  const after = taskSummary(
    { ...tasks, daily: { ...tasks.daily, claimed: [dailyId] } },
    now,
  ).ready;
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-ready-dot")).toHaveCount(after ? 1 : 0);
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

test("each period deals four of twelve tasks, the same on every device, and the list changes from day to day", () => {
  for (const cadence of TASK_CADENCES)
    expect(TASKS.filter((task) => task.cadence === cadence)).toHaveLength(12);
  const day = (d) => at(2026, 10, d, 12);
  const list = activeTaskIds(emptyTasks(), "daily", day(8));
  expect(list).toHaveLength(ACTIVE_PER_PERIOD);
  expect(new Set(list).size).toBe(ACTIVE_PER_PERIOD);
  // Nothing about the list is stored, so any save at this moment deals the same
  // four, whatever it held before.
  const elsewhere = {
    ...emptyTasks(),
    daily: {
      period: "2026-10-01",
      counts: zeroCounts(),
      claimed: [],
      swaps: [],
    },
  };
  expect(activeTaskIds(elsewhere, "daily", day(8))).toEqual(list);
  // A fortnight of days does not keep returning one list.
  const lists = new Set(
    Array.from({ length: 14 }, (_, i) =>
      activeTaskIds(emptyTasks(), "daily", day(8 + i)).join("|"),
    ),
  );
  expect(lists.size).toBeGreaterThan(7);
  for (const id of activeTaskIds(emptyTasks(), "weekly", day(8)))
    expect(taskById(id).cadence).toBe("weekly");
});

test("an online roll counts Epic or better, and a Rare that is not Epic does not", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  state = applyProgress(
    state,
    roll("rare-1", at(2026, 10, 8, 9), "rare", 15000),
  );
  expect(state.tasks.daily.counts).toMatchObject({ rare: 1, epic: 0 });
  state = applyProgress(
    state,
    roll("epic-1", at(2026, 10, 8, 10), "epic", 40000),
  );
  expect(state.tasks.daily.counts).toMatchObject({ rare: 2, epic: 1 });
});

test("a Task Skip swaps an open task for the next one in its pool, which starts from zero", () => {
  const day = at(2026, 10, 8, 12);
  // Two skips bought three days apart: the second purchase waits for the first.
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 200000,
    totalEarned: 200000,
  };
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: at(2026, 10, 5, 12),
  });
  expect(() =>
    applyProgress(state, {
      type: "buy",
      id: "task-skip",
      at: at(2026, 10, 6, 12),
    }),
  ).toThrow(/available in/);
  state = applyProgress(state, { type: "buy", id: "task-skip", at: day });
  // Bought just now, so the next purchase is three days away.
  expect(skipStatus(state.tasks, day)).toMatchObject({
    tokens: 2,
    waitMs: 3 * DAY,
  });
  // Rolls made today give every metric a count, so a new task could start ahead.
  for (let i = 0; i < 3; i++)
    state = applyProgress(state, roll(`k${i}`, day + i * 60000, "epic", 40000));
  const listed = activeTaskIds(state.tasks, "daily", day);
  const out = listed.find(
    (id) => taskProgress(state.tasks, taskById(id), day).state === "open",
  );
  // A finished task is claimed, not skipped.
  const finished = {
    ...state,
    tasks: recordTally(
      state.tasks,
      { ...zeroCounts(), [taskById(out).metric]: taskById(out).goal },
      day,
    ),
  };
  expect(() =>
    applyProgress(finished, { type: "skip-task", id: out, at: day }),
  ).toThrow(/Claim a finished task/);
  // An open task is swapped, one token is spent, and no EP moves.
  const swapped = applyProgress(state, { type: "skip-task", id: out, at: day });
  expect(swapped.balance).toBe(state.balance);
  expect(skipStatus(swapped.tasks, day).tokens).toBe(1);
  const after = activeTaskIds(swapped.tasks, "daily", day);
  expect(after).toHaveLength(ACTIVE_PER_PERIOD);
  expect(after).not.toContain(out);
  const incoming = after.find((id) => !listed.includes(id));
  expect(incoming).toBeDefined();
  expect(taskById(incoming).cadence).toBe("daily");
  // The new task's metric already counts today's rolls. A running total starts
  // at zero from the swap, while a peak reads the best roll of the period (here
  // one worth 40,000 EP), so a peak swapped in later can already be on its way.
  const incomingTask = taskById(incoming);
  expect(taskProgress(swapped.tasks, incomingTask, day)).toMatchObject({
    count: incomingTask.metric === "peakEP" ? 40000 : 0,
    state: "open",
  });
  // A task skipped this period never comes back, even after another swap.
  const again = applyProgress(swapped, {
    type: "skip-task",
    id: incoming,
    at: day,
  });
  expect(activeTaskIds(again.tasks, "daily", day)).not.toContain(out);
  // Both tokens are spent, so a third skip has nothing to use.
  expect(() =>
    applyProgress(again, {
      type: "skip-task",
      id: activeTaskIds(again.tasks, "daily", day)[0],
      at: day,
    }),
  ).toThrow(/no Task Skip/);
  // The next day is a new deal, and yesterday's swaps belong to yesterday.
  const tomorrow = at(2026, 10, 9, 12);
  expect(activeTaskIds(again.tasks, "daily", tomorrow)).toEqual(
    activeTaskIds(emptyTasks(), "daily", tomorrow),
  );
});

test("a claimed task cannot be skipped, and the refused skip spends nothing", () => {
  const day = at(2026, 10, 8, 12);
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 200000,
    totalEarned: 200000,
  };
  state = applyProgress(state, { type: "buy", id: "task-skip", at: day });
  for (let i = 0; i < 10; i++)
    state = applyProgress(state, roll(`c${i}`, day + i * 60000));
  expect(activeTaskIds(state.tasks, "daily", day)).toContain("daily-rolls");
  state = applyProgress(state, {
    type: "claim-task",
    id: "daily-rolls",
    at: day + 3600000,
  });
  expect(() =>
    applyProgress(state, {
      type: "skip-task",
      id: "daily-rolls",
      at: day + 3600000,
    }),
  ).toThrow(/claimed task cannot be skipped/);
  expect(state.tasks.daily.claimed).toEqual(["daily-rolls"]);
  expect(skipStatus(state.tasks, day).tokens).toBe(1);
});

test("a Task Skip costs its price, is bought once every three days, and holds three", () => {
  const start = 500000;
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: start,
    totalEarned: start,
  };
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: at(2026, 10, 1, 12),
  });
  expect(state.balance).toBe(start - 60000);
  // A Skip is a use, not an item: it never joins the owned list, and it is
  // logged as a purchase like any other.
  expect(state.owned).not.toContain("task-skip");
  expect(state.history.at(-1)).toMatchObject({
    type: "purchase",
    productId: "task-skip",
    ep: 60000,
  });
  // Two hours later the wait still runs, and nothing is spent.
  expect(() =>
    applyProgress(state, {
      type: "buy",
      id: "task-skip",
      at: at(2026, 10, 1, 14),
    }),
  ).toThrow(/available in/);
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: at(2026, 10, 4, 12),
  });
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: at(2026, 10, 7, 12),
  });
  expect(skipStatus(state.tasks, at(2026, 10, 7, 13))).toMatchObject({
    tokens: 3,
  });
  // A save holds three at most.
  expect(() =>
    applyProgress(state, {
      type: "buy",
      id: "task-skip",
      at: at(2026, 10, 10, 12),
    }),
  ).toThrow(/already hold 3/);
  // Too dear is refused, with no change.
  const broke = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 1000,
    totalEarned: 1000,
  };
  expect(() =>
    applyProgress(broke, {
      type: "buy",
      id: "task-skip",
      at: at(2026, 10, 1, 12),
    }),
  ).toThrow(/Not enough EP/);
});

test("skip tokens, purchase time and swaps reload exactly, and a forged swap is dropped", () => {
  const day = at(2026, 10, 8, 12);
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 200000,
    totalEarned: 200000,
  };
  state = applyProgress(state, { type: "buy", id: "task-skip", at: day });
  const [first] = activeTaskIds(state.tasks, "daily", day);
  state = applyProgress(state, { type: "skip-task", id: first, at: day });
  expect(parseProgress(JSON.stringify(state))).toEqual(state);
  // A swap that takes out a task that was never on the list, and brings in one
  // that already was, cannot have happened: it is dropped on load and reported.
  const forged = parseAndRepairProgress(
    JSON.stringify({
      ...emptyProgress(),
      tasks: {
        ...emptyTasks(),
        daily: {
          period: "2026-10-08",
          counts: zeroCounts(),
          claimed: [],
          swaps: [{ out: "daily-spot", in: "daily-rolls", base: 0 }],
        },
      },
    }),
  );
  expect(forged.progress.tasks.daily.swaps).toEqual([]);
  expect(forged.repairs.join(" ")).toContain("task progress was unreadable");
  // More tokens than a save can hold is not trusted either.
  const greedy = parseAndRepairProgress(
    JSON.stringify({
      ...emptyProgress(),
      tasks: { ...emptyTasks(), skip: { tokens: 9, boughtAt: 0 } },
    }),
  );
  expect(greedy.progress.tasks.skip).toEqual({ tokens: 0, boughtAt: null });
  expect(greedy.repairs.join(" ")).toContain("task progress was unreadable");
});

test("the Tasks page swaps an open task only after a confirm, and spends one token", async ({
  page,
}) => {
  const now = Date.now();
  await seedProgress(page, {
    tasks: { ...emptyTasks(), skip: { tokens: 1, boughtAt: now - 4 * DAY } },
  });
  await page.goto("/tasks");
  const [id] = activeTaskIds(emptyTasks(), "daily", now);
  const task = taskById(id);
  const card = page.locator(`[data-task="${id}"]`);
  await expect(card).toHaveAttribute("data-state", "open");
  await expect(
    page.locator(".tasks-stat").filter({ hasText: "Task Skips" }),
  ).toContainText("1 of 3 held");
  await card.getByRole("button", { name: `Skip ${task.title}` }).click();
  await expect(card).toContainText("Swap it for another?");
  await card.getByRole("button", { name: "Keep" }).click();
  await expect(
    card.getByRole("button", { name: `Skip ${task.title}` }),
  ).toBeVisible();
  await card.getByRole("button", { name: `Skip ${task.title}` }).click();
  await card
    .getByRole("button", { name: `Confirm skip of ${task.title}` })
    .click();
  await expect(page.locator(`[data-task="${id}"]`)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Task Skip used");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.tasks.skip.tokens).toBe(0);
  expect(saved.tasks.daily.swaps).toMatchObject([{ out: id }]);
  // No token left: every Skip on the page is off, and says why.
  await expect(page.locator(".task-skip").first()).toBeDisabled();
});

test("the Task Skip sits on the Tools shelf, is bought again rather than owned, and waits three days", async ({
  page,
}) => {
  await seedProgress(page, { balance: 500000, totalEarned: 500000 });
  await page.goto("/shop/tools");
  const card = page.locator('[data-product="task-skip"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Buy for 60,000 EP" }).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  // Still on sale, with the wait counting down instead of "Purchased".
  await expect(card.getByRole("button", { name: /Next in 3d/ })).toBeDisabled();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.owned).not.toContain("task-skip");
  expect(saved.tasks.skip.tokens).toBe(1);
  expect(saved.balance).toBe(500000 - 60000);
});

test("the Tasks page fits a narrow phone without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await seedProgress(page, {
    profile: testProfile,
    discovered: allBadgeMetadata.slice(0, 12).map((b) => b.id),
  });
  await page.goto("/tasks");
  await expect(page.locator(".tasks-stat").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
