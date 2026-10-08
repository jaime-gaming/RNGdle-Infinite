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

test("each cadence has twelve tasks, four on a list, and every reward is a real amount", () => {
  for (const cadence of ["daily", "weekly"]) {
    const pool = TASKS.filter((task) => task.cadence === cadence);
    expect(pool).toHaveLength(12);
    expect(new Set(pool.map((task) => task.id)).size).toBe(12);
    for (const task of pool) {
      expect(TASK_METRICS).toContain(task.metric);
      expect(task.goal).toBeGreaterThan(0);
      expect(task.reward).toBeGreaterThan(0);
    }
  }
  expect(ACTIVE_PER_PERIOD).toBe(4);
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

test("claiming every ready task pays them all in one step, logs each, and refuses when none is ready", () => {
  let state = { ...emptyProgress(), profile: testProfile };
  // Fifteen Rare-or-better rolls, one of them worth 250,000 EP, and enough EP
  // banked to finish whichever banking task is on the list.
  for (let i = 0; i < 12; i++)
    state = applyProgress(
      state,
      roll(`r${i}`, day + i * 60000, "rare", 300000),
    );
  const ready = claimableIds(state.tasks, "daily", day);
  expect(ready.length).toBeGreaterThan(1);
  const expected = ready.reduce((sum, id) => sum + taskById(id).reward, 0);
  const before = state.balance;
  const paid = applyProgress(state, {
    type: "claim-all-tasks",
    cadence: "daily",
    at: day,
  });
  const bonus = listBonusState(paid.tasks, "daily", day).state === "claimed";
  // The rolls themselves paid into the wallet too, so the claim is the gap.
  expect(paid.balance - before).toBe(expected + (bonus ? LIST_BONUS.daily : 0));
  expect(paid.history.filter((e) => e.type === "task")).toHaveLength(
    ready.length + (bonus ? 1 : 0),
  );
  expect(claimableIds(paid.tasks, "daily", day)).toEqual([]);
  expect(() =>
    applyProgress(paid, { type: "claim-all-tasks", cadence: "daily", at: day }),
  ).toThrow(/Nothing to claim yet/);
  expect(() =>
    applyProgress(paid, {
      type: "claim-all-tasks",
      cadence: "monthly",
      at: day,
    }),
  ).toThrow(/does not exist/);
});

test("finishing the last task on a list pays its bonus once, in the same step, and logs it", () => {
  // Build a state where every task on today's daily list is ready at once, by
  // counting enough of every metric. Then claim them one at a time: the bonus
  // comes with the last claim, and never again.
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
  expect(list).toHaveLength(ACTIVE_PER_PERIOD);
  for (const id of list)
    expect(taskProgress(state.tasks, taskById(id), day).state).toBe(
      "claimable",
    );
  for (const [index, id] of list.entries()) {
    const before = state.balance;
    state = applyProgress(state, { type: "claim-task", id, at: day });
    const paid = state.balance - before;
    const last = index === list.length - 1;
    expect(paid).toBe(taskById(id).reward + (last ? LIST_BONUS.daily : 0));
  }
  expect(listBonusState(state.tasks, "daily", day)).toMatchObject({
    state: "claimed",
    done: ACTIVE_PER_PERIOD,
  });
  const bonusLine = state.history.filter((e) => e.taskId === "daily-list");
  expect(bonusLine).toHaveLength(1);
  expect(bonusLine[0]).toMatchObject({
    type: "task",
    cadence: "daily",
    ep: LIST_BONUS.daily,
  });
  expect(claimableIds(state.tasks, "daily", day)).toEqual([]);
  expect(taskSummary(state.tasks, day).claimed).toBeGreaterThanOrEqual(
    ACTIVE_PER_PERIOD,
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
