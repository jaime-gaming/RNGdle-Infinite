import { RNGWEEN_WORLD_KEY } from "../src/rngween-limited.js";
import {
  rngweenValleyUnlocked,
  emptyRngweenWorld,
} from "../src/rngween-world-zones.js";
import { completedWorldRoll, revealWorld } from "./helpers/world-roll.js";
import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { chooseTheme } from "./helpers/appearance.js";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  rngweenCalendar,
  RNGWEEN_MISSIONS,
  RNGWEEN_WORLD_SKIN,
} from "../src/rngween.js";
import {
  EP_PER_PUMPKOIN,
  RNGWEEN_LIMITED_ITEMS,
  RNGWEEN_PET,
  RNGWEEN_SKILL,
  RNGWEEN_SIGNATURE,
  RNGWEEN_WORLD_MAX,
  emptyRngweenLimited,
  parseRngweenLimited,
  rngweenWorldUnlocked,
  retireRngweenLimited,
} from "../src/rngween-limited.js";
import { randomWorldNumber } from "../src/rngween-world-random.js";
import { evaluate } from "./helpers/index.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { emptyTasks } from "../src/tasks.js";
import { armedSkills, skillSlots, skillTakesSlot } from "../src/skills.js";
import { availableGoals, validGoal } from "../src/gameplay-loop.js";
import { PETS, petDrop } from "../src/pets.js";
import { aurasInFamily, shopProducts } from "../src/shop-data.js";
import { tallyEntries } from "../src/history-tally.js";

const active = Date.UTC(2026, 9, 26, 12);
const sales = Date.UTC(2026, 10, 1);
const final = Date.UTC(2026, 10, 3, 23, 59, 49);
const expired = Date.UTC(2026, 10, 4);
const taskCounts = { rolls: 200, rare: 40, banked: 5000000, taskClaims: 18 };
const finished = {
  ...emptyTasks(),
  rngween: { id: "rngween-2026", counts: taskCounts, earned: [] },
};
const account = (values = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 500000000,
  totalEarned: 500000000,
  ...values,
});
const keyAccount = (values = {}) =>
  account({
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_WORLD_KEY.id],
    },
    ...values,
  });
const exchange = (p, amount = 50000, at = active) =>
  applyProgress(p, {
    type: "exchange-pumpkoins",
    amount,
    at,
    eventId: `exchange:${amount}:${at}`,
  });
const buy = (p, id, at = active) =>
  applyProgress(p, { type: "buy-rngween-limited", id, at });
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const sample = (words = [0]) => {
  let index = 0;
  return {
    getRandomValues(a) {
      a[0] = words[index++ % words.length];
      return a;
    },
  };
};
async function worldRandom(page, words = [0]) {
  await page.route("**/rngween-world.worker*.js*", async (route) => {
    const response = await page.request.get(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `const testWords=${JSON.stringify(words)};let at=0;Object.defineProperty(crypto,'getRandomValues',{value(a){a[0]=testWords[at++ % testWords.length];return a;}});\n${await response.text()}`,
    });
  });
}

test("October 21–November 3 covers shop/world/appearance without extending the aura trials", () => {
  expect(rngweenCalendar(Date.UTC(2026, 9, 20, 23, 59, 59)).limitedPhase).toBe(
    "upcoming",
  );
  expect(rngweenCalendar(final)).toMatchObject({
    phase: "ended",
    decorated: true,
    limitedPhase: "active",
    limitedEndsAt: expired,
  });
  expect(rngweenCalendar(expired).limitedPhase).toBe("ended");
  for (const at of [null, undefined, NaN, Date.UTC(2027, 9, 26)])
    expect(rngweenCalendar(at).limitedPhase).not.toBe("active");
});

