import { completedWorldRoll, revealWorld } from "./helpers/world-roll.js";
import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { chooseTheme } from "./helpers/appearance.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { emptyTasks } from "../src/tasks.js";
import { RNGWEEN_MISSIONS, rngweenCalendar } from "../src/rngween.js";
import {
  RNGWEEN_PET,
  RNGWEEN_SIGNATURE,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  emptyRngweenLimited,
  rngweenWorldUnlocked,
} from "../src/rngween-limited.js";
import { RNGWEEN_INTRO_KEY } from "../src/rngween-intro.js";
import { drawPlanFor, skillById, rebirthSkills } from "../src/skills.js";
import { runDrawPicks } from "../src/draw-plan.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { evaluate } from "./helpers/index.js";
import { tallyEntries } from "../src/history-tally.js";

// World rolls pay a few Pumpkoins of their own; these checks are about every
// other source, so they read the wallet without the World's running total.
const coins = (p) =>
  p.rngweenLimited.pumpkoins - (p.rngweenLimited.world?.earned ?? 0);

const active = Date.UTC(2026, 9, 26, 12);
const sales = Date.UTC(2026, 10, 1);
const expired = Date.UTC(2026, 10, 4);
const fullCounts = { rolls: 300, rare: 60, banked: 8000000, taskClaims: 21 };
const finished = {
  ...emptyTasks(),
  rngween: { id: "rngween-2026", counts: fullCounts, earned: [] },
};
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...patch,
});
const wallet = (pumpkoins = 2000, patch = {}) =>
  account({
    rngweenLimited: { ...emptyRngweenLimited(), pumpkoins },
    ...patch,
  });
const buyKey = (p, at = active) =>
  applyProgress(p, {
    type: "buy-rngween-limited",
    id: RNGWEEN_WORLD_KEY.id,
    at,
  });
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
async function refresh(page) {
  await page.evaluate(async () => {
    await (await import("/src/season-clock.js")).refreshSeasonClock();
    window.dispatchEvent(new Event("focus"));
  });
}
async function openGate(page) {
  // Original dialogue transaction tests skip presentation choreography.
  // The scene/typewriter behavior has its own full-motion spec.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const gate = page.getByRole("button", { name: "Speak to The Reaper" });
  await gate.scrollIntoViewIfNeeded();
  await gate.click();
  return page.getByRole("dialog", { name: "The Reaper", exact: true });
}

test("the limited familiar, signature and harvest are costlier and distinctly stronger without changing scores", async () => {
  expect(RNGWEEN_PET.pumpkoinPrice).toBe(800);
  expect(RNGWEEN_SKILL.pumpkoinPrice).toBe(1200);
  expect(RNGWEEN_PET.multiplier).toBe(1.75);
  expect(RNGWEEN_SIGNATURE).toMatchObject({
    value: 2,
    charges: 5,
    icon: "lantern",
  });
  expect(RNGWEEN_SKILL).toMatchObject({
    attempts: 4,
    charges: 7,
    icon: "harvest",
  });
  expect(drawPlanFor([RNGWEEN_SKILL.id])).toMatchObject({ attempts: 4 });
  const values = [5, 777777, 4242, 103001];
  let drawn = 0;
  const result = await runDrawPicks(
    [{ id: RNGWEEN_SKILL.id, attempts: 4 }],
    async () => values[drawn++],
    async (number) => evaluate(number),
  );
  expect(result.draws).toEqual(values);
  expect(result.result.totalEP).toBe(
    Math.max(...values.map((number) => evaluate(number).totalEP)),
  );
  expect(result.picks[0].spent).toBe(4);
});

test("aura purchases require verified November 1–3 UTC, not the mission window or a device calendar", () => {
  for (const at of [null, active, sales - 1, expired, Date.UTC(2027, 10, 1)]) {
    expect(rngweenCalendar(at).aurasBuyable).toBe(false);
    expect(() =>
      applyProgress(wallet(50000), {
        type: "buy-rngween-limited",
        id: "jack-o-glow",
        at,
      }),
    ).toThrow();
  }
  for (const at of [sales, expired - 1]) {
    expect(rngweenCalendar(at).aurasBuyable).toBe(true);
    const p = wallet(50000);
    const q = applyProgress(p, {
      type: "buy-rngween-limited",
      id: "jack-o-glow",
      at,
    });
    expect(coins(q)).toBe(45000);
    expect(q.tasks).toEqual(p.tasks);
    expect(q.rngweenLimited.rewardedMissions).toEqual([]);
  }
});

