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
  LIST_BONUS,
  listBonusState,
  nextReset,
  periodKey,
  skipStatus,
  taskById,
  taskProgress,
  taskSummary,
  TASK_CADENCES,
  TASK_METRICS,
  TASKS,
} from "../src/tasks.js";
import { cycleEarnedEp, rebirthRequirement } from "../src/rebirth.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import {
  TASKS_GLITCH_MAX_INTERVAL_MS,
  TASKS_GLITCH_MIN_INTERVAL_MS,
  tasksGlitchDelay,
} from "../src/tasks-glitch.js";

const DAY = 24 * 60 * 60 * 1000;
const at = (y, m, d, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

// A small, settled roll. Its tier is explicit so each tally assertion tests the
// task rule rather than relying on a lucky result from the random table.
const roll = (id, time, tier = "trash", ep = 1000, badges = []) => ({
  type: "complete",
  id,
  at: time,
  cooldownUntil: time + 1000,
  result: { number: 1, totalEP: ep, tier, badges },
});

function readyTasks(cadence, time, ids, base = emptyTasks()) {
  const selected = ids ?? activeTaskIds(base, cadence, time);
  const counts = Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));
  for (const id of selected) {
    const task = taskById(id);
    counts[task.metric] = Math.max(counts[task.metric], task.goal);
  }
  return {
    ...base,
    [cadence]: {
      period: periodKey(cadence, time),
      counts,
      claimed: [],
      swaps: [],
      bonus: false,
    },
  };
}

function readyOneTask(cadence, time, id, base = emptyTasks()) {
  return readyTasks(cadence, time, [id], base);
}

function readyBothLists(time) {
  return TASK_CADENCES.reduce(
    (tasks, cadence) => readyTasks(cadence, time, undefined, tasks),
    emptyTasks(),
  );
}

test("task periods follow daily boundaries and Monday-start weeks", () => {
  expect(periodKey("daily", at(2026, 9, 7, 23, 59))).toBe("2026-09-07");
  expect(periodKey("daily", at(2026, 9, 8, 0, 0))).toBe("2026-09-08");
  expect(periodKey("weekly", at(2026, 9, 13, 23, 59))).toBe("2026-09-07");
  expect(periodKey("weekly", at(2026, 9, 14, 0, 0))).toBe("2026-09-14");
  expect(nextReset("daily", at(2026, 9, 7, 23, 59))).toBe(at(2026, 9, 8, 0, 0));
  expect(nextReset("weekly", at(2026, 9, 13, 23, 59))).toBe(
    at(2026, 9, 14, 0, 0),
  );
});

test("online rolls advance task tallies, while offline rolls do not", () => {
  const time = at(2026, 9, 1);
  const realScore = evaluate(1);
  const online = applyProgress(emptyProgress(), {
    ...roll("online-task-roll", time),
    result: realScore,
  });
  const offline = applyProgress(emptyProgress(), {
    ...roll("offline-task-roll", time),
    source: "offline",
  });
  expect(online.tasks.daily.counts.rolls).toBe(1);
  expect(online.tasks.weekly.counts.rolls).toBe(1);
  expect(offline.tasks.daily.counts.rolls).toBe(0);
  expect(offline.tasks.weekly.counts.rolls).toBe(0);
});

test("a finished task pays once and records the claim", () => {
  const time = at(2026, 9, 1);
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  const task = taskById(id);
  const state = {
    ...emptyProgress(),
    profile: testProfile,
    tasks: readyOneTask("daily", time, id),
  };
  const paid = applyProgress(state, { type: "claim-task", id, at: time });
  expect(paid.balance).toBe(task.reward);
  expect(paid.history.at(-1)).toMatchObject({
    type: "task",
    taskId: id,
    ep: task.reward,
  });
  expect(taskProgress(paid.tasks, task, time).state).toBe("claimed");
  expect(() =>
    applyProgress(paid, { type: "claim-task", id, at: time }),
  ).toThrow("already claimed");
});