test("EP exchange is whole, one-way, atomic, and does not manufacture income or mission credit", () => {
  const p = account();
  const q = exchange(p, 1000);
  expect(q.balance).toBe(p.balance - 1000 * EP_PER_PUMPKOIN);
  expect(q.rngweenLimited.pumpkoins).toBe(1000);
  expect(q.totalEarned).toBe(p.totalEarned);
  expect(q.cycleEarnedEP).toBe(p.cycleEarnedEP);
  expect(q.tasks).toEqual(p.tasks);
  expect(tallyEntries(q.history).spent).toBe(10000000);
  expect(parseProgress(JSON.stringify(q)).history).toEqual(q.history);
  expect(exchange(q, 1000)).toEqual(q);
  for (const amount of [0, -1, 1.5, "1", Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => exchange(p, amount)).toThrow();
  expect(() => exchange(account({ balance: 9999 }), 1)).toThrow(
    "Not enough EP",
  );
  for (const at of [null, Date.UTC(2026, 9, 20), expired])
    expect(() => exchange(p, 1, at)).toThrow("open October");
  expect(() => exchange({ ...p, profile: null }, 1)).toThrow("profile");
  expect(p.rngweenLimited.pumpkoins).toBe(0);
});

test("costly aura fallback spends only Pumpkoins, excludes owned auras and never completes missions", () => {
  const p = exchange(account());
  let q = p;
  for (const item of RNGWEEN_LIMITED_ITEMS.filter(
    (item) => item.kind === "aura",
  )) {
    const before = q.rngweenLimited.pumpkoins;
    q = buy(q, item.id, sales);
    expect(q.rngweenLimited.pumpkoins).toBe(before - item.pumpkoinPrice);
    expect(q.balance).toBe(p.balance);
    expect(q.owned).toContain(item.id);
    expect(q.tasks).toEqual(p.tasks);
    expect(() => buy(q, item.id, sales)).toThrow("already own");
    expect(() =>
      applyProgress(q, { type: "buy", id: item.id, at: active }),
    ).toThrow("never for sale for EP");
  }
  expect(rngweenWorldUnlocked(q.tasks)).toBe(true);
  expect(rngweenValleyUnlocked(q.rngweenLimited)).toBe(false);
  expect(aurasInFamily("rngween", q.owned)).toHaveLength(4);
  expect(() => buy(q, RNGWEEN_WORLD_SKIN.id)).toThrow("not for sale");
  expect(() => buy(account(), "jack-o-glow", sales)).toThrow(
    "Not enough Pumpkoins",
  );
  const broken = { ...q, owned: [] };
  expect(parseProgress(JSON.stringify(broken)).owned.sort()).toEqual(
    q.owned.sort(),
  );
});

test("limited companion/signature and skill stay out of EP stock, drops and goals and use rack slots", () => {
  let p = exchange(account(), 5000);
  p = buy(p, RNGWEEN_PET.id);
  p = buy(p, RNGWEEN_SKILL.id);
  expect(p.activePet).toBe(RNGWEEN_PET.id);
  expect(p.equippedSkills).toEqual([RNGWEEN_SIGNATURE.id, RNGWEEN_SKILL.id]);
  for (const id of p.equippedSkills) expect(skillTakesSlot(id)).toBe(true);
  expect(skillSlots(p.owned)).toBe(2);
  expect(PETS.map((pet) => pet.id)).not.toContain(RNGWEEN_PET.id);
  expect(shopProducts.map((item) => item.id)).not.toContain(RNGWEEN_SKILL.id);
  expect(
    petDrop(
      0,
      PETS.map((pet) => pet.id),
    ),
  ).toBeNull();
  expect(availableGoals(account()).map((item) => item.id)).not.toContain(
    RNGWEEN_SKILL.id,
  );
  expect(validGoal(RNGWEEN_PET.id)).toBe(false);
  expect(() =>
    applyProgress(account(), {
      type: "buy-pet",
      id: RNGWEEN_PET.id,
      at: active,
    }),
  ).toThrow("Pumpkoins");
  expect(parseProgress(JSON.stringify(p)).equippedSkills).toEqual(
    p.equippedSkills,
  );
  p.skillCharge = { [RNGWEEN_SIGNATURE.id]: 6, [RNGWEEN_SKILL.id]: 9 };
  expect(armedSkills(p)).toEqual(p.equippedSkills);
});

test("World entry is public but aura missions, ownership and currency never replace the Valley challenge key", () => {
  for (const tasks of [finished, emptyTasks()])
    expect(rngweenWorldUnlocked(tasks, account().rngweenLimited)).toBe(true);
  const p = account({ tasks: finished });
  expect(rngweenValleyUnlocked(p.rngweenLimited)).toBe(false);
  expect(() =>
    applyProgress(p, {
      type: "rngween-world-roll",
      zone: "valley",
      number: 6666,
      expectedCount: 0,
      at: active,
    }),
  ).toThrow("needs a key");
  const mini = applyProgress(p, {
    type: "rngween-world-roll",
    zone: "graveyard",
    choice: 1,
    number: 1,
    at: active,
  });
  expect(mini.rngweenLimited.world.pending.zone).toBe("graveyard");
});

test("world RNG is rejection-sampled uniformly among unseen numbers, never main-game randomness", () => {
  expect(randomWorldNumber([], sample([0xffffffff, 0]))).toBe(1);
  expect(randomWorldNumber([1, 2, 3], sample([0]))).toBe(4);
  const drawn = [];
  const crypto = sample();
  for (let n = 1; n <= 9999; n++) {
    const number = randomWorldNumber(drawn, crypto);
    expect(number).toBe(n);
    drawn.push(number);
  }
  expect(new Set(drawn).size).toBe(9999);
  expect(() => randomWorldNumber(drawn, crypto)).toThrow("exhausted");
  for (const pool of [[1, 1], [0], [10000], [1.5]])
    expect(() => randomWorldNumber(pool, crypto)).toThrow("verified");
  expect(() => randomWorldNumber([], {})).toThrow("Secure randomness");
});

test("world awards only Hexbound at 6666, blocks repeats/stale pools and preserves the main game", () => {
  const p = keyAccount({
    tasks: finished,
    pendingRoll: { id: "untouched" },
    skillCharge: { surge: 3 },
  });
  let q = completedWorldRoll(p, {
    type: "rngween-world-roll",
    number: 1,
    expectedCount: 0,
    at: active,
  });
  expect(q.rngweenLimited.drawn).toEqual([1]);
  expect(q.rngweenLimited.skinEarned).toBe(false);
  q = completedWorldRoll(q, {
    type: "rngween-world-roll",
    number: 6666,
    expectedCount: 1,
    at: final,
  });
  expect(q.owned).toContain("hexbound");
  expect(q.equipped).toBe("hexbound");
  for (const key of [
    "balance",
    "totalEarned",
    "cycleEarnedEP",
    "history",
    "tasks",
    "pendingRoll",
    "skillCharge",
    "cooldownUntil",
  ])
    expect(q[key]).toEqual(p[key]);
  for (const number of [0, 10000, 1, 6666, 3.5])
    expect(() =>
      completedWorldRoll(q, {
        type: "rngween-world-roll",
        number,
        expectedCount: 2,
        at: active,
      }),
    ).toThrow("unseen numbers");
  expect(() =>
    completedWorldRoll(q, {
      type: "rngween-world-roll",
      number: 2,
      expectedCount: 0,
      at: active,
    }),
  ).toThrow("pool changed");
  expect(() =>
    completedWorldRoll(q, {
      type: "rngween-world-roll",
      number: 2,
      expectedCount: 2,
      at: expired,
    }),
  ).toThrow("open October");
});

test("limited entitlements, currency, non-repeat pool and permanent prize survive every reset cycle", () => {
  let p = exchange(keyAccount({ tasks: finished }), 10000);
  p = buy(buy(p, RNGWEEN_PET.id), RNGWEEN_SKILL.id);
  p = completedWorldRoll(p, {
    type: "rngween-world-roll",
    number: 6666,
    expectedCount: 0,
    at: active,
  });
  p.discovered = allBadgeMetadata.map((badge) => badge.id);
  p.cycleEarnedEP = 300000000;
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
    expect(reset.rngweenLimited).toEqual(p.rngweenLimited);
    expect(reset.pets).toEqual([RNGWEEN_PET.id]);
    expect(reset.activePet).toBe(RNGWEEN_PET.id);
    expect(reset.owned).toContain(RNGWEEN_SKILL.id);
    expect(reset.owned).toContain("hexbound");
    const reload = parseProgress(JSON.stringify(reset));
    expect(reload.rngweenLimited).toEqual(p.rngweenLimited);
    expect(reload.owned).toContain("hexbound");
    expect(reload.equippedSkills).toContain(RNGWEEN_SKILL.id);
  }
});