test("Halloween missions pay aura and Pumpkoins together exactly once, never EP or ordinary task progress", () => {
  let p = account({
    tasks: finished,
    balance: 123,
    totalEarned: 456,
    cycleEarnedEP: 123,
  });
  for (const mission of RNGWEEN_MISSIONS) {
    const before = p;
    p = applyProgress(p, {
      type: "claim-rngween-aura",
      id: mission.id,
      at: active,
    });
    expect(p.owned).toContain(mission.auraId);
    expect(p.rngweenLimited.pumpkoins - before.rngweenLimited.pumpkoins).toBe(
      mission.pumpkoins,
    );
    expect(p.rngweenLimited.rewardedMissions).toContain(mission.id);
    expect(p.balance).toBe(123);
    expect(p.totalEarned).toBe(456);
    expect(p.cycleEarnedEP).toBe(123);
    expect(p.tasks.rngween.counts).toEqual(fullCounts);
    expect(() =>
      applyProgress(p, {
        type: "claim-rngween-aura",
        id: mission.id,
        at: active,
      }),
    ).toThrow("already been collected");
  }
  expect(coins(p)).toBe(600);
  expect(
    p.history.filter((entry) => entry.type === "rngween-mission"),
  ).toHaveLength(4);
  expect(tallyEntries(p.history).spent).toBe(0);
  expect(parseProgress(JSON.stringify(p))).toEqual(p);
  expect(applyProgress(p, { type: "claim-rngween-coins", at: active })).toBe(p);
  const deleted = { ...p, history: [] };
  expect(
    applyProgress(deleted, { type: "claim-rngween-coins", at: active }),
  ).toBe(deleted);
  expect(() =>
    applyProgress(account(), {
      type: "claim-rngween-aura",
      id: "jack-o-glow",
      at: active,
    }),
  ).toThrow("Complete the mission");
});

test("older collected mission receipts get their new coin reward once, but never resurrect expired currency", () => {
  const p = account({
    tasks: {
      ...finished,
      rngween: { ...finished.rngween, earned: ["jack-o-glow", "witchfire"] },
    },
  });
  delete p.rngweenLimited.rewardedMissions;
  const q = applyProgress(parseProgress(JSON.stringify(p)), {
    type: "claim-rngween-coins",
    at: active,
  });
  expect(coins(q)).toBe(300);
  expect(q.rngweenLimited.rewardedMissions).toEqual([
    "jack-o-glow",
    "witchfire",
  ]);
  const r = parseProgress(JSON.stringify(q));
  expect(applyProgress(r, { type: "claim-rngween-coins", at: sales })).toBe(r);
  for (const at of [null, expired])
    expect(() =>
      applyProgress(p, { type: "claim-rngween-coins", at }),
    ).toThrow();
  const retired = applyProgress(q, {
    type: "retire-rngween-limited",
    at: expired,
  });
  expect(retired.rngweenLimited).not.toHaveProperty("pumpkoins");
  expect(() =>
    applyProgress(retired, { type: "claim-rngween-coins", at: active }),
  ).toThrow();
});

test("a challenge key is a saved shortcut to two World fragments, not a skin, aura, EP purchase or mission shortcut", () => {
  const p = wallet();
  const q = buyKey(p);
  expect(coins(q)).toBe(0);
  expect(q.rngweenLimited.bought).toEqual([RNGWEEN_WORLD_KEY.id]);
  expect(q.owned).toEqual([]);
  expect(q.pets).toEqual([]);
  expect(q.tasks).toEqual(p.tasks);
  expect(q.balance).toBe(p.balance);
  expect(rngweenWorldUnlocked(q.tasks, q.rngweenLimited)).toBe(true);
  expect(parseProgress(JSON.stringify(q)).rngweenLimited).toEqual(
    q.rngweenLimited,
  );
  expect(() => buyKey(q)).toThrow("already unlocked");
  expect(() => buyKey(wallet(999))).toThrow("Not enough Pumpkoins");
  expect(
    buyKey(wallet(2000, { tasks: finished })).rngweenLimited.bought,
  ).toContain(RNGWEEN_WORLD_KEY.id);
  expect(() =>
    applyProgress(p, { type: "buy", id: RNGWEEN_WORLD_KEY.id, at: active }),
  ).toThrow();
  for (const at of [null, Date.UTC(2026, 9, 20), expired])
    expect(() => buyKey(p, at)).toThrow();
  expect(buyKey(p, expired - 1).rngweenLimited.bought).toContain(
    RNGWEEN_WORLD_KEY.id,
  );
  const drawn = completedWorldRoll(q, {
    type: "rngween-world-roll",
    number: 6666,
    expectedCount: 0,
    at: active,
  });
  expect(drawn.owned).toEqual(["hexbound"]);
  const retired = applyProgress(drawn, {
    type: "retire-rngween-limited",
    at: expired,
  });
  expect(retired.owned).toEqual(["hexbound"]);
  expect(rngweenWorldUnlocked(retired.tasks, retired.rngweenLimited)).toBe(
    false,
  );
  expect(retired.rngweenLimited).not.toHaveProperty("bought");
});

