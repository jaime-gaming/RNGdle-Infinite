import { test, expect } from "./helpers/clock.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  walletMultiplier,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  REBIRTH_STARTER_EP,
  REBIRTH_TOTAL,
  ROLLBACK_AFTER_PRESTIGES,
  ROLLBACK_BONUS,
  ROLLBACK_STARTER_EP,
  ULTRA_BONUS_PER_REBIRTH,
  ULTRA_STARTER_EP,
  cycleStarterEp,
  rebirthBlocker,
  rebirthMultiplier,
  rebirthSurplus,
  rollbackAvailable,
  rollbackBlocker,
  rollbackMultiplier,
  rollbackRequirement,
  ultraRebirthAvailable,
  ultraRebirthBlocker,
  ultraRebirthMultiplier,
  ultraRebirthRequirement,
} from "../src/rebirth.js";
import { historyCycles, isCycleMarker } from "../src/history-log.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const ids = allBadgeMetadata.map((b) => b.id);
const auraIds = shopProducts.filter((p) => p.kind === "aura").map((p) => p.id);
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const earned = (ep, at = 150000) => [
  {
    id: `ep:${at}:${ep}`,
    type: "roll",
    at,
    number: 604827,
    tier: "godly",
    ep,
    badges: [],
  },
];
// The Rollback asks what a prestige asks: the same collection and EP. A save
// at the top of the ladder that has met the gate, with prestiges as given.
const gate = rollbackRequirement();
const top = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids.slice(0, gate.badges),
  rebirths: REBIRTH_TOTAL,
  history: earned(gate.ep),
  balance: 50000000,
  totalEarned: 50000000,
  ...extra,
});

test("the Rollback stays shut until three prestiges, then asks for more than a prestige", () => {
  expect(ROLLBACK_AFTER_PRESTIGES).toBe(3);
  // Higher than a prestige on both counts: more of the collection, more EP.
  expect(rollbackRequirement().badges).toBeGreaterThan(
    ultraRebirthRequirement().badges,
  );
  expect(rollbackRequirement().ep).toBeGreaterThan(
    ultraRebirthRequirement().ep,
  );
  // Two prestiges: still shut, and the reason counts the one left to go.
  expect(rollbackBlocker(top({ ultraRebirths: 2 }), 300000)).toMatch(
    /Reach 3 prestiges.*1 to go/,
  );
  expect(rollbackAvailable(top({ ultraRebirths: 2 }), 300000)).toBe(false);
  // Three prestiges and the whole gate open it.
  expect(rollbackBlocker(top({ ultraRebirths: 3 }), 300000)).toBe("");
  expect(rollbackAvailable(top({ ultraRebirths: 3 }), 300000)).toBe(true);
  // Short of the collection or the EP, it says what is missing.
  expect(
    rollbackBlocker(
      top({
        ultraRebirths: 3,
        discovered: ids.slice(0, gate.badges - 1),
      }),
      300000,
    ),
  ).toMatch(new RegExp(`Discover ${gate.badges} badges`));
  expect(
    rollbackBlocker(
      top({ ultraRebirths: 3, history: earned(gate.ep - 1) }),
      300000,
    ),
  ).toMatch(/Earn 60,000,000 EP this cycle to Rollback/);
  // The whole ladder comes first.
  expect(
    rollbackBlocker(
      top({ ultraRebirths: 3, rebirths: REBIRTH_TOTAL - 1 }),
      300000,
    ),
  ).toMatch(/ladder first/);
});

test("prestige closes after three, so the Rollback is the only way out", () => {
  // Two prestiges leave the third one open.
  expect(ultraRebirthAvailable(top({ ultraRebirths: 2 }), 300000)).toBe(true);
  // The third closes prestige for good, even with the whole gate met.
  const three = top({ ultraRebirths: 3 });
  expect(ultraRebirthAvailable(three, 300000)).toBe(false);
  expect(ultraRebirthBlocker(three, 300000)).toMatch(/Prestige is closed/);
  expect(rollbackAvailable(three, 300000)).toBe(true);
  // The Rollback ends the ladder: no prestige after it, and no second Rollback.
  const done = top({ ultraRebirths: 3, rollbacks: 1 });
  expect(ultraRebirthBlocker(done, 300000)).toMatch(
    /Rollback ended the ladder/,
  );
  expect(ultraRebirthAvailable(done, 300000)).toBe(false);
  expect(rollbackAvailable(done, 300000)).toBe(false);
  expect(rollbackBlocker(done, 300000)).toMatch(/is taken/);
  expect(rebirthBlocker(done, 300000)).toMatch(/Rollback ended the ladder/);
});