test("temporary wallet perks change banked EP only and cannot pay after expiry", () => {
  let p = buy(exchange(account(), 1000), RNGWEEN_PET.id);
  p.pendingRoll = {
    id: "familiar-roll",
    number: 103001,
    skills: [RNGWEEN_SIGNATURE.id],
  };
  const result = evaluate(103001);
  const settled = applyProgress(p, {
    type: "complete",
    id: "familiar-roll",
    result,
    cooldownUntil: 0,
    at: active,
    rngweenAt: active,
  });
  expect(settled.balance - p.balance).toBe(
    Math.round(
      result.totalEP * RNGWEEN_PET.multiplier * RNGWEEN_SIGNATURE.value,
    ),
  );
  expect(settled.history.find((entry) => entry.type === "roll").ep).toBe(
    result.totalEP,
  );
  const late = applyProgress(
    { ...p, pendingRoll: null },
    {
      type: "complete",
      id: "late-roll",
      result,
      cooldownUntil: 0,
      at: expired,
      rngweenAt: expired,
    },
  );
  expect(late.balance - p.balance).toBe(result.totalEP);
  expect(late.rngweenLimited.retired).toBe(true);
  const unknown = applyProgress(
    { ...p, pendingRoll: null },
    {
      type: "complete",
      id: "unknown-roll",
      result,
      cooldownUntil: 0,
      at: active,
      rngweenAt: null,
      source: "offline",
    },
  );
  expect(unknown.balance - p.balance).toBe(result.totalEP);
});