test("key, mission-coin receipts and world pool survive every reset without paying rewards twice", () => {
  let p = buyKey(wallet());
  p = {
    ...p,
    tasks: {
      ...finished,
      rngween: { ...finished.rngween, earned: ["witchfire"] },
    },
  };
  p = applyProgress(p, { type: "claim-rngween-coins", at: active });
  p = completedWorldRoll(p, {
    type: "rngween-world-roll",
    number: 123,
    expectedCount: 0,
    at: active,
  });
  p = {
    ...p,
    discovered: allBadgeMetadata.map((badge) => badge.id),
    cycleEarnedEP: 300000000,
    balance: 300000000,
    totalEarned: 300000000,
  };
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
      { type, ...counts, at: active },
    );
    const reload = parseProgress(JSON.stringify(reset));
    expect(reload.rngweenLimited).toEqual(p.rngweenLimited);
    expect(rngweenWorldUnlocked(reload.tasks, reload.rngweenLimited)).toBe(
      true,
    );
    expect(
      applyProgress(reload, { type: "claim-rngween-coins", at: active }),
    ).toBe(reload);
  }
});

test("the aura shop visibly waits for November 1 and ignores changing the device date", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await seedProgress(page, wallet(50000));
  await page.goto("/shop/limited");
  const button = page.getByRole("button", {
    name: "Buy Jack-o'-Glow for 5000 Pumpkoins",
  });
  await expect(button).toBeDisabled();
  await expect(page.locator('[data-limited-item="jack-o-glow"]')).toContainText(
    "Purchases open November 1 UTC",
  );
  await page.clock.setFixedTime(new Date(sales));
  await refresh(page);
  await expect(button).toBeDisabled();
  clock.set(sales);
  await refresh(page);
  await expect(button).toBeEnabled();
  await button.click();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await expect
    .poll(async () => (await saved(page)).owned.includes("jack-o-glow"))
    .toBe(true);
});

test("the Reaper entrance sits at the Roll/footer seam on desktop and mobile, never in navigation", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  for (const width of [1280, 390, 340]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const gate = page.getByRole("complementary", {
      name: "Halloween world entrance",
    });
    await expect(gate).toBeVisible();
    const layout = await gate.evaluate((node) => ({
      next: node.nextElementSibling.tagName,
      right: node.getBoundingClientRect().right,
      width: innerWidth,
      afterMain: node.previousElementSibling.tagName,
    }));
    expect(layout.next).toBe("FOOTER");
    expect(layout.afterMain).toBe("MAIN");
    expect(layout.right).toBeLessThanOrEqual(layout.width);
    await expect(
      page.locator(".header nav button").filter({ hasText: "RNGween World" }),
    ).toHaveCount(0);
    const dialog = await openGate(page);
    await expect(dialog).toContainText("open to anyone");
    // A few short reply buttons, no text box.
    await expect(dialog.locator("input, textarea")).toHaveCount(0);
    expect(
      await dialog
        .getByLabel("Your reply", { exact: true })
        .getByRole("button")
        .count(),
    ).toBeGreaterThanOrEqual(4);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Speak to The Reaper" }),
    ).toBeFocused();
  }
});

