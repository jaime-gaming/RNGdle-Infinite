import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { pauseClockAt } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import { applyProgress, emptyProgress } from "../src/progress.js";
import {
  BADGE_TOTAL,
  REBIRTH_OPTIONAL_KINDS,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  ROLLBACK_STEP,
  ULTRA_REBIRTH_STEP,
  badgeGatePercent,
  cycleEarnedEp,
  rebirthHandedBackPurchases,
  rebirthKeepsPurchase,
  rebirthKeptPurchases,
  rebirthRelevantPurchases,
  rebirthRequirement,
  rollbackRequirement,
  ultraRebirthRequirement,
} from "../src/rebirth.js";
import {
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_VARIANT,
  BPEP_PER_LEVEL,
  battlePassSeason,
  emptyBattlePass,
  passPeriodKey,
  PASS_METRICS,
} from "../src/battle-pass.js";
import { productById, shopProducts } from "../src/shop-data.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { PETS } from "../src/pets.js";

const at = Date.UTC(2026, 10, 17, 12);
const ids = allBadgeMetadata.map((badge) => badge.id);
const auraIds = shopProducts
  .filter((product) => product.kind === "aura")
  .map((product) => product.id);

function fundedPass() {
  const pass = emptyBattlePass();
  pass.seasonId = battlePassSeason(at).id;
  pass.xp = 15 * BPEP_PER_LEVEL;
  pass.premium = true;
  pass.claimed = ["free-1", "premium-1"];
  const counts = Object.fromEntries(
    PASS_METRICS.map((metric) => [metric, 1_000_000]),
  );
  for (const cadence of ["daily", "weekly", "season"])
    pass.missions[cadence] = {
      period: passPeriodKey(cadence, at, pass.seasonId),
      counts,
      claimed: [],
      swaps: [],
      rerolls: 0,
    };
  return pass;
}

function run(extra = {}) {
  return {
    ...emptyProgress(),
    profile: { id: "audit", username: "Auditor", createdAt: 1 },
    discovered: ids,
    balance: 200_000_000,
    totalEarned: 200_000_000,
    owned: [
      "quickwind-1",
      "auto-roll",
      ...auraIds.slice(0, 3),
      "pass-signal",
      "pass-prism",
      BATTLE_PASS_VARIANT.id,
    ],
    pets: PETS.slice(0, 3).map((pet) => pet.id),
    activePet: PETS[0].id,
    skills: ["surge"],
    battlePass: fundedPass(),
    history: [
      {
        id: "ep",
        type: "roll",
        at: 1,
        number: 604827,
        tier: "godly",
        ep: 100_000_000,
        badges: [],
      },
    ],
    ...extra,
  };
}

const stages = [
  ["rebirth", () => run(), { type: "rebirth", expectedRebirths: 0, at }],
  [
    "prestige",
    () => run({ rebirths: REBIRTH_TOTAL }),
    { type: "ultra-rebirth", expectedUltraRebirths: 0, at },
  ],
  [
    "rollback",
    () => run({ rebirths: REBIRTH_TOTAL, ultraRebirths: 3 }),
    { type: "rollback", expectedRollbacks: 0, at },
  ],
  [
    "fresh start",
    () => run({ rebirths: REBIRTH_TOTAL, ultraRebirths: 3 }),
    { type: "fresh-start", at },
  ],
];

test("every reset keeps exactly what the rebirth page promises to keep", () => {
  for (const [name, make, action] of stages) {
    const before = make();
    const after = applyProgress(before, action);
    for (const id of rebirthKeptPurchases(before.owned))
      expect(after.owned, `${name} keeps ${id}`).toContain(id);
    for (const id of rebirthHandedBackPurchases(before.owned))
      expect(after.owned, `${name} hands back ${id}`).not.toContain(id);
    expect(after.owned.length, `${name} keeps nothing else`).toBe(
      rebirthKeptPurchases(before.owned).length,
    );
    expect(after.pets, `${name} clears companions`).toEqual([]);
    expect(after.activePet, `${name} unwears the companion`).toBe("none");
    expect(after.discovered, `${name} clears the collection`).toEqual([]);
  }
});

test("the pass season is never a casualty of a reset", () => {
  for (const [name, make, action] of stages) {
    const before = make();
    const after = applyProgress(before, action);
    expect(after.battlePass, `${name} leaves the pass alone`).toEqual(
      before.battlePass,
    );
    expect(after.owned, `${name} keeps the prism look`).toContain(
      BATTLE_PASS_VARIANT.id,
    );
  }
});