test("save repair retains valid world numbers and restores the prize without losing account progress", () => {
  const limited = {
    ...emptyRngweenLimited(),
    drawn: [1, 1, 2, 0, "3", 9999, 6666, 10000],
    pumpkoins: -10,
  };
  const read = parseRngweenLimited(limited);
  expect(read.repaired).toBe(true);
  expect(read.limited.drawn).toEqual([1, 2, 9999, 6666]);
  expect(read.limited.skinEarned).toBe(true);
  expect(read.limited.pumpkoins).toBe(0);
  const p = parseAndRepairProgress(
    JSON.stringify(account({ rngweenLimited: limited })),
  );
  expect(p.progress.owned).toContain("hexbound");
  expect(p.progress.balance).toBe(500000000);
  expect(parseAndRepairProgress(JSON.stringify(p.progress)).repairs).toEqual(
    [],
  );
});

test("verified expiry removes all temporary balances/equipment/pools, not cosmetics or committed rolls", () => {
  let p = exchange(keyAccount({ tasks: finished }), 10000);
  p = buy(buy(buy(p, RNGWEEN_PET.id), RNGWEEN_SKILL.id), "jack-o-glow", sales);
  p = completedWorldRoll(p, {
    type: "rngween-world-roll",
    number: 6666,
    expectedCount: 0,
    at: active,
  });
  p.skillCharge = {
    surge: 2,
    [RNGWEEN_SIGNATURE.id]: 6,
    [RNGWEEN_SKILL.id]: 9,
  };
  p.loadouts = [
    { id: "rack", name: "Limited", skills: ["surge", RNGWEEN_SKILL.id] },
  ];
  p.pendingRoll = {
    id: "already-committed",
    number: 42,
    skills: [RNGWEEN_SKILL.id],
  };
  expect(retireRngweenLimited(p, null)).toBe(p);
  expect(retireRngweenLimited(p, final)).toBe(p);
  const q = retireRngweenLimited(p, expired);
  expect(q.rngweenLimited).toEqual({
    id: "rngween-2026",
    auras: ["jack-o-glow"],
    skinEarned: true,
    retired: true,
  });
  expect(q.pets).not.toContain(RNGWEEN_PET.id);
  expect(q.activePet).toBe("none");
  expect(q.owned.sort()).toEqual(["hexbound", "jack-o-glow"]);
  expect(q.equippedSkills).toEqual([]);
  expect(q.skills).toEqual([]);
  expect(q.skillCharge).toEqual({ surge: 2 });
  expect(q.loadouts[0].skills).toEqual(["surge"]);
  expect(q.pendingRoll).toEqual(p.pendingRoll);
  expect(q.balance).toBe(p.balance);
  expect(q.tasks).toEqual(p.tasks);
  expect(retireRngweenLimited(q, expired)).toBe(q);
  expect(() => exchange(q, 1, active)).toThrow("open October");
  const restored = parseProgress(
    JSON.stringify({ ...q, pendingRoll: null, owned: [] }),
  );
  expect(restored.owned.sort()).toEqual(["hexbound", "jack-o-glow"]);
  expect(restored.rngweenLimited).not.toHaveProperty("pumpkoins");
});