test("the Reaper explains public zones, confirms a paid challenge key and remembers the timed Valley pool through reload", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/");
  const dialog = await openGate(page);
  await dialog.getByRole("button", { name: "What is this place?" }).click();
  await expect(dialog).toContainText("Graveyard");
  await expect(dialog).toContainText("Haunted House");
  await expect(dialog).toContainText("Sixty badges");
  await dialog
    .getByRole("button", { name: "How do I get into the Valley?" })
    .click();
  await expect(dialog).toContainText("Four fragments make a key");
  await dialog.getByRole("button", { name: "I'll buy a key." }).click();
  await expect(dialog).toContainText("No refunds, no aura, no Hexbound");
  await dialog.getByRole("button", { name: "Not now" }).click();
  expect(coins(await saved(page))).toBe(2000);
  await dialog.getByRole("button", { name: "I'll buy a key." }).click();
  await dialog.getByRole("button", { name: "Buy the key · 2,000" }).click();
  await expect(dialog).toContainText("Your Valley key is good");
  const before = await saved(page);
  expect(coins(before)).toBe(0);
  expect(before.tasks.rngween.earned).toEqual([]);
  await dialog.getByRole("button", { name: "Enter RNGween World" }).click();
  await expect(page).toHaveURL(/\/rngween-world\/?$/);
  await expect(page.locator("[data-world-zone]")).toHaveCount(5);
  await page.locator('[data-world-zone="valley"]').click();
  for (let i = 1; i <= 2; i++) {
    await page.getByRole("button", { name: /Roll in the Valley/ }).click();
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    await revealWorld(page);
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.drawn.length)
      .toBe(i);
    if (i === 1) {
      clock.set(active + 12000);
      await page.reload();
    }
  }
  const after = await saved(page);
  expect(new Set(after.rngweenLimited.drawn).size).toBe(2);
  expect(after.balance).toBe(before.balance);
});

test("completed aura trials do not gate public entry; Nov 3 still permits a paid Valley challenge shortcut", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await seedProgress(page, wallet(2000, { tasks: finished }));
  await page.goto("/");
  let dialog = await openGate(page);
  await expect(dialog).toContainText("open to anyone");
  await expect(
    dialog.getByRole("button", { name: "Enter RNGween World" }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "I'll buy a key." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close Reaper dialogue" }).click();
  await page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key));
    p.tasks.rngween.counts = { rolls: 0, rare: 0, banked: 0, taskClaims: 0 };
    localStorage.setItem(key, JSON.stringify(p));
  }, PROGRESS_KEY);
  clock.set(expired - 3600000);
  await page.reload();
  dialog = await openGate(page);
  await dialog.getByRole("button", { name: "What about the auras?" }).click();
  await expect(dialog).toContainText("The tasks are done");
  await expect(
    dialog.getByRole("button", { name: "Show me the tasks" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "I'll buy a key." }).click();
  await dialog.getByRole("button", { name: "Buy the key · 2,000" }).click();
  await expect(dialog).toContainText("Your Valley key is good");
  expect(coins(await saved(page))).toBe(0);
});

test("new and previously collected tasks visibly pay Pumpkoins once and their history is a task reward", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, {
    tasks: {
      ...finished,
      rngween: { ...finished.rngween, earned: ["witchfire"] },
    },
  });
  await page.goto("/tasks");
  await expect.poll(async () => coins(await saved(page))).toBe(200);
  const card = page.locator('[data-event-mission="jack-o-glow"]');
  await expect(card).toContainText("100 Pumpkoins");
  await card
    .getByRole("button", { name: "Collect Jack-o'-Glow", exact: true })
    .click();
  await expect.poll(async () => coins(await saved(page))).toBe(300);
  await page.reload();
  await expect.poll(async () => coins(await saved(page))).toBe(300);
  await page.goto("/history");
  await page.getByRole("button", { name: "Tasks", exact: true }).last().click();
  await expect(page.locator('[data-event-type="rngween-mission"]')).toHaveCount(
    2,
  );
  await expect(
    page
      .locator('[data-event-type="rngween-mission"]')
      .filter({ hasText: "Light the lantern" }),
  ).toContainText("+100 Pumpkoins");
});