test("a new period starts with zero task progress", () => {
  const firstDay = at(2026, 9, 1);
  const nextDay = at(2026, 9, 2);
  const tasks = {
    ...emptyTasks(),
    daily: {
      ...emptyTasks().daily,
      period: periodKey("daily", firstDay),
      counts: Object.fromEntries(TASK_METRICS.map((metric) => [metric, 5])),
    },
  };
  const rollsTask = taskById("daily-rolls");
  expect(taskProgress(tasks, rollsTask, firstDay).count).toBe(5);
  expect(taskProgress(tasks, rollsTask, nextDay).count).toBe(0);
});

test("a replay from an older period cannot reopen its task slot", () => {
  const oldDay = at(2026, 9, 1);
  const newDay = at(2026, 9, 2);
  const current = applyProgress(
    emptyProgress(),
    roll("new-day-roll", newDay),
  ).tasks;
  const replayed = applyProgress(
    { ...emptyProgress(), tasks: current },
    roll("old-day-replay", oldDay, "rare"),
  ).tasks;
  expect(replayed.daily.period).toBe(periodKey("daily", newDay));
  expect(replayed.daily.counts.rolls).toBe(1);
  expect(replayed.daily.counts.rare).toBe(0);
});

test("task EP is not rebirth EP, and a claimed task survives reload", () => {
  const time = at(2026, 9, 1);
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  const state = applyProgress(
    {
      ...emptyProgress(),
      profile: testProfile,
      tasks: readyOneTask("daily", time, id),
    },
    { type: "claim-task", id, at: time },
  );
  expect(state.balance).toBe(taskById(id).reward);
  expect(cycleEarnedEp(state)).toBe(0);
  expect(rebirthRequirement(0).ep).toBeGreaterThan(0);
  const loaded = parseProgress(JSON.stringify(state));
  expect(loaded.tasks.daily.claimed).toContain(id);
  expect(loaded.balance).toBe(state.balance);
});

test("missing task data defaults cleanly and unreadable task data is repaired", () => {
  const legacy = { ...emptyProgress() };
  delete legacy.tasks;
  const withoutTasks = parseAndRepairProgress(JSON.stringify(legacy));
  expect(withoutTasks.progress.tasks).toEqual(emptyTasks());
  expect(withoutTasks.repairs).toEqual([]);

  const damaged = parseAndRepairProgress(
    JSON.stringify({ ...emptyProgress(), tasks: { daily: null } }),
  );
  expect(damaged.progress.tasks).toEqual(emptyTasks());
  expect(damaged.repairs).toContain(
    "task progress was unreadable, so it was reset.",
  );
});

test("a task save round-trips its tallies, claims, and history", () => {
  const time = at(2026, 9, 1);
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  let state = applyProgress(emptyProgress(), {
    ...roll("saved-roll", time),
    result: evaluate(1),
  });
  state = {
    ...state,
    tasks: readyOneTask("daily", time, id, state.tasks),
  };
  state = applyProgress(state, { type: "claim-task", id, at: time });
  const loaded = parseProgress(JSON.stringify(state));
  expect(loaded.tasks).toEqual(state.tasks);
  expect(loaded.history).toEqual(state.history);
  expect(loaded.balance).toBe(state.balance);
});

test("only an unsaved roll is recovered, and recovery is idempotent", () => {
  const time = at(2026, 9, 1);
  const stored = emptyProgress();
  const temporary = applyProgress(stored, roll("temporary-roll", time, "rare"));
  const recovered = recoverUnsavedRolls(stored, temporary);
  expect(
    recovered.history.filter((entry) => entry.type === "roll"),
  ).toHaveLength(1);
  expect(recovered.tasks.daily.counts.rolls).toBe(1);
  const again = recoverUnsavedRolls(recovered, temporary);
  expect(again.balance).toBe(recovered.balance);
  expect(again.history.filter((entry) => entry.type === "roll")).toHaveLength(
    1,
  );
});

test("the Tasks page shows Daily and Weekly lists and lets a ready task be claimed", async ({
  page,
}) => {
  const time = at(2026, 9, 1);
  await page.clock.setFixedTime(new Date(time));
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  const task = taskById(id);
  await seedProgress(page, {
    profile: testProfile,
    tasks: readyOneTask("daily", time, id),
  });
  await page.goto("/tasks");

  await expect(
    page.getByRole("heading", { name: "Daily", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Weekly", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-list-daily [data-task]")).toHaveCount(3);
  await expect(page.locator(".task-list-weekly [data-task]")).toHaveCount(4);
  const card = page.locator(`[data-task="${id}"]`);
  await expect(card).toHaveAttribute("data-state", "claimable");
  await card
    .getByRole("button", { name: `Claim reward for ${task.title}` })
    .click();
  await expect(card).toHaveAttribute("data-state", "claimed");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.tasks.daily.claimed).toContain(id);
});