test("Halloween mode is dark-only and resumes the saved preference without changing the game", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.goto("/tasks");
  const before = await saved(page);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Halloween mode" }),
  ).toBeDisabled();
  await expect(page.locator(".rngween-decor")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await chooseTheme(page, "dark");
  await expect(page.locator(".rngween-decor")).toBeVisible();
  await chooseTheme(page, "light");
  await expect(page.locator(".rngween-decor")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await chooseTheme(page, "system");
  await expect(page.locator(".rngween-decor")).toBeVisible();
  expect(await saved(page)).toEqual(before);
});

test("all decorations and secret reveals stay behind game content and the footer on desktop/phone", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
  await page.goto("/");
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".rngween-decor")).toHaveCSS("z-index", "-1");
    await expect(page.locator(".rngween-curios")).toHaveCSS("z-index", "-1");
    await page.keyboard.type("boo");
    await expect(page.locator(".rngween-secret-reveal")).toHaveCSS(
      "z-index",
      "-1",
    );
    const safe = await page.locator(".generate").evaluate((button) => {
      const b = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
      );
    });
    expect(safe).toBe(true);
    const canvas = await page.locator(".rngween-decor").boundingBox();
    const header = await page.locator(".header").boundingBox();
    expect(canvas.y).toBe(header.height);
    expect(canvas.x).toBeGreaterThanOrEqual(0);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("footer")).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("the limited shop is the first full-width shelf; exchange/purchase confirmation updates saved wallets", async ({
  page,
}) => {
  await mockSeasonClock(page, sales);
  await seedProgress(page, { balance: 100000000, totalEarned: 100000000 });
  await page.goto("/shop");
  const first = page.locator(".shop-jump [data-shelf]").first();
  await expect(first).toHaveAttribute("data-shelf", "limited");
  await expect(first).toContainText("Limited Shop: RNGween 2026");
  await first.click();
  await expect(page).toHaveURL(/\/shop\/limited$/);
  await page.getByLabel("Pumpkoins to receive").fill("5000");
  await page.getByRole("button", { name: "Exchange EP for Pumpkoins" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).balance).toBe(100000000);
  await page.getByRole("button", { name: "Exchange EP for Pumpkoins" }).click();
  await page.getByRole("button", { name: "Confirm exchange" }).click();
  await expect(page.locator("[data-pumpkoins]")).toHaveAttribute(
    "data-pumpkoins",
    "5000",
  );
  await page
    .getByRole("button", { name: "Buy Jack-o'-Glow for 5000 Pumpkoins" })
    .click();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(page.locator('[data-limited-item="jack-o-glow"]')).toHaveCount(
    0,
  );
  const p = await saved(page);
  expect(p.balance).toBe(50000000);
  expect(p.rngweenLimited.pumpkoins).toBe(0);
  expect(p.owned).toContain("jack-o-glow");
  expect(rngweenWorldUnlocked(p.tasks)).toBe(true);
  await page.reload();
  await expect(page.locator("[data-pumpkoins]")).toHaveAttribute(
    "data-pumpkoins",
    "0",
  );
  await page.goto("/history");
  await expect(
    page.locator('[data-event-type="rngween-exchange"]'),
  ).toContainText("Pumpkoins");
  await expect(
    page.locator('[data-event-type="rngween-purchase"]'),
  ).toContainText("5,000 Pumpkoins");
});

