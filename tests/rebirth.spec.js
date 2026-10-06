import { test, expect } from "./helpers/clock.js";
import {
  emptyProgress,
  parseProgress,
  parseAndRepairProgress,
  applyProgress,
  recoverUnsavedRolls,
  walletMultiplier,
  HISTORY_LIMIT,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  BADGE_TOTAL,
  REBIRTH_STARTER_EP,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  REBIRTH_VISIBLE_AT,
  SURPLUS_BANKED_EP_STEP,
  ULTRA_STARTER_EP,
  cycleEarnedEp,
  cycleStarterEp,
  discoveredCount,
  rebirthBlocker,
  rebirthRequirement,
  rebirthSurplus,
  surplusMultiplier,
  ultraRebirthAvailable,
  ultraRebirthBlocker,
  ultraRebirthRequirement,
} from "../src/rebirth.js";
import { cooldownFraction, parseCooldownWindow } from "../src/cooldown.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
import { rollReceipt } from "../src/gameplay-loop.js";
import { skillForPet, skillSlots } from "../src/skills.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom } from "./helpers/random-roll.js";

const ids = allBadgeMetadata.map((b) => b.id);
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const state = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids,
  balance: 50000000,
  totalEarned: 50000000,
  owned: shopProducts.map((p) => p.id),
  equipped: "prism",
  flywheelCharge: 4,
  goalId: null,
  ...extra,
});
const action = { type: "rebirth", expectedRebirths: 0, at: 200000 };
// The EP half of a rung's price is what the cycle in play has scored, read
// from the log itself. These entries build a cycle that has earned that much.
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
const funded = (extra = {}) => state({ history: earned(35000000), ...extra });
async function confirm(p) {
  await p.getByRole("button", { name: "Rebirth", exact: true }).click();
}
const scale = (p) =>
  p
    .locator(".cooldown-fill")
    .evaluate((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
async function start(p, extra = {}) {
  await seedProgress(p, extra);
  await mockRandom(p, [604827]);
  await p.clock.pauseAt(new Date(Date.now() + 1000));
  await p.goto("/");
  await p.locator(".generate").click();
  await expect.poll(async () => !!(await saved(p)).pendingRoll).toBe(true);
}

test("the ladder climbs in badges and in EP, from a fifth of the collection", () => {
  expect(BADGE_TOTAL).toBe(235);
  // The icon shows up at 15%; the first rebirth asks for 20% of the collection
  // and 250,000 EP earned in the cycle, and both halves grow from there.
  expect(REBIRTH_VISIBLE_AT).toBe(36);
  expect(REBIRTH_STEPS).toEqual([
    { badges: 0.2, ep: 250000 },
    { badges: 0.25, ep: 600000 },
    { badges: 0.3, ep: 1500000 },
    { badges: 0.35, ep: 3500000 },
    { badges: 0.4, ep: 7500000 },
    { badges: 0.45, ep: 15000000 },
  ]);
  expect(REBIRTH_TOTAL).toBe(6);
  expect(rebirthRequirement(0)).toEqual({
    rebirth: 1,
    percent: 20,
    badges: 47,
    ep: 250000,
  });
  expect(rebirthRequirement(1)).toEqual({
    rebirth: 2,
    percent: 25,
    badges: 59,
    ep: 600000,
  });
  expect(rebirthRequirement(2).badges).toBe(71);
  expect(rebirthRequirement(3).badges).toBe(83);
  expect(rebirthRequirement(4).badges).toBe(94);
  expect(rebirthRequirement(5)).toEqual({
    rebirth: 6,
    percent: 45,
    badges: 106,
    ep: 15000000,
  });
  expect(rebirthRequirement(6)).toBeNull();
  // The ultra-rebirth closes the ladder at half the collection — asking for
  // all 235 badges asked for a collection nobody could finish.
  expect(ultraRebirthRequirement()).toEqual({
    percent: 50,
    badges: 118,
    ep: 30000000,
  });
  // Fewer badges than the old ladder asked for at every single rung.
  for (let step = 1; step < REBIRTH_TOTAL; step++) {
    expect(rebirthRequirement(step).badges).toBeGreaterThan(
      rebirthRequirement(step - 1).badges,
    );
    expect(rebirthRequirement(step).ep).toBeGreaterThan(
      rebirthRequirement(step - 1).ep,
    );
  }
  // Only unique, real badges count.
  expect(
    discoveredCount({ ...state(), discovered: Array(235).fill(ids[0]) }),
  ).toBe(1);
  // Below the current rung the panel says exactly how many are left.
  const below = { ...funded(), discovered: ids.slice(0, 46) };
  expect(rebirthBlocker(below, 200000)).toMatch(/Discover 47 badges \(20%\)/);
  expect(() => applyProgress(below, action)).toThrow(/Discover/);
  // Badges met but the cycle has not earned enough: the EP is the missing
  // half, and it says how much is left.
  const short = {
    ...state(),
    discovered: ids.slice(0, 47),
    history: earned(40000),
  };
  expect(cycleEarnedEp(short)).toBe(40000);
  expect(rebirthBlocker(short, 200000)).toMatch(
    /Earn 250,000 EP this cycle to rebirth\. 210,000 to go\./,
  );
  expect(() => applyProgress(short, action)).toThrow(/Earn 250,000 EP/);
  // The EP is a mark of progress, not a spend: it is never taken from the
  // wallet, and buying things with it cannot lock the ladder.
  const met = {
    ...state(),
    discovered: ids.slice(0, 47),
    history: earned(250000),
    balance: 0,
  };
  expect(rebirthBlocker(met, 200000)).toBe("");
  const paid = applyProgress(met, action);
  expect(paid.rebirths).toBe(1);
  expect(paid.history.at(-1)).toMatchObject({ cost: 250000 });
  // A committed roll, an offline batch or a running cooldown still blocks it.
  expect(() =>
    applyProgress({ ...funded(), pendingRoll: { id: "pending" } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...funded(), offline: { batch: { id: "batch" } } }, action),
  ).toThrow("committed");
  expect(() =>
    applyProgress({ ...funded(), cooldownUntil: 200001 }, action),
  ).toThrow("cooldown");
  expect(() =>
    applyProgress(
      { ...funded(), rebirths: 1, discovered: ids.slice(0, 58) },
      {
        ...action,
        expectedRebirths: 1,
      },
    ),
  ).toThrow(/Discover 59 badges \(25%\)/);
  expect(() =>
    applyProgress(
      { ...state(), rebirths: 1, discovered: ids.slice(0, 59) },
      {
        ...action,
        expectedRebirths: 1,
      },
    ),
  ).toThrow(/Earn 600,000 EP/);
  expect(rebirthBlocker(funded(), 200000)).toBe("");
  expect(() => applyProgress({ ...funded(), rebirths: 1 }, action)).toThrow(
    "older cycle",
  );
});

test("cycle EP survives history pruning and historical tiers follow the scoring table", () => {
  const result = evaluate(604827);
  const online = applyProgress(state(), {
    type: "complete",
    id: "online-cycle-roll",
    at: 1,
    cooldownUntil: 0,
    result,
  });
  expect(online.cycleEarnedEP).toBe(result.totalEP);
  const offline = applyProgress(state(), {
    type: "complete",
    id: "offline-cycle-roll",
    source: "offline",
    at: 1,
    cooldownUntil: 0,
    result,
  });
  expect(offline.cycleEarnedEP).toBe(result.totalEP);

  const history = Array.from({ length: HISTORY_LIMIT }, (_, index) => ({
    id: `cycle-roll-${index}`,
    type: "roll",
    at: index,
    number: 1,
    tier: "trash",
    ep: 1,
    badges: [],
  }));
  const progress = {
    ...state(),
    history,
    cycleEarnedEP: 7000000,
  };
  expect(cycleEarnedEp(progress)).toBe(7000000);
  expect(parseProgress(JSON.stringify(progress)).cycleEarnedEP).toBe(7000000);

  const legacy = { ...progress };
  delete legacy.cycleEarnedEP;
  expect(parseProgress(JSON.stringify(legacy)).cycleEarnedEP).toBe(
    HISTORY_LIMIT,
  );

  const tiers = parseProgress(
    JSON.stringify({
      ...emptyProgress(),
      history: [
        {
          id: "stale-high-tier",
          type: "roll",
          at: 1,
          number: 1,
          tier: "common",
          ep: 500000,
          badges: [],
        },
        {
          id: "stale-low-tier",
          type: "roll",
          at: 2,
          number: 1,
          tier: "godly",
          ep: 1,
          badges: [],
        },
      ],
    }),
  );
  expect(tiers.history.map((event) => event.tier)).toEqual(["godly", "trash"]);
});

test("rebirth restarts the run — purchases, companions and wallet — and keeps the account's history, rebirths and bonuses", () => {
  const old = applyProgress(
    { ...state(), discovered: [] },
    {
      type: "complete",
      id: "old",
      at: 1000,
      cooldownUntil: 106000,
      result: evaluate(604827),
    },
  );
  // 604827 is a poor roll, and a rung asks for 250,000 EP earned in the cycle:
  // this account's one roll is worth more than that, so the log keeps its
  // shape — under 500,000 EP it keeps its tier too — and pays for the rung.
  const banked = {
    ...old,
    history: old.history.map((event) =>
      event.type === "roll" ? { ...event, ep: 350000, tier: "mythic" } : event,
    ),
  };
  const before = {
    ...banked,
    owned: ["quickwind-1", "starfall", "flywheel", "surge", "skill-bay-1"],
    discovered: ids,
    pets: ["pebble"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    skillCharge: { surge: 4 },
    receipts: ["old"],
  };
  const next = applyProgress(before, action);
  expect(next).toMatchObject({
    // Kept: the account's story, the ladder and everything it earned.
    profile: testProfile,
    rebirths: 1,
    receipts: ["old"],
    // Reset: the run itself — the collection, the shelf, the companions and
    // the wallet. The worn aura comes off with the shelf it came from, and the
    // wallet restarts at the sum rung one pays plus the surplus: the cycle
    // scored 350,000 against a 250,000 gate, and a quarter of that overshoot
    // joins the new wallet.
    balance: REBIRTH_STARTER_EP + 25000,
    totalEarned: before.totalEarned + REBIRTH_STARTER_EP + 25000,
    cycleEarnedEP: 0,
    owned: [],
    equipped: "none",
    discovered: [],
    pets: [],
    activePet: "none",
    flywheelCharge: 0,
    goalId: null,
    pendingRoll: null,
    cooldownUntil: 0,
    cooldownWindow: null,
    offline: null,
    skillCharge: {},
  });
  // A shop skill is a purchase, so it goes back on the stall; the ladder skill
  // is earned by the rebirth and rides free beside the rack's slots.
  expect(next.skills).toEqual(["reborn-drive"]);
  expect(next.equippedSkills).toEqual(["reborn-drive"]);
  // The activity history belongs to the account, not to the cycle: the roll
  // from the previous cycle is still there, and the rebirth joins its end.
  expect(next.history.map((e) => e.type)).toEqual([
    "roll",
    "unlock",
    "rebirth",
  ]);
  expect(next.history.at(-1)).toMatchObject({
    type: "rebirth",
    count: 1,
    skill: "reborn-drive",
    grant: REBIRTH_STARTER_EP + 25000,
  });
  // The overshoot was 100,000 EP — under one 5M block, so it banks no
  // permanent dividend, only its share of the starting sum.
  expect(next.surplusBanked).toBe(0);
  expect(parseProgress(JSON.stringify(next))).toEqual(next);
  expect(recoverUnsavedRolls(next, before)).toBe(next);
  expect(rollReceipt(next)).toBeNull();
  // The cycle's committed roll is gone, so there is nothing left to settle —
  // but its receipt is remembered, so it can never be settled twice.
  expect(next.pendingRoll).toBeNull();
  expect(next.history.some((e) => e.id === "old")).toBe(true);
  // And a new cycle rolls normally.
  const repeated = applyProgress(next, {
    type: "complete",
    id: "new-cycle",
    at: 300000,
    cooldownUntil: 405000,
    result: evaluate(604827),
  });
  expect(repeated.discovered).toHaveLength(evaluate(604827).badges.length);
  expect(repeated.history.at(-1).type).toBe("unlock");
});

test("every rung of the ladder grants its own skill, and the last one opens the ultra-rebirth", () => {
  let progress = {
    ...funded(),
    pets: ["moth"],
    activePet: "moth",
    skills: ["surge", "trail"],
    equippedSkills: ["surge", "trail"],
    owned: [...shopProducts.map((p) => p.id)],
  };
  const granted = [];
  let banked = 0;
  for (let step = 0; step < REBIRTH_TOTAL; step++) {
    const requirement = rebirthRequirement(step);
    expect(requirement.percent).toBe(20 + step * 5);
    expect(discoveredCount(progress)).toBeGreaterThanOrEqual(
      requirement.badges,
    );
    // A new cycle has earned nothing yet, so every rung has to be paid for
    // again: the EP the cycle scored is part of the ladder's price.
    expect(cycleEarnedEp(progress)).toBeGreaterThanOrEqual(requirement.ep);
    const overshoot = rebirthSurplus(cycleEarnedEp(progress), requirement.ep);
    const next = applyProgress(progress, {
      type: "rebirth",
      expectedRebirths: step,
      at: 200000 + step,
      eventId: `r${step + 1}`,
    });
    expect(next.rebirths).toBe(step + 1);
    // Every rebirth joins the account's history instead of replacing it — one
    // entry for the roll that paid for it, one for the rebirth itself.
    expect(next.history).toHaveLength(2 * (step + 1));
    expect(next.history.at(-1)).toMatchObject({
      type: "rebirth",
      count: step + 1,
      cost: requirement.ep,
    });
    // The next rung asks for more badges and more EP, and the collection is
    // empty again: rediscovery is the work, everything else is kept.
    const following = rebirthRequirement(next.rebirths);
    if (following) {
      // Five points more is 11 or 12 badges, depending on the rounding.
      expect(following.badges).toBeGreaterThan(requirement.badges);
      expect(following.badges).toBeLessThanOrEqual(requirement.badges + 12);
      expect(following.percent).toBe(requirement.percent + 5);
      expect(following.ep).toBeGreaterThan(requirement.ep);
    }
    expect(discoveredCount(next)).toBe(0);
    // The shelf, the companions and the wallet go back with the collection:
    // what refills the wallet is the starting sum of the rung just climbed.
    expect(next.owned).toEqual([]);
    expect(next.pets).toEqual([]);
    // The cycle was seeded far past every gate, so the wallet refills with
    // the rung's sum plus a quarter of the overshoot, and whole 5M blocks of
    // that overshoot have banked a permanent +1% each.
    expect(overshoot.surplus).toBeGreaterThan(0);
    expect(next.balance).toBe(
      REBIRTH_STARTER_EP * (step + 1) + overshoot.starterBonus,
    );
    banked += Math.round(overshoot.bankedBonus * 100);
    expect(next.surplusBanked).toBe(banked);
    if (next.history.at(-1).skill) granted.push(next.history.at(-1).skill);
    progress = {
      ...next,
      discovered: ids,
      history: [...next.history, ...earned(35000000, 160000 + step)],
    };
  }
  expect(granted).toHaveLength(REBIRTH_TOTAL);
  expect(new Set(granted).size).toBe(REBIRTH_TOTAL);
  for (const id of granted) expect(progress.skills).toContain(id);
  // Every cycle hands the shop back, so the rack is back to its base two
  // slots — and every rung's skill rides free beside them, equipped and
  // charging, with the slots left open for shop skills.
  expect(progress.owned).toEqual([]);
  expect(skillSlots(progress.owned)).toBe(2);
  expect(progress.equippedSkills).toHaveLength(REBIRTH_TOTAL);
  for (const id of granted) expect(progress.equippedSkills).toContain(id);
  expect(progress.skills).toHaveLength(REBIRTH_TOTAL);
  // The ladder is complete: rebirth is finished, the ultra-rebirth is next.
  expect(rebirthRequirement(REBIRTH_TOTAL)).toBeNull();
  expect(
    rebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toMatch(/ladder is complete/);
  expect(
    ultraRebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toBe("");
  // An ultra-rebirth also wants the cycle's EP; half the collection alone is
  // not enough any more.
  const top = { ...progress, rebirths: REBIRTH_TOTAL };
  expect(
    ultraRebirthBlocker({ ...top, history: earned(29999999, 170000) }, 300000),
  ).toMatch(/Earn 30,000,000 EP this cycle/);
  expect(
    ultraRebirthAvailable(
      { ...top, history: earned(29999999, 170000) },
      300000,
    ),
  ).toBe(false);
  expect(
    ultraRebirthAvailable(
      { ...top, history: earned(30000000, 170000) },
      300000,
    ),
  ).toBe(true);
  expect(
    ultraRebirthAvailable({ ...progress, rebirths: REBIRTH_TOTAL }, 300000),
  ).toBe(true);
  // Two steps short, the ultra-rebirth is not even offered.
  expect(
    ultraRebirthBlocker({ ...progress, rebirths: REBIRTH_TOTAL - 2 }, 300000),
  ).toMatch(/ladder first/);
});

test("every cycle starts with the EP its rungs and ultra-rebirths paid", () => {
  expect(REBIRTH_STARTER_EP).toBe(250000);
  expect(ULTRA_STARTER_EP).toBe(1000000);
  // One rung, one share; the ladder tops out at six, and an ultra-rebirth adds
  // its own larger share on top of the rungs the account keeps.
  expect(cycleStarterEp(0, 0)).toBe(0);
  expect(cycleStarterEp(1, 0)).toBe(250000);
  expect(cycleStarterEp(REBIRTH_TOTAL, 0)).toBe(1500000);
  expect(cycleStarterEp(REBIRTH_TOTAL, 2)).toBe(3500000);
  let progress = {
    ...funded(),
    pets: [],
    skills: [],
    equippedSkills: [],
  };
  let banked = 0;
  for (let step = 0; step < REBIRTH_TOTAL; step++) {
    const overshoot = rebirthSurplus(
      cycleEarnedEp(progress),
      REBIRTH_STEPS[step].ep,
    );
    const next = applyProgress(progress, {
      type: "rebirth",
      expectedRebirths: step,
      at: 200000 + step,
      eventId: `g${step + 1}`,
    });
    // The wallet restarts on the starting sum plus the surplus dividend of
    // the 20M-EP cycle, never empty and never richer than what the account
    // has actually been given.
    expect(next.balance).toBe(
      cycleStarterEp(step + 1, 0) + overshoot.starterBonus,
    );
    expect(next.balance).toBeLessThanOrEqual(next.totalEarned);
    expect(next.history.at(-1).grant).toBe(
      cycleStarterEp(step + 1, 0) + overshoot.starterBonus,
    );
    expect(parseProgress(JSON.stringify(next)).balance).toBe(next.balance);
    banked += Math.round(overshoot.bankedBonus * 100);
    expect(next.surplusBanked).toBe(banked);
    // The next cycle has earned nothing yet, so it has to pay its own way.
    progress = {
      ...next,
      discovered: ids,
      history: [...next.history, ...earned(35000000, 160000 + step)],
    };
  }
  // An ultra at the top pays the ladder's sum and its own — plus the surplus
  // of the 35M cycle arriving five million over the ultra's 30M gate.
  const ultra = applyProgress(progress, {
    type: "ultra-rebirth",
    expectedUltraRebirths: 0,
    at: 300000,
    eventId: "u1",
  });
  expect(ultra.rebirths).toBe(REBIRTH_TOTAL);
  expect(ultra.ultraRebirths).toBe(1);
  expect(ultra.balance).toBe(cycleStarterEp(REBIRTH_TOTAL, 1) + 1250000);
  expect(ultra.balance).toBeLessThanOrEqual(ultra.totalEarned);
  expect(ultra.surplusBanked).toBe(banked + 1);
  expect(parseProgress(JSON.stringify(ultra)).history.at(-1).grant).toBe(
    cycleStarterEp(REBIRTH_TOTAL, 1) + 1250000,
  );
});

test("overshooting the gate pays a surplus: starting EP now, a banked dividend forever", () => {
  // The exact case asked for: the rung wants 100,000 and the cycle brings
  // 1,000,000 — a quarter of the 900,000 overshoot joins the new wallet.
  const example = rebirthSurplus(1000000, 100000);
  expect(example.surplus).toBe(900000);
  expect(example.starterBonus).toBe(225000);
  expect(example.bankedBonus).toBe(0); // whole 5M blocks only
  // Twenty million over a 100,000 gate: three whole blocks of 5M bank +3%.
  const big = rebirthSurplus(20000000, 100000);
  expect(big.starterBonus).toBe(4975000);
  expect(big.bankedBonus).toBe(0.03);
  // A single rebirth never banks more than +5%, however huge the cycle.
  expect(rebirthSurplus(100000000, 100000).bankedBonus).toBe(0.05);
  // Meeting the gate exactly, or never reaching it, pays nothing extra.
  const none = { surplus: 0, starterBonus: 0, bankedBonus: 0 };
  expect(rebirthSurplus(100000, 100000)).toEqual(none);
  expect(rebirthSurplus(0, 100000)).toEqual(none);
  // The dividend composes with the rung and ultra bonuses in the wallet.
  expect(surplusMultiplier(0)).toBe(1);
  expect(surplusMultiplier(17)).toBeCloseTo(1.17, 6);
  const reborn = applyProgress(state({ history: earned(20150000) }), action);
  expect(reborn.surplusBanked).toBe(3);
  expect(reborn.balance).toBe(REBIRTH_STARTER_EP + 4975000);
  expect(walletMultiplier(reborn, [])).toBeCloseTo(1.02 * 1.03, 6);
  // The surplus is written into the log through the grant it produced, and a
  // reload keeps both the wallet and the banked dividend intact.
  expect(reborn.history.at(-1)).toMatchObject({
    type: "rebirth",
    cost: 250000,
    grant: REBIRTH_STARTER_EP + 4975000,
  });
  expect(parseProgress(JSON.stringify(reborn))).toEqual(reborn);
  expect(SURPLUS_BANKED_EP_STEP).toBe(5000000);
});

test("old saves default to zero rebirths and ultra-rebirths, and optional bar snapshots cannot shorten a deadline", () => {
  const legacy = { ...emptyProgress() };
  delete legacy.rebirths;
  delete legacy.ultraRebirths;
  delete legacy.skills;
  delete legacy.equippedSkills;
  delete legacy.skillCharge;
  delete legacy.cooldownWindow;
  const parsed = parseProgress(JSON.stringify(legacy));
  expect(parsed.rebirths).toBe(0);
  expect(parsed.ultraRebirths).toBe(0);
  expect(parsed.surplusBanked).toBe(0);
  expect(parsed.skills).toEqual([]);
  expect(parsed.equippedSkills).toEqual([]);
  expect(parsed.skillCharge).toEqual({});
  // Unreadable counters are repaired in place instead of bricking the save.
  for (const [field, cases] of [
    [
      "rebirths",
      [
        [-1, 0],
        [0.5, 0],
        ["1", 0],
        [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER],
      ],
    ],
    [
      "ultraRebirths",
      [
        [-1, 0],
        [0.5, 0],
        ["1", 0],
      ],
    ],
    [
      "surplusBanked",
      [
        [-1, 0],
        [0.5, 0],
        ["1", 0],
        [101, 100],
      ],
    ],
  ])
    for (const [stored, expected] of cases) {
      const { progress, repairs } = parseAndRepairProgress(
        JSON.stringify({ ...legacy, [field]: stored }),
      );
      expect(progress[field]).toBe(expected);
      expect(repairs.length).toBeGreaterThan(0);
    }
  expect(
    parseCooldownWindow({ startsAt: 45000, endsAt: 105000 }, 105000, null),
  ).toEqual({ startsAt: 45000, endsAt: 105000 });
  for (const window of [
    { startsAt: 0, endsAt: 105000 },
    { startsAt: -1, endsAt: 59999 },
    { startsAt: 45000, endsAt: 100000 },
    { startsAt: 60000, endsAt: 45000 },
  ])
    expect(parseCooldownWindow(window, 105000, null)).toBeNull();
  const p = parseProgress(
    JSON.stringify({
      ...legacy,
      cooldownUntil: 999999,
      cooldownWindow: { startsAt: 0, endsAt: 0 },
    }),
  );
  expect(p.cooldownUntil).toBe(999999);
  expect(p.cooldownWindow).toBeNull();
});

test("bar maths starts at zero after the reveal, reaches one only at readiness, and handles Flywheel", () => {
  const window = { startsAt: 45000, endsAt: 105000 };
  expect(cooldownFraction(window, 0)).toBe(0);
  expect(cooldownFraction(window, 45000)).toBe(0);
  expect(cooldownFraction(window, 75000)).toBe(0.5);
  expect(cooldownFraction(window, 105000)).toBe(1);
  expect(cooldownFraction(window, 200000)).toBe(1);
  expect(cooldownFraction({ startsAt: 15000, endsAt: 15000 }, 16000)).toBe(0);
  expect(cooldownFraction({ startsAt: 15000, endsAt: 30000 }, 22500)).toBe(0.5);
});

for (const [count, rebirths, ep, expected] of [
  [35, 0, 0, "hidden"],
  [36, 0, 0, "disabled"],
  [46, 0, 250000, "disabled"],
  [47, 0, 250000, "ready"],
  [58, 1, 600000, "disabled"],
  [59, 1, 600000, "ready"],
])
  test(`rebirth at ${count} of 235 badges, ${ep} EP and ${rebirths} rebirths reads "${expected}" on its own page`, async ({
    page,
  }) => {
    await seedProgress(page, {
      discovered: ids.slice(0, count),
      rebirths,
      history: ep ? earned(ep) : [],
      cycleEarnedEP: ep,
    });
    // Rebirth is its own page now; the state is driven by the save alone.
    await page.goto("/#rebirth");
    const button = page.getByRole("button", { name: "Rebirth", exact: true });
    if (expected === "hidden") {
      // Rebirth says nothing at all before it unlocks: no ladder, no locked
      // panel, and the direct link quietly returns to the roll page.
      await expect(button).toHaveCount(0);
      await expect(page.locator(".rebirth-page, .rebirth-ladder")).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("heading", { name: "Rebirth", level: 1 }),
      ).toHaveCount(0);
      await expect(page).toHaveURL(/\/(roll)?$/);
      return;
    }
    if (expected === "ready") {
      await expect(button).toBeEnabled();
    } else {
      await expect(button).toBeDisabled();
    }
    await expect(
      page.getByRole("heading", { name: "Rebirth", level: 1 }),
    ).toBeVisible();
  });

test("rebirth confirms in its dialog, applies once, and restarts the run without touching the history", async ({
  page,
}) => {
  const initial = applyProgress(
    { ...state(), discovered: [] },
    {
      type: "complete",
      id: "historic",
      at: 1000,
      cooldownUntil: 0,
      result: evaluate(604827),
    },
  );
  initial.discovered = ids;
  // 604827 barely scores, and the rung asks for 250,000 EP earned in this
  // cycle, so the seed carries a cycle that has already earned it.
  initial.history = [...initial.history, ...earned(350000, 2000)];
  // The cycle sits over the 250,000 gate, so a quarter of the overshoot
  // joins the starting sum when the rebirth lands.
  const carry = rebirthSurplus(cycleEarnedEp(initial), 250000).starterBonus;
  expect(carry).toBeGreaterThan(0);
  await seedProgress(page, initial);
  await mockRandom(page, [604827]);
  await page.goto("/#rebirth");
  await page.getByRole("button", { name: "Rebirth", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Keep:");
  await expect(dialog).toContainText("EP");
  // No typing: the dialog is the confirmation — read it, confirm or cancel.
  await expect(
    page.getByRole("button", { name: "Confirm rebirth", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await saved(page)).rebirths).toBe(0);
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  // A rainbow ring spins over the new cycle, then leaves by itself.
  await expect(page.locator(".rebirth-ring")).toBeVisible();
  await expect(page.locator(".rebirth-ring-title")).toContainText("REBIRTH 1");
  await expect(page.locator(".rebirth-ring")).toBeHidden({ timeout: 8000 });
  const after = await saved(page);
  // The run starts over: the wallet and everything it bought are handed back,
  // and rung one refills the wallet with its starting sum plus the surplus.
  expect(after.balance).toBe(REBIRTH_STARTER_EP + carry);
  expect(after.owned).toEqual([]);
  expect(after.equipped).toBe("none");
  expect(after.discovered).toEqual([]);
  // The account keeps its history: the roll from the previous cycle is still
  // readable, with the rebirth recorded after it.
  expect(after.history.filter((e) => e.type === "roll")).toHaveLength(2);
  expect(after.history.filter((e) => e.type === "rebirth")).toHaveLength(1);
  await nav(page, "History");
  await expect(page.locator('[data-event-type="rebirth"]')).toContainText(
    "Rebirth 1",
  );
  await page.goto("/#rebirth");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeDisabled();
  await nav(page, "Badges");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await mockRandom(page, [604827]);
  await page.reload();
  expect((await saved(page)).rebirths).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "RNGdle Infinite home" }).click();
  await page.locator(".generate").click();
  // The new cycle banks into the sum the rung paid (plus the surplus),
  // already earning the +2% the rebirth just granted.
  await expect
    .poll(async () => (await saved(page)).balance)
    .toBe(
      REBIRTH_STARTER_EP + carry + Math.round(evaluate(604827).totalEP * 1.02),
    );
  expect((await saved(page)).discovered).toHaveLength(
    evaluate(604827).badges.length,
  );
});

test("a failed rebirth save leaves all progress intact and allows retry", async ({
  page,
}) => {
  await seedProgress(page, funded());
  await page.goto("/#rebirth");
  await expect
    .poll(async () => (await saved(page)).offline?.lastSeenAt)
    .toBeTruthy();
  const before = await saved(page);
  await page.evaluate((k) => {
    const write = Storage.prototype.setItem;
    window.failRebirth = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === k && window.failRebirth && JSON.parse(value).rebirths > 0)
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }, PROGRESS_KEY);
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "progress has not been reset",
  );
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() => {
    window.failRebirth = false;
  });
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
});

test("simultaneous rebirths are applied once and reset the other tab without deleting the profile", async ({
  page,
  context,
}) => {
  await seedProgress(page, funded());
  await page.goto("/#rebirth");
  const other = await context.newPage();
  await other.goto("/#rebirth");
  await confirm(page);
  await confirm(other);
  await Promise.all([
    page
      .getByRole("button", { name: "Confirm rebirth", exact: true })
      .evaluate((b) => b.click()),
    other
      .getByRole("button", { name: "Confirm rebirth", exact: true })
      .evaluate((b) => b.click()),
  ]);
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  await expect(other.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).profile).toEqual(testProfile);
  expect(
    (await saved(page)).history.filter((e) => e.type === "rebirth"),
  ).toHaveLength(1);
  await other.close();
});

test("a tab missing the rebirth storage event cannot spend or restore old-cycle progress", async ({
  page,
  context,
}) => {
  await seedProgress(page, funded());
  await page.goto("/#rebirth");
  const other = await context.newPage();
  await other.addInitScript(() =>
    window.addEventListener(
      "storage",
      (e) => e.stopImmediatePropagation(),
      true,
    ),
  );
  // The stale tab sits inside the celestial set before the rebirth happens:
  // it must never reload afterwards, or it would stop being stale.
  await other.goto("/shop/auras/celestial");
  await other
    .getByRole("button", { name: "Use original appearance", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).equipped).toBe("none");
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).rebirths).toBe(1);
  await other
    .locator('[data-product="starfall"] button:not(.shop-tag)')
    .click();
  await expect(other.locator(".toast")).toContainText("changed");
  // The stale tab neither spent EP nor revived an old purchase: the rebirth
  // handed the shelf back, so nothing was sold and the wallet holds only the
  // sum the new cycle started with — the rung's share plus the surplus of
  // funded()'s 20M-EP cycle over the 100k gate.
  const after = await saved(page);
  expect(after.owned).toEqual([]);
  expect(after.balance).toBe(REBIRTH_STARTER_EP + 8687500);
  expect(after.surplusBanked).toBe(5);
  expect(after.rebirths).toBe(1);
  await other.close();
});

