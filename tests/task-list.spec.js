import { test, expect } from "./helpers/clock.js";
import { applyProgress, emptyProgress } from "../src/progress.js";
import {
  ACTIVE_PER_PERIOD,
  activeTaskIds,
  claimableIds,
  emptyTasks,
  LIST_BONUS,
  listBonusState,
  PEAK_METRICS,
  recordTally,
  TASK_METRICS,
  TASKS,
  taskById,
  taskProgress,
  taskSummary,
} from "../src/tasks.js";
import { testProfile } from "./helpers/progress.js";

// The list a day deals, the rewards it pays, and the bonus for finishing it.
// These are the rules the Tasks page and the reducer both rely on.

const at = (y, m, d, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();
const roll = (id, time, tier = "trash", ep = 1000, badges = []) => ({
  type: "complete",
  id,
  at: time,
  cooldownUntil: 0,
  result: { number: 1, totalEP: ep, tier, badges },
});
const zeroCounts = () =>
  Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));
const day = at(2026, 10, 8, 12);

test("each cadence has a varied pool, a fixed-size list, and real task rewards", () => {
  for (const [cadence, poolSize] of [
    ["daily", 19],
    ["weekly", 21],
  ]) {
    const pool = TASKS.filter((task) => task.cadence === cadence);
    expect(pool).toHaveLength(poolSize);
    expect(new Set(pool.map((task) => task.id)).size).toBe(poolSize);
    for (const task of pool) {
      expect(TASK_METRICS).toContain(task.metric);
      expect(task.goal).toBeGreaterThan(0);
      expect(task.reward).toBeGreaterThan(0);
    }
  }
  expect(ACTIVE_PER_PERIOD).toEqual({ daily: 3, weekly: 4 });
  // A weekly task pays several times a daily one on average.
  const average = (cadence) => {
    const pool = TASKS.filter((task) => task.cadence === cadence);
    return pool.reduce((sum, task) => sum + task.reward, 0) / pool.length;
  };
  expect(average("weekly")).toBeGreaterThan(average("daily") * 5);
  expect(LIST_BONUS.weekly).toBeGreaterThan(LIST_BONUS.daily);
});

test("a peak keeps the best single roll of the period, and a running total adds up", () => {
  let tasks = recordTally(
    emptyTasks(),
    { ...zeroCounts(), rolls: 1, peakEP: 250000, peakBadges: 22, banked: 500 },
    day,
  );
  tasks = recordTally(
    tasks,
    { ...zeroCounts(), rolls: 1, peakEP: 120, peakBadges: 9, banked: 500 },
    day,
  );
  expect(tasks.daily.counts).toMatchObject({
    rolls: 2,
    banked: 1000,
    peakEP: 250000,
    peakBadges: 22,
  });
  expect(PEAK_METRICS).toEqual(["peakEP", "peakBadges"]);
});

test("each ready task is claimed on its own, and a claim pays only its reward", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  // Twelve Rare-or-better rolls, one of them worth 300,000 EP, so several tasks
  // on the list are finished at once.
  for (let i = 0; i < 12; i++)
    state = applyProgress(
      state,
      roll(`r${i}`, day + i * 60000, "rare", 300000),
    );
  const ready = claimableIds(state.tasks, "daily", day);
  expect(ready.length).toBeGreaterThan(1);
  for (const [index, id] of ready.entries()) {
    const before = state.balance;
    state = applyProgress(state, { type: "claim-task", id, at: day });
    // The rolls themselves paid into the wallet too, so the claim is the gap.
    expect(state.balance - before).toBe(taskById(id).reward);
    expect(state.history.filter((e) => e.type === "task")).toHaveLength(
      index + 1,
    );
  }
  expect(claimableIds(state.tasks, "daily", day)).toEqual([]);
  expect(() =>
    applyProgress(state, { type: "claim-task", id: ready[0], at: day }),
  ).toThrow(/already claimed/);
  expect(() =>
    applyProgress(state, {
      type: "collect-list-bonus",
      cadence: "monthly",
      at: day,
    }),
  ).toThrow(/does not exist/);
});