test("the four-phase World keeps its own controls, saves timed unseen Valley rolls through reload and pays no ordinary EP or tasks", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await worldRandom(page);
  await seedProgress(
    page,
    keyAccount({ tasks: finished, balance: 123456, totalEarned: 123456 }),
  );
  await page.goto("/rngween-world");
  await expect(
    page.getByRole("heading", { name: "RNGween World", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-world-zone]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Predict/ })).toHaveCount(0);
  await expect(
    page.locator(".header, .mobile-tabbar, .skill-rack, .rngween-curios"),
  ).toHaveCount(0);
  const before = await saved(page);
  await page.locator('[data-world-zone="valley"]').click();
  for (let n = 1; n <= 3; n++) {
    await page.getByRole("button", { name: /Roll in the Valley/ }).click();
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    await revealWorld(page);
    await expect(
      page.getByLabel(`World number ${n}`, { exact: true }),
    ).toBeVisible();
  }
  clock.set(active + 40000);
  await page.reload();
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  await revealWorld(page);
  await expect(
    page.getByLabel("World number 4", { exact: true }),
  ).toBeVisible();
  const p = await saved(page);
  expect(p.rngweenLimited.drawn).toEqual([1, 2, 3, 4]);
  for (const key of [
    "balance",
    "totalEarned",
    "history",
    "tasks",
    "skillCharge",
    "pendingRoll",
  ])
    expect(p[key]).toEqual(before[key]);
  await page.getByRole("button", { name: "Back to Roll" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the last unseen Valley target awards permanent Hexbound, exhausts only the challenge and leaves badge hunts open", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await worldRandom(page);
  const drawn = Array.from({ length: 9999 }, (_, i) => i + 1).filter(
    (n) => n !== 6666,
  );
  await seedProgress(page, {
    tasks: finished,
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_WORLD_KEY.id],
      drawn,
      world: emptyRngweenWorld(drawn),
    },
  });
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  await revealWorld(page);
  await expect(
    page.getByLabel("World number 6666", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Valley completed/ }),
  ).toBeDisabled();
  await expect(page.locator(".world-result-copy")).toContainText(
    "Hexbound unlocked",
  );
  await page.reload();
  await expect(page.locator(".world-result-copy")).toContainText(
    "Hexbound unlocked",
  );
  const p = await saved(page);
  expect(p.owned).toContain("hexbound");
  expect(p.rngweenLimited.drawn).toHaveLength(RNGWEEN_WORLD_MAX);
  await page.locator('[data-world-zone="graveyard"]').click();
  await expect(
    page.getByRole("button", { name: /Roll in Graveyard/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Back to Roll" }).click();
  await page.goto("/shop/auras/rngween");
  await expect(
    page.locator('.shop-card[data-product="hexbound"]'),
  ).toBeVisible();
  await expect(
    page.locator('.shop-card [data-cosmetic="hexbound"] .hexbound-crown'),
  ).toHaveCount(1);
});

test("same-account tabs share one pending Valley result and serialize the next unseen pool without repeats", async ({
  page,
  context,
}) => {
  await mockSeasonClock(page, active);
  await worldRandom(page);
  await seedProgress(page, keyAccount({ tasks: finished }));
  await page.goto("/rngween-world");
  const other = await context.newPage();
  try {
    await other.clock.install();
    await mockSeasonClock(other, active);
    await worldRandom(other);
    await other.goto("/rngween-world");
    for (const tab of [page, other])
      await tab.locator('[data-world-zone="valley"]').click();
    await Promise.all([
      page.getByRole("button", { name: /Roll in the Valley/ }).click(),
      other.getByRole("button", { name: /Roll in the Valley/ }).click(),
    ]);
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    expect((await saved(page)).rngweenLimited.drawn).toEqual([]);
    await Promise.all([
      page.clock.fastForward(10100),
      other.clock.fastForward(10100),
    ]);
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.drawn.length)
      .toBe(1);
    expect((await saved(page)).rngweenLimited.drawn).toEqual([1]);
    await page.getByRole("button", { name: /Roll in the Valley/ }).click();
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    await revealWorld(page);
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.drawn.length)
      .toBe(2);
    expect((await saved(page)).rngweenLimited.drawn).toEqual([1, 2]);
  } finally {
    await other.close();
  }
});