test("the once-only event welcome is calendar-gated, works in light/off mode and stays seen through reload and settings reset", async ({
  page,
}) => {
  await mockSeasonClock(page, active, { introSeen: false });
  await seedProgress(page, {}, { introSeen: false });
  await page.addInitScript(() => {
    localStorage.setItem("rng-theme", "light");
    localStorage.setItem(
      "rng-infinite-settings-v1",
      JSON.stringify({ halloweenMode: false }),
    );
  });
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to RNGween" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("600 Pumpkoins");
  await expect(welcome).toContainText("buy one for 2,000 Pumpkoins");
  await expect(welcome).toContainText("November 1");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RNGWEEN_INTRO_KEY),
  ).toBe("rngween-2026");
  await welcome
    .getByRole("button", { name: "Let's play", exact: true })
    .click();
  await expect(welcome).not.toBeVisible();
  await page.goto("/tasks");
  await page.goto("/");
  await expect(welcome).not.toBeVisible();
  await page.evaluate(() =>
    localStorage.removeItem("rng-infinite-settings-v1"),
  );
  await page.reload();
  await expect(welcome).not.toBeVisible();
});

test("a guest sees the welcome only once even if the first view is reloaded without dismissing it", async ({
  page,
}) => {
  await mockSeasonClock(page, active, { introSeen: false });
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Welcome to RNGween" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Welcome to RNGween" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
});

test("no welcome or world entrance outside the verified limited window", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active - 86400000 * 6, {
    introSeen: false,
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("dialog", { name: "Welcome to RNGween" }),
  ).not.toBeVisible();
  await expect(page.locator(".rngween-gate-line")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RNGWEEN_INTRO_KEY),
  ).toBeNull();
  clock.set(expired);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".rngween-gate-line")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Welcome to RNGween" }),
  ).not.toBeVisible();
});

test("a wrapped mobile rack reserves its real height and keeps family/tooltips/summary within the viewport", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  const owned = [
    "skill-bay-1",
    "skill-bay-2",
    "surge",
    "twice",
    "bedrock",
    "turbo",
    "quarry",
    "flywheel",
    "auto-roll",
  ];
  await seedProgress(page, {
    owned: [...owned, RNGWEEN_SKILL.id],
    rebirths: 6,
    ultraRebirths: 2,
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_PET.id, RNGWEEN_SKILL.id],
    },
    pets: [RNGWEEN_PET.id],
    activePet: RNGWEEN_PET.id,
    skills: [
      "surge",
      "twice",
      "bedrock",
      "turbo",
      "quarry",
      RNGWEEN_SKILL.id,
      ...rebirthSkills.map((skill) => skill.id),
    ],
    equippedSkills: [
      "surge",
      "twice",
      RNGWEEN_SKILL.id,
      RNGWEEN_SIGNATURE.id,
      ...rebirthSkills.map((skill) => skill.id),
    ],
    skillCharge: {
      surge: skillById.get("surge").charges,
      [RNGWEEN_SIGNATURE.id]: 5,
      [RNGWEEN_SKILL.id]: 7,
    },
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [340, 390, 760]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "GENERATE", exact: true }),
    ).toBeEnabled();
    const rack = page.getByRole("group", { name: "Skills", exact: true });
    const geometry = await rack.evaluate((node) => ({
      rack: node.getBoundingClientRect().toJSON(),
      header: document
        .querySelector(".header")
        .getBoundingClientRect()
        .toJSON(),
      number: document
        .querySelector(".question-number")
        .getBoundingClientRect()
        .toJSON(),
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(geometry.rack.top).toBeGreaterThanOrEqual(geometry.header.bottom);
    expect(geometry.number.top).toBeGreaterThan(geometry.rack.bottom);
    expect(geometry.document).toBeLessThanOrEqual(geometry.width);
    await rack.getByRole("button", { name: /^Pet group/ }).click();
    const members = rack.locator('[data-stack="pet"] .skill-stack-members');
    await expect(members).toBeVisible();
    const box = await members.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(geometry.rack.bottom);
    await members.locator(`[data-skill="${RNGWEEN_SIGNATURE.id}"]`).click();
    const tip = members.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Lantern Glow");
    const tipBox = await tip.boundingBox();
    expect(tipBox.y).toBeGreaterThanOrEqual(box.y + box.height);
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(width);
    await rack.getByRole("button", { name: /^Rack summary/ }).click();
    const panel = rack.locator(".rack-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Banked EP multiplier");
    const panelBox = await panel.boundingBox();
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(740 - 64);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    await expect(
      page.locator(".is-rngween-familiar .familiar-soul-orbit").first(),
    ).toHaveCSS("animation-name", "none");
  }
});