test("rebirth waits for cooldown and remains usable on mobile without motion", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const now = await page.evaluate(() => Date.now());
  await seedProgress(page, {
    ...funded(),
    cooldownUntil: now + 10000,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#rebirth");
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeEnabled();
  await confirm(page);
  // The dialog and the page behind it fit the smallest phone: no sideways
  // scroll while the confirmation is on screen.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).rebirths).toBe(0);
});

test("the moving bar uses the cooldown only, is smooth between seconds, survives reload and mid-cooldown upgrades", async ({
  page,
}) => {
  await start(page, { balance: 1000000, totalEarned: 1000000 });
  const pending = (await saved(page)).pendingRoll;
  await page.clock.fastForward(45100);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  expect(await scale(page)).toBeLessThan(0.02);
  await page.clock.fastForward(29800);
  await page.clock.runFor(100);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  const fraction = await scale(page);
  await page.clock.runFor(300);
  expect(await scale(page)).toBeGreaterThan(fraction);
  // Clockwork is a pace tier: the shop's Pace shelf sells it.
  await nav(page, "Shop");
  await page.getByRole("link", { name: "Pace", exact: true }).click();
  await page
    .locator('[data-product="clockwork-1"] button:not(.shop-tag)')
    .click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).cooldownWindow).toEqual({
    startsAt: pending.startedAt + 45000,
    endsAt: pending.startedAt + 105000,
  });
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await page.clock.runFor(300);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  await expect(page.locator(".generate")).toBeDisabled();
  await page.clock.fastForward(30000);
  await expect(page.locator(".generate")).toBeEnabled();
});