test("a World commit storage failure reveals nothing, keeps its Valley pool and safely retries", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await worldRandom(page);
  await seedProgress(page, keyAccount({ tasks: finished }));
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();
  await expect(
    page.getByRole("button", { name: /Roll in the Valley/ }),
  ).toBeEnabled();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.restoreWorldStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new Error("full");
      return original.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect(page.locator(".world-playground .world-alert")).toContainText(
    "World result not saved",
  );
  await expect(page.getByLabel("Waiting for a World result")).toBeVisible();
  expect((await saved(page)).rngweenLimited.drawn).toEqual([]);
  expect((await saved(page)).rngweenLimited.world.pending).toBeNull();
  await page.evaluate(() => window.restoreWorldStorage());
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  await revealWorld(page);
  await expect(
    page.getByLabel("World number 1", { exact: true }),
  ).toBeVisible();
});

test("verified Nov 4 cleanup persists and a rewound device cannot reopen the limited shop/world", async ({
  page,
}) => {
  await mockSeasonClock(page, expired);
  await page.clock.setFixedTime(new Date(active));
  await seedProgress(page, {
    tasks: finished,
    pets: [RNGWEEN_PET.id],
    activePet: RNGWEEN_PET.id,
    owned: [RNGWEEN_SKILL.id, "hexbound"],
    skills: [RNGWEEN_SKILL.id],
    equippedSkills: [RNGWEEN_SIGNATURE.id, RNGWEEN_SKILL.id],
    rngweenLimited: {
      ...emptyRngweenLimited(),
      pumpkoins: 4500,
      bought: [RNGWEEN_PET.id, RNGWEEN_SKILL.id],
      drawn: [6666],
      skinEarned: true,
    },
  });
  await page.goto("/shop/limited");
  await expect(
    page.getByRole("heading", { name: "The lanterns have gone out" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.retired)
    .toBe(true);
  const p = await saved(page);
  expect(p.rngweenLimited).not.toHaveProperty("pumpkoins");
  expect(p.pets).toEqual([]);
  expect(p.equippedSkills).toEqual([]);
  expect(p.owned).toEqual(["hexbound"]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The lanterns have gone out" }),
  ).toBeVisible();
  await page.goto("/rngween-world");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/shop");
  await expect(page.locator('[data-shelf="limited"]')).toHaveCount(0);
});

test("the shop/world retire at Nov 4 UTC while an open page stays mounted", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(final));
  const website = await mockSeasonClock(page, final);
  await seedProgress(page, {
    tasks: finished,
    rngweenLimited: { ...emptyRngweenLimited(), pumpkoins: 800 },
  });
  await page.goto("/shop/limited");
  await expect(
    page.getByRole("button", { name: "Exchange EP for Pumpkoins" }),
  ).toBeVisible();
  website.set(expired);
  await page.clock.runFor(11000);
  await expect(
    page.getByRole("heading", { name: "The lanterns have gone out" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.retired)
    .toBe(true);
  expect((await saved(page)).rngweenLimited).not.toHaveProperty("pumpkoins");
});