test("a missing paid-coin flag is repaired from history instead of paying a claimed mission again", () => {
  const p = account({ tasks: finished });
  const q = applyProgress(p, {
    type: "claim-rngween-aura",
    id: "witchfire",
    at: active,
  });
  delete q.rngweenLimited.rewardedMissions;
  const r = parseProgress(JSON.stringify(q));
  expect(r.rngweenLimited.rewardedMissions).toEqual(["witchfire"]);
  expect(coins(r)).toBe(200);
  expect(applyProgress(r, { type: "claim-rngween-coins", at: active })).toBe(r);
});

test("an open aura shelf starts sales at the November 1 UTC boundary without reloading", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(sales - 1000));
  const clock = await mockSeasonClock(page, sales - 1000);
  await seedProgress(page, wallet(50000));
  await page.goto("/shop/limited");
  const buy = page.getByRole("button", {
    name: "Buy Jack-o'-Glow for 5000 Pumpkoins",
  });
  await expect(buy).toBeDisabled();
  clock.set(sales);
  await page.clock.runFor(1000);
  await expect(buy).toBeEnabled();
});

test("a key needs fresh website verification even after its purchase was confirmed on screen", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/");
  const dialog = await openGate(page);
  await dialog.getByRole("button", { name: "I'll buy a key." }).click();
  clock.set(null);
  await dialog.getByRole("button", { name: "Buy the key · 2,000" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Connect to the website to verify",
  );
  const p = await saved(page);
  expect(coins(p)).toBe(2000);
  expect(p.rngweenLimited.bought).toEqual([]);
  expect(p.history.filter((row) => row.type === "rngween-purchase")).toEqual(
    [],
  );
});

test("two same-account key confirmations spend only once under the writer lock", async ({
  page,
  context,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/");
  const other = await context.newPage();
  try {
    await mockSeasonClock(other, active);
    await other.goto("/");
    const [left, right] = await Promise.all([openGate(page), openGate(other)]);
    await left.getByRole("button", { name: "I'll buy a key." }).click();
    await right.getByRole("button", { name: "I'll buy a key." }).click();
    // Hold the first fresh proof until both real clicks start. The writer
    // serializes proofs too, so waiting for two network requests would deadlock.
    // Without a barrier the first save can disable the other button before its
    // click, testing actionability rather than concurrent purchase requests.
    let clicks = 0;
    let release;
    const bothStarted = new Promise((resolve) => {
      release = resolve;
    });
    const started = () => {
      clicks += 1;
      if (clicks >= 2) release();
    };
    for (const [p, dialogue] of [
      [page, left],
      [other, right],
    ]) {
      await p.exposeBinding("rngweenConfirmationStarted", started);
      await dialogue
        .getByRole("button", { name: "Buy the key · 2,000" })
        .evaluate((button) => {
          button.addEventListener(
            "click",
            () => window.rngweenConfirmationStarted(),
            { capture: true, once: true },
          );
        });
      await p.route("**/favicon.svg?season-clock=*", async (route) => {
        await bothStarted;
        await route.fulfill({
          status: 200,
          headers: { date: new Date(active).toUTCString() },
          body: "",
        });
      });
    }
    await Promise.all([
      left.getByRole("button", { name: "Buy the key · 2,000" }).click(),
      right.getByRole("button", { name: "Buy the key · 2,000" }).click(),
    ]);
    await expect
      .poll(async () =>
        (await saved(page)).rngweenLimited.bought.includes(
          RNGWEEN_WORLD_KEY.id,
        ),
      )
      .toBe(true);
    const p = await saved(page);
    expect(clicks).toBe(2);
    expect(coins(p)).toBe(0);
    expect(
      p.history.filter((row) => row.productId === RNGWEEN_WORLD_KEY.id),
    ).toHaveLength(1);
  } finally {
    await other.close();
  }
});

test("a keyless direct World route stays open while only the Valley challenge remains locked", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.goto("/rngween-world");
  await expect(page).toHaveURL(/\/rngween-world\/?$/);
  await expect(
    page.getByRole("heading", { name: "RNGween World", exact: true }),
  ).toBeVisible();
  for (const [id, name] of [
    ["pumpkin-patch", "Pumpkin Patch"],
    ["graveyard", "Graveyard"],
    ["haunted-house", "Haunted House"],
  ]) {
    await page.locator(`[data-world-zone="${id}"]`).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`Roll in ${name}`) }),
    ).toBeEnabled();
  }
  await page.locator('[data-world-zone="valley"]').click();
  await expect(page.getByText("Challenge key needed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Roll in the Valley/ }),
  ).toHaveCount(0);
});
