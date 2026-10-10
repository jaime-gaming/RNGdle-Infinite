import { test, expect } from "./helpers/clock.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  AURA_EVENT_END_AT,
  AURA_EVENT_MISSIONS,
  AURA_EVENT_START_AT,
  activeTaskIds,
  auraEventAuraIds,
  auraEventState,
  emptyTasks,
  periodKey,
  TASK_METRICS,
  taskById,
} from "../src/tasks.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { productById, productPrice } from "../src/shop-data.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";

const onlineRoll = (id, at, number = 103001) => ({
  type: "complete",
  id,
  at,
  cooldownUntil: 0,
  result: evaluate(number),
});

const emptyEventCounts = () => ({
  rolls: 0,
  rare: 0,
  banked: 0,
  taskClaims: 0,
});

test("R4ND0MN3S5 missions require manual aura collection and never spend EP", () => {
  expect(AURA_EVENT_MISSIONS.map(({ id, auraId }) => [id, auraId])).toEqual([
    ["static", "static"],
    ["bitstorm", "bitstorm"],
    ["scramble", "scramble"],
    ["hexdump", "hexdump"],
  ]);
  const start = AURA_EVENT_START_AT;
  expect(auraEventState(emptyTasks(), start).phase).toBe("active");

  let state = emptyProgress();
  for (let i = 0; i < 20; i++)
    state = applyProgress(
      state,
      onlineRoll(`event-roll-${i}`, start + i * 60000),
    );

  expect(state.tasks.event.counts).toEqual({
    rolls: 20,
    rare: 5,
    banked: 400000,
    taskClaims: 0,
  });
  expect(state.tasks.event.earned).toEqual([]);
  expect(auraEventAuraIds(state.tasks)).toEqual([]);
  expect(state.owned).not.toContain("static");
  expect(state.owned).not.toContain("bitstorm");
  expect(state.owned).not.toContain("scramble");
  expect(state.owned).not.toContain("hexdump");
  expect(state.balance).toBe(606560);
  expect(state.equipped).toBe("none");
  expect(auraEventState(state.tasks, start + 20 * 60000)).toMatchObject({
    phase: "active",
    complete: 3,
    collected: 0,
    total: 4,
    missions: [
      { id: "static", complete: true, claimable: true, collected: false },
      { id: "bitstorm", complete: true, claimable: true, collected: false },
      { id: "scramble", complete: true, claimable: true, collected: false },
      { id: "hexdump", complete: false, claimable: false, collected: false },
    ],
  });
  expect(() =>
    applyProgress(state, {
      type: "claim-event-aura",
      id: "hexdump",
      at: start,
    }),
  ).toThrow("Complete the mission");

  state = applyProgress(state, {
    type: "claim-event-aura",
    id: "static",
    at: start + 20 * 60000,
  });
  expect(state.tasks.event.earned).toEqual(["static"]);
  expect(auraEventAuraIds(state.tasks)).toEqual(["static"]);
  expect(state.owned).toContain("static");
  expect(state.equipped).toBe("static");
  expect(state.balance).toBe(606560);
  expect(auraEventState(state.tasks, start + 20 * 60000)).toMatchObject({
    complete: 3,
    collected: 1,
  });
  expect(() =>
    applyProgress(state, { type: "claim-event-aura", id: "static", at: start }),
  ).toThrow("already been collected");
  expect(parseProgress(JSON.stringify(state))).toEqual(state);
});

test("event progress follows its active window and ignores offline or late rolls", () => {
  const before = applyProgress(
    emptyProgress(),
    onlineRoll("before-event", AURA_EVENT_START_AT - 1),
  );
  expect(before.tasks.event.counts).toEqual(emptyEventCounts());
  expect(auraEventState(before.tasks, AURA_EVENT_START_AT - 1).phase).toBe(
    "upcoming",
  );

  const first = applyProgress(
    before,
    onlineRoll("opening-roll", AURA_EVENT_START_AT),
  );
  expect(first.tasks.event.counts.rolls).toBe(1);
  const lastMoment = AURA_EVENT_END_AT - 1;
  expect(auraEventState(first.tasks, lastMoment).phase).toBe("active");
  const lastRoll = applyProgress(first, onlineRoll("last-roll", lastMoment));
  expect(lastRoll.tasks.event.counts.rolls).toBe(2);

  const offline = applyProgress(lastRoll, {
    ...onlineRoll("offline-roll", lastMoment),
    source: "offline",
  });
  expect(offline.tasks.event).toEqual(lastRoll.tasks.event);
  const after = applyProgress(
    offline,
    onlineRoll("after-event", AURA_EVENT_END_AT),
  );
  expect(after.tasks.event).toEqual(offline.tasks.event);
  expect(auraEventState(after.tasks, AURA_EVENT_END_AT).phase).toBe("ended");
});