test("reduced motion does not advance the bar before reveal time, and Flywheel has no fake cooldown bar", async ({
  page,
}) => {
  await start(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  expect(await scale(page)).toBe(0);
  await page.clock.fastForward(44000);
  expect(await scale(page)).toBe(0);
  await page.clock.fastForward(31000);
  expect(await scale(page)).toBeCloseTo(0.5, 1);
  await expect(page.locator(".generate")).toBeDisabled();
});

test("a committed zero-cooldown Flywheel reveal never shows a moving cooldown bar", async ({
  page,
}) => {
  await start(page, { owned: ["flywheel"], flywheelCharge: 4 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect(page.locator(".cooldown-fill")).toHaveCount(0);
  await expect(page.locator(".generate")).toBeDisabled();
  await page.clock.fastForward(45100);
  await expect(page.locator(".generate")).toBeEnabled();
});

test("a new cycle buys the shelf again and is credited at the catalogue price", () => {
  const first = applyProgress(
    { ...emptyProgress(), balance: 100000, totalEarned: 100000 },
    { type: "buy", id: "starfall", at: 1000 },
  );
  const reborn = applyProgress(
    {
      ...first,
      discovered: ids,
      balance: 100000,
      history: [...first.history, ...earned(250000)],
    },
    action,
  );
  // The aura went back on the shelf, and the wallet restarts on the sum rung
  // one pays — but the purchase stays in the account's history, and the
  // rebirth joins it there.
  expect(reborn.owned).toEqual([]);
  expect(reborn.balance).toBe(REBIRTH_STARTER_EP);
  expect(reborn.totalEarned).toBe(100000 + REBIRTH_STARTER_EP);
  // The roll that paid for the rung is part of the log, so the rebirth still
  // lands after everything the cycle did.
  expect(reborn.history.map((e) => e.type)).toEqual([
    "purchase",
    "roll",
    "rebirth",
  ]);
  // So buying it back in the new cycle is a real sale, at the catalogue price.
  const second = applyProgress(
    { ...reborn, balance: 5000000, totalEarned: 5000000 },
    { type: "buy", id: "starfall", at: 300000 },
  );
  expect(second.owned).toEqual(["starfall"]);
  const purchases = parseProgress(JSON.stringify(second)).history.filter(
    (e) => e.type === "purchase",
  );
  expect(purchases).toHaveLength(2);
  expect(purchases.at(-1)).toMatchObject({
    productId: "starfall",
    ep: shopProducts.find((p) => p.id === "starfall").price,
  });
});

test("a rebirth hands the companions back and their signature skills go with them", () => {
  const signature = skillForPet("pebble").id;
  const next = applyProgress(
    {
      ...state(),
      pets: ["pebble"],
      activePet: "pebble",
      equippedSkills: [signature],
      history: earned(250000),
    },
    action,
  );
  expect(next.pets).toEqual([]);
  expect(next.activePet).toBe("none");
  // No companion, no signature skill: the ladder skill owns the rack instead.
  expect(next.skills).toEqual(["reborn-drive"]);
  expect(next.equippedSkills).toEqual(["reborn-drive"]);
  expect(parseProgress(JSON.stringify(next)).activePet).toBe("none");
});

test("registered rebirth fails closed without Web Locks", async ({ page }) => {
  await seedProgress(page, { ...funded(), owned: [] });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/#rebirth");
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Web Locks");
  expect((await saved(page)).rebirths).toBe(0);
  expect((await saved(page)).discovered).toHaveLength(235);
});

test("guest rebirth refuses a failed guard write instead of partially resetting memory", async ({
  page,
}) => {
  await seedProgress(page, { ...funded(), profile: null, owned: [] });
  await page.goto("/#rebirth");
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.failGuard = true;
    Storage.prototype.setItem = function (k, v) {
      if (this === sessionStorage && window.failGuard)
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  });
  await confirm(page);
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "progress has not been reset",
  );
  // The ladder still points at rung one: nothing was reset in memory.
  await expect(
    page.locator(".rebirth-ladder li.is-current .rebirth-rung-name"),
  ).toHaveText("#1");
  await page.evaluate(() => {
    window.failGuard = false;
  });
  await page
    .getByRole("button", { name: "Confirm rebirth", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".roll-progress-links")).toContainText(
    "0 / 235 badges",
  );
  await expect(page.locator(".roll-progress-links")).toContainText("1 rebirth");
});

test("an ultra-rebirth runs the ceremony, wears the prestige mark and reads the developer's note", async ({
  page,
}) => {
  // A finished ladder with a 20M-EP cycle — over the ultra's 15M gate.
  await seedProgress(page, { ...funded(), rebirths: REBIRTH_TOTAL });
  await page.goto("/#rebirth");
  const ultra = page.getByRole("button", {
    name: "Ultra-rebirth",
    exact: true,
  });
  await expect(ultra).toBeEnabled();
  await ultra.click();
  await page.getByRole("button", { name: "Confirm ultra-rebirth" }).click();
  // The ceremony plays over the page the moment the save lands: rays, the
  // mark and a title, pointer-transparent and gone by itself.
  await expect(page.locator(".ultra-ceremony")).toBeVisible();
  await expect(page.locator(".ultra-ceremony-title")).toContainText(
    "ULTRA-REBIRTH 1",
  );
  await expect.poll(async () => (await saved(page)).ultraRebirths).toBe(1);
  // The ceremony ends on the roll page — back to the rebirth page for the
  // legacy panel: the figures, the exclusives and the note left at the top.
  await page.goto("/#rebirth");
  await expect(page.locator(".rebirth-legacy")).toContainText(
    "Your ultra legacy",
  );
  await expect(page.locator(".rebirth-legacy")).toContainText(
    "Transcendent title",
  );
  await expect(page.locator(".rebirth-dev-note")).toContainText(
    "I didn't know you would get this far",
  );
  // The mark follows the account: a still gold halo on the roll stage…
  await page.goto("/");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-prestige",
    "true",
  );
  // …and the title only on the profile.
  await page.getByRole("button", { name: /profile/i }).click();
  await expect(page.locator(".profile-prestige")).toContainText("Transcendent");
});
