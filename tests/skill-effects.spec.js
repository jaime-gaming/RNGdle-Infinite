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
  drawPicksFor,
  drawPlanFor,
  skillChargeFactor,
  skillById,
  skillPetLuck,
  skillWalletMultiplier,
  skillWaivesCooldown,
} from "../src/skills.js";
import { runDrawPicks, runDrawPlan } from "../src/draw-plan.js";
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
  expect(plan).toEqual({ attempts: 2, floor: 0, keeps: 1 });
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
  // Two draw skills stack into the sum of their budgets: two draws plus three
  // is five, still only spending draws the game would really make.
  expect(drawPlanFor(["twice", "reborn-omen"])).toEqual({
    attempts: 5,
    floor: 0,
    keeps: 2,
  });
});

test("two draw skills each keep a number, and the roll pays for both", async () => {
  // Double Vision spends two draws and Bedrock four; neither of these numbers
  // reaches Bedrock's floor, so both budgets are spent in full. Each skill
  // keeps the best of its own draws, and both numbers are banked.
  const numbers = [88125, 375660, 861456, 90750, 577281, 25663];
  const [roll, score] = staged([...numbers]);
  const { draws, result, picks } = await runDrawPicks(
    drawPicksFor(["twice", "bedrock"]),
    roll,
    score,
  );
  expect(draws).toEqual(numbers);
  // Two picks, one per skill: Double Vision's best of two, Bedrock's best of
  // four, each with the draws it actually spent.
  expect(picks).toEqual([
    { skill: "twice", number: 88125, spent: 2 },
    { skill: "bedrock", number: 90750, spent: 4 },
  ]);
  // The number the roll commits is still the best-scoring of all of them.
  expect(result.number).toBe(90750);
  expect(result.totalEP).toBe(
    Math.max(...numbers.map((number) => evaluate(number).totalEP)),
  );

  // And the settlement pays every number that was kept, not only the committed
  // one: one banked line each, in the wallet and in the history.
  const state = {
    ...committed(),
    skills: ["twice", "bedrock"],
    equippedSkills: ["twice", "bedrock"],
    skillCharge: { twice: 0, bedrock: 0 },
    pendingRoll: {
      id: "p1",
      number: result.number,
      startedAt: 1000,
      rollMS: ROLL_DURATIONS[0],
      cooldownMS: COOLDOWN_DURATIONS[0],
      skills: ["twice", "bedrock"],
      draws,
      picks,
    },
  };
  const extras = await Promise.all(
    picks
      .filter((pick) => pick.number !== result.number)
      .map(async (pick) => ({
        skill: pick.skill,
        spent: pick.spent,
        result: await score(pick.number),
      })),
  );
  const paid = applyProgress(state, {
    type: "complete",
    id: "p1",
    at: 2000,
    cooldownUntil: 106000,
    result,
    extras,
  });
  const kept = picks.map((pick) => evaluate(pick.number).totalEP);
  expect(paid.balance).toBe(kept.reduce((sum, ep) => sum + ep, 0));
  const rolls = paid.history.filter((e) => e.type === "roll");
  expect(rolls.map((e) => e.number)).toEqual([90750, 88125]);
  expect(rolls.map((e) => e.ep)).toEqual([
    evaluate(90750).totalEP,
    evaluate(88125).totalEP,
  ]);
  // The extra line names the roll it came from and the draws its own skill
  // spent, so the feed never claims it was the best of all six.
  expect(rolls[1].with).toBe("p1");
  expect(rolls[1].draws).toBe(2);
  expect(rolls[1].skills).toEqual(["twice"]);
  // One roll, one charge: paying twice is not charging twice.
  expect(paid.skillCharge).toEqual({ twice: 0, bedrock: 0 });

  // A reload carries the picks with the roll, and only as this roll could have
  // made them: a forged pick — a number never drawn, or a skill that did not
  // fire — is thrown out instead of paid.
  expect(parsePending(state.pendingRoll).picks).toEqual(picks);
  expect(() =>
    parsePending({
      ...state.pendingRoll,
      picks: [{ skill: "twice", number: 1, spent: 2 }],
    }),
  ).toThrow("Invalid committed roll");
  expect(() =>
    parsePending({
      ...state.pendingRoll,
      picks: [{ skill: "surge", number: 88125, spent: 2 }],
    }),
  ).toThrow("Invalid committed roll");
  expect(() =>
    parsePending({
      ...state.pendingRoll,
      picks: [{ skill: "twice", number: 88125, spent: 99 }],
    }),
  ).toThrow("Invalid committed roll");
});

test("a floor skill stops at its floor and otherwise keeps the best draw", async () => {
  const plan = drawPlanFor(["bedrock"]);
  expect(plan).toEqual({ attempts: 4, floor: 25000, keeps: 1 });
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
