import { test, expect } from "@playwright/test";
import { evaluate } from "./helpers/index.js";
import {
  emptyProgress,
  applyProgress,
  walletMultiplier,
} from "../src/progress.js";
import {
  SKILL_MAX_DRAWS,
  chargeAfterSettlement,
  drawPlanFor,
  skillChargeFactor,
  skillById,
  skillPetLuck,
  skillWalletMultiplier,
  skillWaivesCooldown,
} from "../src/skills.js";
import { runDrawPlan } from "../src/draw-plan.js";
import { PET_DROP_CHANCE, petDrop } from "../src/pets.js";
import { parsePending } from "../src/progress.js";
import { ROLL_DURATIONS, COOLDOWN_DURATIONS } from "../src/shop-data.js";

// Every skill states what it does. These tests hold it to that: a wallet skill
// must move the wallet and nothing else, a draw skill must keep the best number
// it actually rolled, a floor skill must stop at its floor, and so on. Nothing
// here is allowed to change the scored EP, the number or its rank.

// A deterministic stand-in for the worker: the Nth call draws the Nth number,
// and every draw is scored by the verified index, exactly as the roll is.
const staged = (numbers) => [
  async () => numbers.shift(),
  async (value) => evaluate(value),
];

const committed = (extra = {}) => ({
  ...emptyProgress(),
  balance: 0,
  totalEarned: 0,
  skills: ["surge"],
  equippedSkills: ["surge"],
  skillCharge: { surge: 0 },
  pendingRoll: {
    id: "p1",
    number: 1337,
    startedAt: 1000,
    rollMS: ROLL_DURATIONS[0],
    cooldownMS: COOLDOWN_DURATIONS[0],
    skills: ["surge"],
  },
  ...extra,
});

test("a wallet skill multiplies only the EP that reaches the wallet", () => {
  const scored = evaluate(1337);
  const state = committed();
  const credited = applyProgress(state, {
    type: "complete",
    id: "p1",
    at: 2000,
    cooldownUntil: 106000,
    result: scored,
  });
  // Surge is ×2 on the wallet. The scored EP is untouched, and so is the roll
  // the history records: only the balance doubles.
  expect(skillWalletMultiplier(["surge"])).toBe(2);
  expect(credited.balance).toBe(scored.totalEP * 2);
  expect(credited.totalEarned).toBe(scored.totalEP * 2);
  expect(credited.history.find((e) => e.type === "roll").ep).toBe(
    scored.totalEP,
  );
  expect(credited.history.find((e) => e.type === "roll").walletBonus).toBe(
    scored.totalEP,
  );
  // A wallet skill is the only part of the rack that touches the wallet.
  expect(walletMultiplier(committed(), ["surge"])).toBe(2);
  expect(walletMultiplier(committed(), ["bounce"])).toBe(1);
  // An offline roll or a replayed receipt can never fire one.
  const offline = applyProgress(state, {
    type: "complete",
    id: "p1",
    source: "offline",
    at: 2000,
    cooldownUntil: 106000,
    result: scored,
  });
  expect(offline.balance).toBe(scored.totalEP);
});

test("a best-of skill keeps the highest-scoring number it actually rolled", async () => {
  const plan = drawPlanFor(["twice"]);
  expect(plan).toEqual({ attempts: 2, floor: 0 });
  const [roll, score] = staged([777777, 999999]);
  const { draws, result } = await runDrawPlan(plan, roll, score);
  // Both draws happen, and both are ordinary numbers the player rolled.
  expect(draws).toEqual([777777, 999999]);
  expect(draws).toContain(result.number);
  // The kept one is the higher-scoring of the two — which is not the same as
  // the larger number: EP comes from the game's own table.
  expect(result.totalEP).toBe(
    Math.max(evaluate(777777).totalEP, evaluate(999999).totalEP),
  );
  expect(result.totalEP).toBe(evaluate(777777).totalEP);
  expect(evaluate(777777).totalEP).toBeGreaterThan(evaluate(999999).totalEP);
  // Three draws, three chances, same rule.
  const [roll3, score3] = staged([5, 4242, 100000]);
  const best = await runDrawPlan(drawPlanFor(["reborn-omen"]), roll3, score3);
  expect(best.draws).toHaveLength(3);
  expect(best.draws).toContain(best.result.number);
  expect(best.result.totalEP).toBe(
    Math.max(
      evaluate(5).totalEP,
      evaluate(4242).totalEP,
      evaluate(100000).totalEP,
    ),
  );
  // Two draw skills combine into the larger budget, never the sum of them.
  expect(drawPlanFor(["twice", "reborn-omen"])).toEqual({
    attempts: 3,
    floor: 0,
  });
});