test("completing a task list unlocks a separate Collect button, never an automatic bonus", () => {
  const time = at(2026, 9, 1);
  const tasks = readyTasks("daily", time);
  const ids = activeTaskIds(tasks, "daily", time);
  let state = { ...emptyProgress(), tasks };
  for (const id of ids.slice(0, -1))
    state = applyProgress(state, { type: "claim-task", id, at: time });
  expect(listBonusState(state.tasks, "daily", time).state).toBe("open");
  const beforeLast = state.balance;
  state = applyProgress(state, {
    type: "claim-task",
    id: ids.at(-1),
    at: time,
  });
  expect(listBonusState(state.tasks, "daily", time)).toMatchObject({
    state: "claimable",
    reward: LIST_BONUS.daily,
    done: ACTIVE_PER_PERIOD.daily,
  });
  expect(state.balance - beforeLast).toBe(taskById(ids.at(-1)).reward);
  expect(state.tasks.daily.bonus).toBe(false);
  state = applyProgress(state, {
    type: "collect-list-bonus",
    cadence: "daily",
    at: time,
  });
  expect(state.balance).toBe(
    ids.reduce((sum, id) => sum + taskById(id).reward, 0) + LIST_BONUS.daily,
  );
  expect(state.tasks.daily.bonus).toBe(true);
});

test("the header marks a ready task until it is claimed", async ({ page }) => {
  const time = at(2026, 9, 1);
  await page.clock.setFixedTime(new Date(time));
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  await seedProgress(page, {
    profile: testProfile,
    tasks: readyOneTask("daily", time, id),
  });
  await page.goto("/");
  const tasksButton = page.locator(
    'nav[aria-label="Main navigation"] button.tasks-nav-glitch',
  );
  await expect(tasksButton).toHaveAccessibleName("Tasks, ready to claim");
  await tasksButton.click();
  const task = taskById(id);
  await page
    .locator(`[data-task="${id}"]`)
    .getByRole("button", { name: `Claim reward for ${task.title}` })
    .click();
  await expect(tasksButton).toHaveAccessibleName("Tasks");
});

test("a claimed task is written to History as wallet income", async ({
  page,
}) => {
  const time = at(2026, 9, 1);
  await page.clock.setFixedTime(new Date(time));
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  const task = taskById(id);
  const claimed = applyProgress(
    {
      ...emptyProgress(),
      profile: testProfile,
      tasks: readyOneTask("daily", time, id),
    },
    { type: "claim-task", id, at: time },
  );
  await seedProgress(page, claimed);
  await page.goto("/history");
  await expect(page.locator('[data-event-type="task"]')).toContainText(
    `Task claimed · ${task.title}`,
  );
  await expect(page.locator('[data-event-type="task"]')).toContainText(
    `+${task.reward.toLocaleString("en-US")} EP`,
  );
});

test("each period deals the configured number of unique tasks from its expanded pool", () => {
  const time = at(2026, 9, 1);
  const poolSizes = { daily: 19, weekly: 21 };
  for (const cadence of TASK_CADENCES) {
    const pool = TASKS.filter((task) => task.cadence === cadence);
    const ids = activeTaskIds(emptyTasks(), cadence, time);
    expect(pool).toHaveLength(poolSizes[cadence]);
    expect(ids).toHaveLength(ACTIVE_PER_PERIOD[cadence]);
    expect(new Set(ids).size).toBe(ACTIVE_PER_PERIOD[cadence]);
    expect(ids.every((id) => pool.some((task) => task.id === id))).toBe(true);
  }
});

test("Rare-or-better tallies include Rare and higher tiers, but Epic excludes Rare", () => {
  const time = at(2026, 9, 1);
  let state = emptyProgress();
  state = applyProgress(state, roll("rare-tier", time, "rare"));
  state = applyProgress(state, roll("epic-tier", time + 1, "epic"));
  expect(state.tasks.daily.counts.rare).toBe(2);
  expect(state.tasks.daily.counts.epic).toBe(1);
});