test("a mission completed while live remains manually collectable after the event ends", () => {
  let state = emptyProgress();
  for (let i = 0; i < 20; i++) {
    state = applyProgress(
      state,
      onlineRoll(`closing-event-roll-${i}`, AURA_EVENT_START_AT + i * 60000),
    );
  }

  const ended = auraEventState(state.tasks, AURA_EVENT_END_AT);
  expect(ended.phase).toBe("ended");
  expect(ended.missions[0]).toMatchObject({
    id: "static",
    complete: true,
    claimable: true,
    collected: false,
  });
  const collected = applyProgress(state, {
    type: "claim-event-aura",
    id: "static",
    at: AURA_EVENT_END_AT,
  });
  expect(collected.owned).toContain("static");
  expect(collected.tasks.event.earned).toContain("static");
});

test("R4ND0MN3S5 sale prices change in the Shop and in the purchase transaction", () => {
  const aura = productById.get("static");
  expect(productPrice(aura, AURA_EVENT_START_AT - 1)).toBe(260000);
  expect(productPrice(aura, AURA_EVENT_START_AT)).toBe(840000);
  expect(productPrice(aura, AURA_EVENT_END_AT)).toBe(260000);
  expect(
    Object.fromEntries(
      ["static", "bitstorm", "scramble", "hexdump"].map((id) => [
        id,
        productPrice(productById.get(id), AURA_EVENT_START_AT),
      ]),
    ),
  ).toEqual({
    static: 840000,
    bitstorm: 2640000,
    scramble: 5400000,
    hexdump: 9000000,
  });

  const funded = { ...emptyProgress(), balance: 1000000, totalEarned: 1000000 };
  const regular = applyProgress(funded, {
    type: "buy",
    id: "static",
    at: AURA_EVENT_START_AT - 1,
  });
  expect(regular.balance).toBe(740000);
  expect(regular.history.at(-1)).toMatchObject({ ep: 260000 });

  const premium = applyProgress(funded, {
    type: "buy",
    id: "static",
    at: AURA_EVENT_START_AT,
  });
  expect(premium.balance).toBe(160000);
  expect(premium.history.at(-1)).toMatchObject({ ep: 840000 });

  const returned = applyProgress(funded, {
    type: "buy",
    id: "static",
    at: AURA_EVENT_END_AT,
  });
  expect(returned.balance).toBe(740000);
  expect(returned.history.at(-1)).toMatchObject({ ep: 260000 });
});