test("the prism axolotl is a kept cosmetic, never a handed-back purchase", () => {
  const variant = BATTLE_PASS_VARIANT.id;
  expect(productById.get(variant)).toMatchObject({
    kind: "pet-variant",
    passReward: true,
    price: 0,
  });
  expect(REBIRTH_OPTIONAL_KINDS).toContain("pet-variant");
  expect(rebirthKeepsPurchase(variant)).toBe(true);
  expect(rebirthKeptPurchases([variant])).toEqual([variant]);
  expect(rebirthHandedBackPurchases([variant])).toEqual([]);
  expect(rebirthRelevantPurchases([variant])).toEqual([]);

  // A pass look must never block a rung, and must never be priced as a loss.
  const owned = ["pass-axolotl", "pass-signal", "auto-roll", ...auraIds];
  expect(rebirthRelevantPurchases(owned)).toEqual([]);
  expect(rebirthHandedBackPurchases(owned)).toEqual(["auto-roll"]);
  for (const id of [...auraIds, "pass-signal", "pass-prism", variant])
    expect(rebirthKeepsPurchase(id), `${id} survives`).toBe(true);
  expect(rebirthKeepsPurchase("quickwind-1")).toBe(false);
  expect(rebirthKeepsPurchase("auto-roll")).toBe(false);
  expect(rebirthKeepsPurchase("not-a-product")).toBe(false);
});

test("the ladder keeps the raised gates and prints the share they really ask for", () => {
  expect(BADGE_TOTAL).toBe(242);
  const gates = REBIRTH_STEPS.map((step) =>
    Math.ceil(BADGE_TOTAL * step.badges),
  );
  expect(gates).toEqual([49, 61, 73, 85, 97, 109]);
  expect(REBIRTH_STEPS.map((step) => step.ep)).toEqual([
    250000, 600000, 1500000, 3500000, 7500000, 15000000,
  ]);
  expect(ultraRebirthRequirement()).toMatchObject({
    badges: Math.ceil(BADGE_TOTAL * ULTRA_REBIRTH_STEP.badges),
    ep: 30_000_000,
  });
  expect(ultraRebirthRequirement().badges).toBe(121);
  expect(rollbackRequirement()).toMatchObject({
    badges: Math.ceil(BADGE_TOTAL * ROLLBACK_STEP.badges),
    ep: 60_000_000,
  });
  expect(rollbackRequirement().badges).toBe(158);

  // The nominal label rounds; the printed share must not understate the gate.
  expect(badgeGatePercent(49)).toBe(20.2);
  expect(badgeGatePercent(61)).toBe(25.2);
  expect(badgeGatePercent(109)).toBe(45);
  expect(badgeGatePercent(0)).toBe(0);
  expect(badgeGatePercent(BADGE_TOTAL)).toBe(100);
  for (const [index, gate] of gates.entries()) {
    const nominal = Math.round(REBIRTH_STEPS[index].badges * 100);
    expect(badgeGatePercent(gate)).toBeGreaterThanOrEqual(nominal);
    expect(rebirthRequirement(index).badges).toBe(gate);
  }
});

test("only rolls fund a cycle gate; task and pass payouts do not", () => {
  const episode = (type, ep) => ({
    id: `${type}:${ep}`,
    type,
    at: 1000,
    number: 1337,
    tier: "common",
    ep,
    badges: [],
  });
  const base = run({ discovered: ids.slice(0, 49) });
  const paid = applyProgress(base, {
    type: "claim-pass-reward",
    level: 2,
    track: "free",
    at,
  });
  expect(paid.balance).toBeGreaterThan(base.balance);
  expect(cycleEarnedEp(paid)).toBe(cycleEarnedEp(base));
  expect(
    cycleEarnedEp({
      ...base,
      history: [episode("pass-reward", 500000), episode("task-reward", 500000)],
    }),
  ).toBe(0);
  expect(cycleEarnedEp({ ...base, history: [episode("roll", 250000)] })).toBe(
    250000,
  );
});

test("the rebirth page tells the truth about the pass and the prism look", async ({
  page,
}) => {
  await seedProgress(page, run());
  await pauseClockAt(page, new Date(at));
  await page.goto("/rebirth");
  await waitForApp(page);

  const keep = page.locator(".rebirth-preview-card.is-keep");
  await expect(keep).toContainText("1 pass look");
  await expect(keep).toContainText(`Pass level 15 / ${BATTLE_PASS_LEVELS}`);
  await expect(keep).toContainText(battlePassSeason(at).name);

  // Three shop auras, two pass auras and one pass look are all kept; only
  // the pace upgrade and the Auto-Roll tool are handed back.
  const handBack = page.locator(".rebirth-preview-card.is-reset");
  await expect(handBack).toContainText("2 purchases");
  await expect(handBack).not.toContainText("Prism Axolotl");

  const keeps = page.getByRole("region", { name: /What a rebirth keeps/ });
  await expect(keeps).toContainText("Battle Pass");
  await expect(keeps).toContainText("Pass cosmetics");

  // The round percentage is the label; the exact count sits beside it so the
  // gate is never understated.
  const ladder = page.locator(".rebirth-ladder li").first();
  await expect(ladder.locator(".rebirth-rung-percent")).toHaveText(
    "20% of the collection",
  );
  await expect(ladder.locator(".rebirth-rung-badges")).toContainText(
    "49 badges",
  );
});

test("the rebirth dialog names the pass before anything is confirmed", async ({
  page,
}) => {
  await seedProgress(page, run());
  await pauseClockAt(page, new Date(at));
  await page.goto("/rebirth");
  await waitForApp(page);
  await page
    .getByRole("region", { name: "Rebirth", exact: true })
    .getByRole("button", { name: "Rebirth", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("except auras and pass rewards");
  await expect(dialog).toContainText("your Battle Pass season");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