test("a floor skill stops at its floor and otherwise keeps the best draw", async () => {
  const plan = drawPlanFor(["bedrock"]);
  expect(plan).toEqual({ attempts: 4, floor: 25000 });
  // 4242 clears the floor, so the rest of the budget is never spent.
  const [roll, score] = staged([4242, 100000, 5, 5]);
  const early = await runDrawPlan(plan, roll, score);
  expect(early.draws).toEqual([4242]);
  expect(early.result.number).toBe(4242);
  expect(early.result.totalEP).toBeGreaterThanOrEqual(25000);
  // Nothing can clear an impossible floor, so the whole budget is spent and
  // the best of the four is the number the roll commits.
  const [roll2, score2] = staged([4242, 100000, 5, 777777]);
  const spent = await runDrawPlan({ attempts: 4, floor: 5e12 }, roll2, score2);
  expect(spent.draws).toEqual([4242, 100000, 5, 777777]);
  expect(spent.draws).toContain(spent.result.number);
  expect(spent.result.totalEP).toBe(evaluate(5).totalEP);
  expect(spent.result.totalEP).toBeLessThan(5e12);
  // The strongest draw budget in the game is still capped.
  expect(drawPlanFor(["dragonet-pyre"]).attempts).toBeLessThanOrEqual(
    SKILL_MAX_DRAWS,
  );
});

test("a waive skill buys a roll with no cooldown behind it", () => {
  const skills = ["bounce"];
  expect(skillWaivesCooldown(skills)).toBe(true);
  expect(skillWaivesCooldown(["surge"])).toBe(false);
  // The save only accepts a zero cooldown when something paid for it, so a
  // hand-edited roll cannot skip the wait.
  expect(
    parsePending(
      {
        id: "p1",
        number: 1337,
        startedAt: 1000,
        rollMS: ROLL_DURATIONS[0],
        cooldownMS: 0,
        skills,
      },
      [],
    ).cooldownMS,
  ).toBe(0);
  expect(() =>
    parsePending(
      {
        id: "p1",
        number: 1337,
        startedAt: 1000,
        rollMS: ROLL_DURATIONS[0],
        cooldownMS: 0,
      },
      [],
    ),
  ).toThrow(/committed roll/i);
});

test("an overdrive skill multiplies charging, and a pet-luck skill only widens the companion window", () => {
  const state = committed({
    skills: ["turbo", "surge"],
    equippedSkills: ["turbo", "surge"],
    skillCharge: { turbo: 0, surge: 1 },
    pendingRoll: {
      id: "p1",
      number: 1337,
      startedAt: 1000,
      rollMS: ROLL_DURATIONS[0],
      cooldownMS: COOLDOWN_DURATIONS[0],
      skills: ["turbo"],
    },
  });
  // Turbo fired, so it empties; every other circle gains three instead of one.
  const after = chargeAfterSettlement(state, "p1");
  expect(skillChargeFactor(["turbo"])).toBe(3);
  expect(after).toEqual({ turbo: 0, surge: 4 });
  // Trail and Drift say they raise the chance of finding a companion: the
  // window widens by exactly their multiplier, and nothing else moves.
  expect(skillPetLuck(["trail"])).toBe(4);
  expect(petDrop(PET_DROP_CHANCE * 3.5, [], 4)).toBeTruthy();
  expect(petDrop(PET_DROP_CHANCE * 4.5, [], 4)).toBeNull();
  expect(petDrop(0.9, [], 1)).toBeNull();
});

test("every skill states an effect it can actually deliver", () => {
  for (const skill of [
    "surge",
    "trail",
    "bounce",
    "twice",
    "bedrock",
    "turbo",
  ]) {
    const definition = skillById.get(skill);
    expect(definition.charges).toBeGreaterThan(0);
    // A draw skill must declare a budget of at least two, a floor skill a
    // floor it can reach, and a wallet skill a multiplier above one.
    if (definition.kind === "best-of")
      expect(definition.attempts).toBeGreaterThan(1);
    if (definition.kind === "floor") {
      expect(definition.floor).toBeGreaterThan(0);
      expect(definition.attempts).toBeGreaterThan(1);
    }
    if (definition.kind === "wallet")
      expect(definition.value).toBeGreaterThan(1);
    if (definition.kind === "pet-luck")
      expect(definition.value).toBeGreaterThan(1);
    if (definition.kind === "overdrive")
      expect(definition.value).toBeGreaterThan(1);
  }
});