test("a Task Skip swaps one open task for an unlisted task with zero starting progress", () => {
  const time = at(2026, 9, 1);
  const tasks = emptyTasks();
  const [id] = activeTaskIds(tasks, "daily", time);
  const state = {
    ...emptyProgress(),
    tasks: { ...tasks, skip: { tokens: 1, bought: [] } },
  };
  const swapped = applyProgress(state, { type: "skip-task", id, at: time });
  const nextIds = activeTaskIds(swapped.tasks, "daily", time);
  const incoming = nextIds.find(
    (taskId) => !activeTaskIds(tasks, "daily", time).includes(taskId),
  );
  expect(nextIds).toHaveLength(ACTIVE_PER_PERIOD.daily);
  expect(nextIds).not.toContain(id);
  expect(incoming).toBeTruthy();
  expect(taskProgress(swapped.tasks, taskById(incoming), time).count).toBe(0);
  expect(skipStatus(swapped.tasks, time).tokens).toBe(0);
});

test("a claimed task cannot be skipped", () => {
  const time = at(2026, 9, 1);
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  const tasks = readyOneTask("daily", time, id);
  tasks.skip = { tokens: 1, bought: [] };
  const state = applyProgress(
    { ...emptyProgress(), tasks },
    { type: "claim-task", id, at: time },
  );
  expect(() =>
    applyProgress(state, { type: "skip-task", id, at: time }),
  ).toThrow("claimed task cannot be skipped");
});

test("Task Skips cost 125,000 EP, are limited to one a day and three per five days", () => {
  const start = at(2026, 9, 1);
  let state = {
    ...emptyProgress(),
    balance: 1500000,
    totalEarned: 1500000,
  };
  const buy = (when) =>
    applyProgress(state, { type: "buy", id: "task-skip", at: when });
  state = buy(start);
  expect(state.balance).toBe(1375000);
  expect(skipStatus(state.tasks, start).tokens).toBe(1);
  expect(() => buy(start + DAY - 1)).toThrow("next Task Skip");

  let open = activeTaskIds(state.tasks, "daily", start)[0];
  state = applyProgress(state, { type: "skip-task", id: open, at: start });
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: start + DAY,
  });
  open = activeTaskIds(state.tasks, "daily", start + DAY)[0];
  state = applyProgress(state, {
    type: "skip-task",
    id: open,
    at: start + DAY,
  });
  state = applyProgress(state, {
    type: "buy",
    id: "task-skip",
    at: start + 2 * DAY,
  });
  open = activeTaskIds(state.tasks, "daily", start + 2 * DAY)[0];
  state = applyProgress(state, {
    type: "skip-task",
    id: open,
    at: start + 2 * DAY,
  });
  expect(skipStatus(state.tasks, start + 2 * DAY).tokens).toBe(0);
  expect(() =>
    applyProgress(state, {
      type: "buy",
      id: "task-skip",
      at: start + 3 * DAY,
    }),
  ).toThrow("next Task Skip");
  expect(state.balance).toBe(1125000);
});

test("Task Skip purchases and swaps survive reload, while forged swaps are removed", () => {
  const time = at(2026, 9, 1);
  const [id] = activeTaskIds(emptyTasks(), "daily", time);
  let state = applyProgress(
    { ...emptyProgress(), balance: 500000, totalEarned: 500000 },
    { type: "buy", id: "task-skip", at: time },
  );
  state = applyProgress(state, { type: "skip-task", id, at: time });
  const loaded = parseProgress(JSON.stringify(state));
  expect(loaded.tasks.daily.swaps).toEqual(state.tasks.daily.swaps);
  expect(loaded.tasks.skip).toEqual(state.tasks.skip);

  const forged = {
    ...state,
    tasks: {
      ...state.tasks,
      daily: {
        ...state.tasks.daily,
        swaps: [{ out: "weekly-rolls", in: "daily-rolls", base: 0 }],
      },
    },
  };
  const repaired = parseAndRepairProgress(JSON.stringify(forged));
  expect(repaired.progress.tasks.daily.swaps).toEqual([]);
  expect(repaired.repairs).toContain(
    "task progress was unreadable, so it was reset.",
  );
});