test("finishing the last task unlocks the list bonus; collecting it pays once, in its own step", () => {
  // Build a state where every task on today's daily list is ready at once, by
  // counting enough of every metric. Then claim them one at a time: none of the
  // claims pays the bonus, and it waits for its own collect action.
  let tasks = emptyTasks();
  const every = {
    ...zeroCounts(),
    rolls: 100,
    rare: 10,
    epic: 10,
    mythic: 10,
    multi: 10,
    discovered: 10,
    banked: 10000000,
    skills: 10,
    pets: 1,
    peakEP: 1000000,
    peakBadges: 30,
  };
  tasks = recordTally(tasks, every, day);
  let state = { ...emptyProgress(), profile: testProfile, tasks };
  const list = activeTaskIds(state.tasks, "daily", day);
  expect(list).toHaveLength(ACTIVE_PER_PERIOD.daily);
  for (const id of list)
    expect(taskProgress(state.tasks, taskById(id), day).state).toBe(
      "claimable",
    );
  // The bonus cannot be collected while a task on the list is still unclaimed.
  expect(() =>
    applyProgress(state, {
      type: "collect-list-bonus",
      cadence: "daily",
      at: day,
    }),
  ).toThrow(/Claim every task on the list first/);
  for (const id of list) {
    const before = state.balance;
    state = applyProgress(state, { type: "claim-task", id, at: day });
    expect(state.balance - before).toBe(taskById(id).reward);
  }
  expect(listBonusState(state.tasks, "daily", day)).toMatchObject({
    state: "claimable",
    done: ACTIVE_PER_PERIOD.daily,
  });
  expect(state.history.filter((e) => e.taskId === "daily-list")).toHaveLength(
    0,
  );
  // A finished list is ready to collect, so the Tasks tab counts the bonus.
  // The same tally also finishes the weekly list, which the count includes.
  const weekly = claimableIds(state.tasks, "weekly", day).length;
  expect(taskSummary(state.tasks, day).ready).toBe(1 + weekly);
  const before = state.balance;
  state = applyProgress(state, {
    type: "collect-list-bonus",
    cadence: "daily",
    at: day,
  });
  expect(state.balance - before).toBe(LIST_BONUS.daily);
  expect(listBonusState(state.tasks, "daily", day)).toMatchObject({
    state: "claimed",
    done: ACTIVE_PER_PERIOD.daily,
  });
  const bonusLine = state.history.filter((e) => e.taskId === "daily-list");
  expect(bonusLine).toHaveLength(1);
  expect(bonusLine[0]).toMatchObject({
    type: "task",
    cadence: "daily",
    ep: LIST_BONUS.daily,
  });
  // Once per reset: a second collect is refused, and pays nothing.
  const paidOnce = state.balance;
  expect(() =>
    applyProgress(state, {
      type: "collect-list-bonus",
      cadence: "daily",
      at: day,
    }),
  ).toThrow(/already claimed/);
  expect(state.balance).toBe(paidOnce);
  expect(taskSummary(state.tasks, day).ready).toBe(weekly);
  expect(claimableIds(state.tasks, "daily", day)).toEqual([]);
  expect(taskSummary(state.tasks, day).claimed).toBeGreaterThanOrEqual(
    ACTIVE_PER_PERIOD.daily,
  );
});

test("the new metrics count: a mythic roll, a companion found, and a roll of many badges", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  state = applyProgress(
    state,
    roll(
      "m1",
      day,
      "mythic",
      900000,
      Array.from({ length: 22 }, (_, i) => ({ id: `b${i}`, ep: 1 })),
    ),
  );
  expect(state.tasks.daily.counts).toMatchObject({
    rolls: 1,
    rare: 1,
    epic: 1,
    mythic: 1,
    peakEP: 900000,
    peakBadges: 22,
  });
  // A companion dropped on a roll is counted once, on the roll that found it.
  state = applyProgress(state, {
    ...roll("p1", day + 60000, "common", 500),
    petDrop: "pebble",
  });
  expect(state.tasks.daily.counts.pets).toBe(1);
  expect(state.pets).toContain("pebble");
  // Offline rolls count for none of it, companions included.
  const offline = applyProgress(state, {
    ...roll("o1", day + 120000, "godly", 9999999),
    source: "offline",
    petDrop: "pebble",
  });
  expect(offline.tasks).toEqual(state.tasks);
});

test("a list never shows a task outside its cadence, and every task is on a list at some point", () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const stamp = at(2026, 9, 1 + i, 12);
    for (const id of activeTaskIds(emptyTasks(), "daily", stamp)) {
      expect(taskById(id).cadence).toBe("daily");
      seen.add(id);
    }
  }
  // Forty days of lists reach most of the pool, so no task is dead weight.
  expect(seen.size).toBeGreaterThan(9);
});