test("the Rollback is the biggest stage: the largest bonus and starting sum, counted once", () => {
  expect(ROLLBACK_BONUS).toBeGreaterThan(ULTRA_BONUS_PER_REBIRTH);
  expect(ROLLBACK_STARTER_EP).toBeGreaterThan(ULTRA_STARTER_EP);
  expect(ULTRA_STARTER_EP).toBeGreaterThan(REBIRTH_STARTER_EP);
  expect(rollbackMultiplier(0)).toBe(1);
  expect(rollbackMultiplier(1)).toBeCloseTo(1 + ROLLBACK_BONUS, 6);
  expect(rollbackMultiplier(2)).toBe(rollbackMultiplier(1));
  // The starting sums are cumulative: the Rollback's own sum lands once.
  expect(cycleStarterEp(REBIRTH_TOTAL, 3, 1)).toBe(
    REBIRTH_STARTER_EP * REBIRTH_TOTAL +
      ULTRA_STARTER_EP * 3 +
      ROLLBACK_STARTER_EP,
  );
  expect(cycleStarterEp(REBIRTH_TOTAL, 3, 2)).toBe(
    cycleStarterEp(REBIRTH_TOTAL, 3, 1),
  );
});

test("taking the Rollback restarts the run once, pays its sum, and is refused twice", () => {
  const ready = top({
    ultraRebirths: 3,
    owned: ["quickwind-1", "starfall"],
    equipped: "starfall",
  });
  const after = applyProgress(ready, {
    type: "rollback",
    expectedRollbacks: 0,
    at: 300000,
    eventId: "rb1",
  });
  expect(after.rollbacks).toBe(1);
  expect(after.rebirths).toBe(REBIRTH_TOTAL);
  expect(after.ultraRebirths).toBe(3);
  // The run restarts and Rollback pays its starting sum; the aura and its
  // equipped look stay while the ordinary upgrade is handed back.
  expect(after.discovered).toEqual([]);
  expect(after.owned).toEqual(["starfall"]);
  expect(after.equipped).toBe("starfall");
  expect(after.balance).toBe(cycleStarterEp(REBIRTH_TOTAL, 3, 1));
  expect(after.history.at(-1)).toMatchObject({
    id: "rb1",
    type: "rollback",
    count: 1,
    grant: cycleStarterEp(REBIRTH_TOTAL, 3, 1),
    cost: gate.ep,
  });
  // The bonus is permanent: it multiplies banked EP like every stage.
  expect(walletMultiplier(after)).toBeCloseTo(
    rebirthMultiplier(REBIRTH_TOTAL) *
      ultraRebirthMultiplier(3) *
      rollbackMultiplier(1),
    6,
  );
  // A stale tab is refused, a second Rollback is refused, and so is a prestige.
  expect(() =>
    applyProgress(ready, {
      type: "rollback",
      expectedRollbacks: 1,
      at: 300000,
    }),
  ).toThrow(/older cycle/);
  expect(() =>
    applyProgress(after, {
      type: "rollback",
      expectedRollbacks: 1,
      at: 400000,
    }),
  ).toThrow(/is taken/);
  expect(() =>
    applyProgress(after, {
      type: "ultra-rebirth",
      expectedUltraRebirths: 3,
      at: 400000,
    }),
  ).toThrow(/Rollback ended the ladder/);
  // Two prestiges are not enough to take it.
  expect(() =>
    applyProgress(top({ ultraRebirths: 2 }), {
      type: "rollback",
      expectedRollbacks: 0,
      at: 300000,
    }),
  ).toThrow(/Reach 3 prestiges/);
});

test("the Rollback's surplus pays the same dividend as a prestige's", () => {
  const extra = 5000000;
  const surplus = rebirthSurplus(gate.ep + extra, gate.ep);
  const after = applyProgress(
    top({ ultraRebirths: 3, history: earned(gate.ep + extra) }),
    { type: "rollback", expectedRollbacks: 0, at: 300000 },
  );
  expect(after.balance).toBe(
    cycleStarterEp(REBIRTH_TOTAL, 3, 1) + surplus.starterBonus,
  );
  expect(after.surplusBanked).toBe(Math.round(surplus.bankedBonus * 100));
});