test("the Tasks page confirms before spending a Skip", async ({ page }) => {
  const time = at(2026, 9, 1);
  await page.clock.setFixedTime(new Date(time));
  const tasks = { ...emptyTasks(), skip: { tokens: 1, bought: [] } };
  await seedProgress(page, { tasks });
  await page.goto("/tasks");
  const [id] = activeTaskIds(tasks, "daily", time);
  const task = taskById(id);
  const card = page.locator(`[data-task="${id}"]`);
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
  await expect(page.getByRole("status")).toContainText("Task Skip used");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.tasks.skip.tokens).toBe(0);
  expect(saved.tasks.daily.swaps).toHaveLength(1);
});

test("the Task Skip is bought again from Tools and waits one day", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 500000,
    totalEarned: 500000,
  });
  await page.goto("/shop/tools");
  const card = page.locator('[data-product="task-skip"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Buy for 125,000 EP" }).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card.getByRole("button", { name: /Next in 1d/ })).toBeDisabled();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.owned).not.toContain("task-skip");
  expect(saved.tasks.skip.tokens).toBe(1);
  expect(saved.balance).toBe(375000);
});

test("the Tasks page fits a narrow phone without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(new Date(at(2026, 9, 1)));
  await seedProgress(page, {
    profile: testProfile,
  });
  await page.goto("/tasks");
  await expect(page.locator(".tasks-stat").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the Tasks glitch happens once every random 5–20 seconds and never overlaps", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
  const desktopNav = page.locator('nav[aria-label="Main navigation"]');
  const desktopLabel = desktopNav.locator(
    "button.tasks-nav-glitch .tasks-nav-glitch-label",
  );
  await expect(desktopLabel).toHaveText("Tasks");
  await expect(desktopLabel).not.toHaveClass(/is-glitching/);
  await expect(
    desktopNav.locator("button:not(.tasks-nav-glitch) .tasks-nav-glitch-label"),
  ).toHaveCount(0);

  await page.clock.runFor(TASKS_GLITCH_MIN_INTERVAL_MS - 1);
  await expect(desktopLabel).not.toHaveClass(/is-glitching/);
  await page.clock.runFor(1);
  await expect(desktopLabel).toHaveClass(/is-glitching/);
  await expect(desktopLabel).toHaveCSS("animation-duration", "0.42s");
  await page.clock.runFor(419);
  await expect(desktopLabel).toHaveClass(/is-glitching/);
  await page.clock.runFor(1);
  await expect(desktopLabel).not.toHaveClass(/is-glitching/);

  // The next wait starts after that burst finishes, so there is no overlap.
  await page.clock.runFor(TASKS_GLITCH_MIN_INTERVAL_MS - 1);
  await expect(desktopLabel).not.toHaveClass(/is-glitching/);
  await page.clock.runFor(1);
  await expect(desktopLabel).toHaveClass(/is-glitching/);

  await page.setViewportSize({ width: 360, height: 800 });
  const mobileNav = page.locator("nav.mobile-tabbar");
  await expect(mobileNav).toBeVisible();
  await expect(
    mobileNav.locator("button.tasks-nav-glitch .tasks-nav-glitch-label"),
  ).toHaveClass(/is-glitching/);
  await expect(
    mobileNav.locator("button:not(.tasks-nav-glitch) .tasks-nav-glitch-label"),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(mobileNav.locator(".tasks-nav-glitch-label")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("Tasks glitch intervals are inclusive and always stay between five and twenty seconds", () => {
  expect(tasksGlitchDelay(0)).toBe(TASKS_GLITCH_MIN_INTERVAL_MS);
  expect(tasksGlitchDelay(1)).toBe(TASKS_GLITCH_MAX_INTERVAL_MS);
  for (const sample of [0, 0.1, 0.5, 0.9, 0.999999]) {
    const delay = tasksGlitchDelay(sample);
    expect(delay).toBeGreaterThanOrEqual(TASKS_GLITCH_MIN_INTERVAL_MS);
    expect(delay).toBeLessThanOrEqual(TASKS_GLITCH_MAX_INTERVAL_MS);
  }
});