test("six task claims make Hex Dump collectible, and collected event auras survive rebirths and save repair", () => {
  const at = AURA_EVENT_START_AT + 2 * 24 * 60 * 60 * 1000;
  const tasks = emptyTasks();
  const lists = Object.fromEntries(
    ["daily", "weekly"].map((cadence) => {
      const ids = activeTaskIds(tasks, cadence, at);
      const counts = Object.fromEntries(
        TASK_METRICS.map((metric) => [metric, 0]),
      );
      for (const id of ids) {
        const task = taskById(id);
        counts[task.metric] = Math.max(counts[task.metric], task.goal);
      }
      return [cadence, { ids, counts }];
    }),
  );
  const readyTasks = {
    ...tasks,
    daily: {
      period: periodKey("daily", at),
      counts: lists.daily.counts,
      claimed: [],
      swaps: [],
      bonus: false,
    },
    weekly: {
      period: periodKey("weekly", at),
      counts: lists.weekly.counts,
      claimed: [],
      swaps: [],
      bonus: false,
    },
  };
  const claims = [...lists.daily.ids, ...lists.weekly.ids].slice(0, 6);
  let state = { ...emptyProgress(), profile: testProfile, tasks: readyTasks };
  for (const id of claims)
    state = applyProgress(state, { type: "claim-task", id, at });
  expect(state.tasks.event.counts.taskClaims).toBe(6);
  expect(state.tasks.event.earned).toEqual([]);
  expect(state.owned).not.toContain("hexdump");
  expect(auraEventState(state.tasks, at).missions.at(-1)).toMatchObject({
    id: "hexdump",
    complete: true,
    claimable: true,
    collected: false,
  });
  expect(state.balance).toBe(
    claims.reduce((sum, id) => sum + taskById(id).reward, 0),
  );
  state = applyProgress(state, {
    type: "claim-event-aura",
    id: "hexdump",
    at,
  });
  expect(state.tasks.event.earned).toContain("hexdump");
  expect(state.owned).toContain("hexdump");
  expect(state.equipped).toBe("hexdump");
  expect(state.balance).toBe(
    claims.reduce((sum, id) => sum + taskById(id).reward, 0),
  );

  const badgeIds = allBadgeMetadata.map((badge) => badge.id);
  const ready = {
    ...state,
    discovered: badgeIds.slice(0, 47),
    history: [
      {
        id: "rebirth-gate-roll",
        type: "roll",
        at: 100000,
        number: 604827,
        tier: "mythic",
        ep: 250000,
        badges: [],
      },
    ],
    owned: ["hexdump"],
    equipped: "hexdump",
    balance: 0,
    totalEarned: 250000,
    cycleEarnedEP: 250000,
  };
  const reborn = applyProgress(ready, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 200000,
  });
  expect(reborn.owned).toContain("hexdump");
  expect(reborn.equipped).toBe("hexdump");
  expect(reborn.tasks.event.earned).toContain("hexdump");

  const damaged = { ...reborn, owned: [], equipped: "none" };
  const repaired = parseProgress(JSON.stringify(damaged));
  expect(repaired.owned).toContain("hexdump");
});

test("the upcoming event uses a relative countdown without showing a calendar date", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(AURA_EVENT_START_AT - 60 * 60 * 1000));
  await page.goto("/tasks");

  const panel = page.locator(".signal-event");
  await expect(panel).toHaveAttribute("data-event-phase", "upcoming");
  await expect(panel.locator(".signal-event-countdown")).toHaveText(
    "Starts in 1h 0m",
  );
  await expect(panel.locator(".signal-event-dates")).toHaveCount(0);
  await expect(panel).not.toContainText(/October|2026|local time/i);
});

test("the Tasks page presents a restrained event panel with its mission progress", async ({
  page,
}) => {
  await page.clock.setFixedTime(
    new Date(AURA_EVENT_START_AT + 36 * 60 * 60 * 1000),
  );
  const event = {
    ...emptyTasks().event,
    counts: { rolls: 20, rare: 1, banked: 100000, taskClaims: 2 },
    earned: [],
  };
  await seedProgress(page, {
    tasks: { ...emptyTasks(), event },
    owned: [],
    equipped: "none",
  });
  await page.goto("/tasks");

  const panel = page.locator(".signal-event");
  await expect(panel).toHaveAttribute("data-event-phase", "active");
  await expect(
    panel.getByRole("heading", { name: "R4ND0MN3S5", exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText(
    "Finish a mission, then collect its matching aura here.",
  );
  await expect(panel.locator(".signal-event-dates")).toHaveCount(0);
  await expect(
    panel.getByRole("progressbar", {
      name: "R4ND0MN3S5 event progress",
    }),
  ).toHaveAttribute("value", "1");
  await expect(panel.locator("[data-event-mission]")).toHaveCount(4);
  await expect(panel.locator('[data-event-mission="static"]')).toHaveAttribute(
    "data-state",
    "claimable",
  );
  await expect(panel.locator('[data-event-mission="hexdump"]')).toContainText(
    "2 / 6 tasks",
  );
  await panel
    .getByRole("button", { name: "Collect Static Veil", exact: true })
    .click();
  await expect(panel.locator('[data-event-mission="static"]')).toHaveAttribute(
    "data-state",
    "collected",
  );
  await expect(page.getByRole("status")).toContainText("Static Veil collected");
  await panel.getByRole("button", { name: "View aura family" }).click();
  await expect(page).toHaveURL(/\/shop\/auras\/randomness$/);

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.owned).toContain("static");
});