test("a save carries at most one Rollback, and its history entry is read back", () => {
  const after = applyProgress(top({ ultraRebirths: 3 }), {
    type: "rollback",
    expectedRollbacks: 0,
    at: 300000,
  });
  const forged = { ...JSON.parse(JSON.stringify(after)), rollbacks: 7 };
  const parsed = parseProgress(JSON.stringify(forged));
  expect(parsed.rollbacks).toBe(1);
  expect(parsed.history.at(-1)).toMatchObject({ type: "rollback", count: 1 });
  // A save from before the Rollback existed simply has none.
  const legacy = JSON.parse(JSON.stringify(after));
  delete legacy.rollbacks;
  expect(parseProgress(JSON.stringify(legacy)).rollbacks).toBe(0);
});

test("the Rollback is a cycle marker: the timeline closes the cycle before it", () => {
  expect(isCycleMarker({ type: "rollback" })).toBe(true);
  expect(isCycleMarker({ type: "ultra-rebirth" })).toBe(true);
  const history = [
    { id: "roll:a", type: "roll", at: 1, ep: 10 },
    { id: "u:1", type: "ultra-rebirth", at: 2, count: 1 },
    { id: "roll:b", type: "roll", at: 3, ep: 10 },
    { id: "rollback:1", type: "rollback", at: 4, count: 1 },
    { id: "roll:c", type: "roll", at: 5, ep: 10 },
  ];
  const { finished, current } = historyCycles(history, []);
  expect(finished.map((cycle) => cycle.label)).toEqual([
    "Before Prestige 1",
    "Before Rollback",
  ]);
  expect(finished.map((cycle) => cycle.entries)).toEqual([1, 1]);
  expect(current.entries).toBe(1);
});

// The rebirth page, in the browser: the same save, read by the page itself.
const uiState = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids,
  balance: 50000000,
  totalEarned: 50000000,
  owned: shopProducts.map((p) => p.id),
  equipped: "prism",
  flywheelCharge: 4,
  goalId: null,
  history: earned(35000000),
  rebirths: REBIRTH_TOTAL,
  ...extra,
});

test("the Rollback button waits for three prestiges and says how many are left", async ({
  page,
}) => {
  await seedProgress(page, uiState({ ultraRebirths: 2 }));
  await page.goto("/#rebirth");
  const rollback = page
    .locator(".rebirth-page")
    .getByRole("button", { name: "Rollback", exact: true });
  await expect(rollback).toBeDisabled();
  await expect(rollback).toHaveAttribute("title", /Reach 3 prestiges/);
  await expect(page.locator(".rebirth-rollback-block")).toContainText(
    "2 of 3 prestiges done",
  );
});

test("the Rollback takes the run once, shows its ceremony and closes prestige", async ({
  page,
}) => {
  await seedProgress(
    page,
    uiState({ ultraRebirths: 3, history: earned(gate.ep) }),
  );
  await page.goto("/#rebirth");
  const rollback = page
    .locator(".rebirth-page")
    .getByRole("button", { name: "Rollback", exact: true });
  await expect(rollback).toBeEnabled();
  await rollback.click();
  await expect(page.getByRole("heading", { name: "Rollback?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Rollback" }).click();
  // The ceremony plays over the page the moment the save lands.
  await expect(page.locator(".ultra-ceremony-title")).toContainText("ROLLBACK");
  await expect.poll(async () => (await saved(page)).rollbacks).toBe(1);
  expect((await saved(page)).owned).toEqual(auraIds);
  expect((await saved(page)).equipped).toBe("prism");
  // Afterwards the page reads as finished: no prestige, no second Rollback.
  await page.goto("/#rebirth");
  await expect(page.locator(".rebirth-hero h2")).toContainText(
    "Rollback taken",
  );
  await expect(page.locator(".rebirth-legacy")).toContainText("Taken");
  await expect(
    page
      .locator(".rebirth-page")
      .getByRole("button", { name: "Prestige", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".rebirth-page")
      .getByRole("button", { name: "Rollback", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ultra-mark")).toContainText("Rollback");
});
