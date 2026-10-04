import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
  parsePending,
  walletMultiplier,
} from "../src/progress.js";
import {
  SKILLS,
  SKILL_IDS,
  SKILL_MAX_DRAWS,
  SKILL_SLOTS_BASE,
  armedSkills,
  chargeAfterSettlement,
  drawPlanFor,
  petSkills,
  rebirthSkill,
  skillArmed,
  skillById,
  skillChargeFactor,
  skillForPet,
  skillPetLuck,
  skillSlots,
  skillUnlocked,
  skillWaivesCooldown,
  skillWalletMultiplier,
  shopSkills,
} from "../src/skills.js";
import {
  BADGE_TOTAL,
  REBIRTH_STARTER_EP,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  ULTRA_BONUS_PER_REBIRTH,
  cycleStarterEp,
  ultraRebirthRequirement,
} from "../src/rebirth.js";
import { PETS, petById } from "../src/pets.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import {
  shopProducts,
  productById,
  skillStock,
  skillStockWindow,
  nextSkillStockOffset,
  SKILL_STOCK_SIZE,
  SKILL_STOCK_WINDOW_MS,
} from "../src/shop-data.js";
import { evaluate } from "./helpers/index.js";

const ids = allBadgeMetadata.map((b) => b.id);
const fund = (balance, extra = {}) => ({
  ...emptyProgress(),
  balance,
  totalEarned: balance,
  ...extra,
});
// A committed roll with the skills that fired on it, ready to settle.
const roll = (id, skills = [], extra = {}) => ({
  id,
  number: 1337,
  startedAt: 1000,
  rollMS: 45000,
  cooldownMS: skillWaivesCooldown(skills) ? 0 : 60000,
  ...(skills.length ? { skills } : {}),
  ...extra,
});

test("every skill states one effect, one charge cost and where it comes from", () => {
  expect(SKILLS.length).toBe(shopSkills.length + petSkills.length + 6);
  expect(new Set(SKILL_IDS).size).toBe(SKILLS.length);
  for (const skill of SKILLS) {
    expect(skill.charges).toBeGreaterThan(0);
    expect(typeof skill.name).toBe("string");
    expect(skill.description.length).toBeGreaterThan(20);
    expect(["shop", "pet", "rebirth"]).toContain(skill.source);
    if (skill.source === "shop")
      expect(productById.get(skill.id)?.price).toBe(skill.price);
    if (skill.source === "pet") expect(petById.has(skill.petId)).toBe(true);
    if (skill.source === "rebirth")
      expect(skill.rebirth).toBeGreaterThanOrEqual(1);
  }
  // Every companion has exactly one signature, and every shop skill is sold.
  for (const pet of PETS) expect(skillForPet(pet.id)).toBeTruthy();
  for (const skill of shopSkills)
    expect(
      shopProducts.some((p) => p.id === skill.id && p.kind === "skill"),
    ).toBe(true);
  for (const step of REBIRTH_STEPS.map((_, index) => index + 1))
    if (step <= REBIRTH_TOTAL) expect(rebirthSkill(step)).toBeTruthy();
});

test("the rack holds two skills, four with both bays, and swapping is free", () => {
  expect(SKILL_SLOTS_BASE).toBe(2);
  expect(skillSlots([])).toBe(2);
  expect(skillSlots(["skill-bay-1"])).toBe(3);
  expect(skillSlots(["skill-bay-1", "skill-bay-2"])).toBe(4);
  // The bays are an upgrade chain inside the price rules the shop test pins.
  const bay1 = productById.get("skill-bay-1"),
    bay2 = productById.get("skill-bay-2");
  expect(bay2.requires).toBe("skill-bay-1");
  expect(bay2.price / bay1.price).toBeLessThanOrEqual(4);

  let p = fund(10000000, {
    owned: ["surge", "trail"],
    skills: ["surge", "trail"],
  });
  p = applyProgress(p, { type: "equip-skill", id: "surge", at: 1 });
  p = applyProgress(p, { type: "equip-skill", id: "trail", at: 1 });
  expect(p.equippedSkills).toEqual(["surge", "trail"]);
  const balance = p.balance;
  // A third skill does not fit until a bay is bought.
  expect(() =>
    applyProgress(
      { ...p, owned: [...p.owned, "bounce"], skills: [...p.skills, "bounce"] },
      {
        type: "equip-skill",
        id: "bounce",
        at: 1,
      },
    ),
  ).toThrow(/rack holds 2 skills/);
  // Unequipping and re-equipping spends nothing, and no charge is lost.
  const charged = { ...p, skillCharge: { surge: 4, trail: 2 } };
  const swapped = applyProgress(charged, {
    type: "equip-skill",
    id: "surge",
    equipped: false,
    at: 1,
  });
  expect(swapped.equippedSkills).toEqual(["trail"]);
  expect(swapped.skillCharge.surge).toBe(4);
  expect(swapped.balance).toBe(balance);
  const back = applyProgress(swapped, {
    type: "equip-skill",
    id: "surge",
    equipped: true,
    at: 1,
  });
  expect(back.equippedSkills).toEqual(["trail", "surge"]);
});

test("a companion's signature only exists while it is the active companion", () => {
  const base = fund(50000000, { pets: ["pebble", "moth"] });
  const signature = skillForPet("pebble");
  const other = skillForPet("moth");
  expect(skillUnlocked(signature.id, base)).toBe(false);
  const wearing = { ...base, activePet: "pebble" };
  expect(skillUnlocked(signature.id, wearing)).toBe(true);
  expect(skillUnlocked(other.id, wearing)).toBe(false);
  // Equipping Pebble puts its signature in a free slot; swapping to Moth pulls
  // Pebble's skill out of the rack and offers Moth's.
  let p = applyProgress(base, { type: "equip-pet", id: "pebble", at: 1 });
  expect(p.equippedSkills).toEqual([signature.id]);
  p = applyProgress(p, { type: "equip-pet", id: "moth", at: 1 });
  expect(p.equippedSkills).toEqual([other.id]);
  // A forged save cannot wear a signature without the companion.
  const forged = parseProgress(
    JSON.stringify({
      ...base,
      activePet: "jelly",
      equippedSkills: [signature.id],
    }),
  );
  expect(forged.activePet).toBe("none");
  expect(forged.equippedSkills).toEqual([]);
  expect(() =>
    applyProgress(base, { type: "equip-skill", id: other.id, at: 1 }),
  ).toThrow(/Equip this companion/);
});

test("circles charge on settled online rolls only, and firing empties them", () => {
  const base = fund(1000, {
    owned: ["surge", "trail"],
    skills: ["surge", "trail"],
    equippedSkills: ["surge", "trail"],
  });
  // An offline settlement never charges a circle.
  expect(
    chargeAfterSettlement(
      { ...base, pendingRoll: { id: "x", skills: ["surge"] } },
      "x",
      "offline",
    ),
  ).toEqual({});
  // A settlement that does not match the committed roll charges nothing.
  expect(
    chargeAfterSettlement(
      { ...base, pendingRoll: { id: "x", skills: [] } },
      "y",
      "online",
    ),
  ).toEqual({});
  // A committed online roll charges every equipped skill by one.
  const settled = applyProgress(
    { ...base, pendingRoll: roll("r1") },
    {
      type: "complete",
      result: evaluate(1337),
      id: "r1",
      cooldownUntil: 100000,
      at: 2,
    },
  );
  expect(settled.skillCharge).toEqual({ surge: 1, trail: 1 });
  // Firing empties the circle that fired and charges the others.
  const fired = applyProgress(
    {
      ...base,
      skillCharge: { surge: 6, trail: 3 },
      pendingRoll: roll("r2", ["surge"]),
    },
    {
      type: "complete",
      result: evaluate(1337),
      id: "r2",
      cooldownUntil: 100000,
      at: 2,
    },
  );
  expect(fired.skillCharge).toEqual({ surge: 0, trail: 4 });
  // Turbo counts triple, for Flywheel and for the rack alike.
  expect(skillChargeFactor(["turbo"])).toBe(3);
  expect(
    chargeAfterSettlement(
      {
        ...base,
        owned: [...base.owned, "flywheel", "turbo"],
        skills: [...base.skills, "turbo"],
        equippedSkills: ["surge", "trail", "turbo"],
        skillCharge: { surge: 0, trail: 0, turbo: 0 },
        pendingRoll: roll("r3", ["turbo"]),
      },
      "r3",
      "online",
    ),
  ).toEqual({ surge: 3, trail: 3, turbo: 0 });
  // Nothing can charge past the circle's own limit.
  expect(
    chargeAfterSettlement(
      { ...base, skillCharge: { surge: 6 }, pendingRoll: roll("r4") },
      "r4",
      "online",
    ).surge,
  ).toBe(skillById.get("surge").charges);
});

test("armed skills are the equipped, unlocked, full circles", () => {
  const base = fund(0, {
    owned: ["surge", "trail"],
    skills: ["surge", "trail"],
    equippedSkills: ["surge", "trail"],
    skillCharge: { surge: 6, trail: 2 },
  });
  expect(armedSkills(base)).toEqual(["surge"]);
  expect(skillArmed(base, "trail")).toBe(false);
  expect(armedSkills({ ...base, skillCharge: { surge: 6, trail: 6 } })).toEqual(
    ["surge", "trail"],
  );
  // An equipped skill that is not unlocked never arms, whatever the charge says.
  const forged = {
    ...base,
    skills: ["trail"],
    skillCharge: { surge: 6, trail: 6 },
  };
  expect(armedSkills(forged)).toEqual(["trail"]);
});

test("draw skills collapse into one plan and never invent EP", () => {
  expect(drawPlanFor([])).toBeNull();
  expect(drawPlanFor(["surge"])).toBeNull();
  expect(drawPlanFor(["twice"])).toEqual({ attempts: 2, floor: 0 });
  expect(drawPlanFor(["bedrock"])).toEqual({ attempts: 4, floor: 25000 });
  // Best-of and a floor stack into the larger budget and the higher floor.
  expect(drawPlanFor(["twice", "bedrock"])).toEqual({
    attempts: 4,
    floor: 25000,
  });
  expect(drawPlanFor(["griffin-dive", "quarry"])).toEqual({
    attempts: 5,
    floor: 100000,
  });
  // The wallet multiplier is a multiplier of banked EP and nothing else.
  expect(skillWalletMultiplier(["surge"])).toBe(2);
  expect(skillWalletMultiplier(["surge", "unicorn-wish"])).toBe(5);
  expect(skillWalletMultiplier(["turbo", "bounce"])).toBe(1);
  expect(skillPetLuck(["trail"])).toBe(4);
  expect(skillPetLuck([])).toBe(1);
  expect(skillWaivesCooldown(["bounce"])).toBe(true);
  expect(skillWaivesCooldown(["surge"])).toBe(false);
});

test("the two late shop skills reuse effects that are already proven", () => {
  const miser = skillById.get("miser"),
    triptych = skillById.get("triptych");
  for (const skill of [miser, triptych]) {
    expect(skill.source).toBe("shop");
    // Sold, priced above everything that came before, and never a pet skill.
    expect(productById.get(skill.id).price).toBe(skill.price);
    expect(skill.price).toBeGreaterThan(productById.get("quarry").price);
    expect(skill.charges).toBeGreaterThan(0);
    expect(skill.description.endsWith(".")).toBe(true);
  }
  // Miser is a wallet multiplier, exactly like Surge and the companions.
  expect(miser.kind).toBe("wallet");
  expect(skillWalletMultiplier(["miser"])).toBe(3);
  expect(drawPlanFor(["miser"])).toBeNull();
  // Triptych is a best-of-three: three ordinary draws, one kept.
  expect(triptych.kind).toBe("best-of");
  expect(drawPlanFor(["triptych"])).toEqual({ attempts: 3, floor: 0 });
  expect(triptych.attempts).toBeLessThanOrEqual(SKILL_MAX_DRAWS);
  // Together they still only pick between numbers that were really drawn.
  expect(drawPlanFor(["triptych", "quarry"])).toEqual({
    attempts: 5,
    floor: 100000,
  });
});

test("a settled roll banks the wallet multiplier and keeps the scored EP honest", () => {
  const result = evaluate(1337);
  const base = fund(1000000, {
    owned: ["surge"],
    skills: ["surge"],
    equippedSkills: ["surge"],
    activePet: "none",
  });
  const settled = applyProgress(
    { ...base, pendingRoll: roll("r1", ["surge"]) },
    { type: "complete", result, id: "r1", cooldownUntil: 100000, at: 2 },
  );
  // The scored roll is identical to a plain one.
  const plain = applyProgress(
    { ...base, pendingRoll: roll("r2") },
    { type: "complete", result, id: "r2", cooldownUntil: 100000, at: 2 },
  );
  const scored = (p, id) =>
    p.history.find((e) => e.type === "roll" && e.id === id);
  expect(scored(settled, "r1").ep).toBe(scored(plain, "r2").ep);
  expect(scored(settled, "r1").number).toBe(scored(plain, "r2").number);
  expect(scored(settled, "r1").tier).toBe(scored(plain, "r2").tier);
  expect(scored(settled, "r1").badges).toEqual(scored(plain, "r2").badges);
  // Only the wallet moves, and the receipt says which skills did it.
  expect(settled.balance - 1000000).toBe(result.totalEP * 2);
  expect(scored(settled, "r1").walletMultiplier).toBe(2);
  expect(scored(settled, "r1").walletBonus).toBe(result.totalEP);
  expect(scored(settled, "r1").skills).toEqual(["surge"]);
  // A companion, a skill and both rebirth bonuses all multiply banked EP
  // together.
  const combined = applyProgress(
    {
      ...fund(0, {
        owned: ["surge"],
        skills: ["surge"],
        equippedSkills: ["surge"],
        pets: ["dragonet"],
        activePet: "dragonet",
        rebirths: 3,
        ultraRebirths: 2,
      }),
      pendingRoll: roll("r3", ["surge"]),
    },
    { type: "complete", result, id: "r3", cooldownUntil: 100000, at: 2 },
  );
  const multiplier =
    2 * petById.get("dragonet").multiplier * (1 + 0.02 * 3) * (1 + 0.1 * 2);
  expect(
    walletMultiplier({ activePet: "dragonet", rebirths: 3, ultraRebirths: 2 }, [
      "surge",
    ]),
  ).toBeCloseTo(multiplier, 6);
  expect(combined.balance).toBe(Math.round(result.totalEP * multiplier));
  // And a reload keeps the receipt.
  const reloaded = parseProgress(JSON.stringify(combined));
  expect(
    reloaded.history.find((e) => e.type === "roll" && e.id === "r3").skills,
  ).toEqual(["surge"]);
});

test("forged saves cannot smuggle charge, slots or a free roll", () => {
  const base = fund(0);
  // Charge beyond a circle's limit is rejected outright.
  expect(() =>
    parseProgress(
      JSON.stringify({
        ...base,
        skillCharge: { surge: skillById.get("surge").charges + 1 },
      }),
    ),
  ).toThrow(/Invalid skill charge/);
  expect(() =>
    parseProgress(JSON.stringify({ ...base, skillCharge: { surge: -1 } })),
  ).toThrow(/Invalid skill charge/);
  // Unknown skills and unknown charge keys are dropped, never trusted.
  const cleaned = parseProgress(
    JSON.stringify({
      ...base,
      skills: ["surge", "not-a-skill"],
      skillCharge: { surge: 3, ghost: 9 },
      equippedSkills: ["surge", "ghost"],
    }),
  );
  expect(cleaned.skills).toEqual([]);
  expect(cleaned.equippedSkills).toEqual([]);
  expect(cleaned.skillCharge).toEqual({ surge: 3 });
  // A bought skill is unlocked only together with its purchase.
  const bought = parseProgress(
    JSON.stringify({ ...base, owned: ["surge"], skills: ["surge", "quarry"] }),
  );
  expect(bought.skills).toEqual(["surge"]);
  // More equipped skills than the rack allows is trimmed to the rack.
  const many = parseProgress(
    JSON.stringify({
      ...base,
      owned: ["surge", "trail", "bounce", "twice", "skill-bay-1"],
      skills: ["surge", "trail", "bounce", "twice"],
      equippedSkills: ["surge", "trail", "bounce", "twice"],
    }),
  );
  expect(many.equippedSkills).toHaveLength(3);
  // A zero cooldown must be explained by a boost or a waiving skill.
  const pending = (extra) => ({
    id: "c1",
    number: 604827,
    startedAt: 1000,
    rollMS: 45000,
    cooldownMS: 60000,
    ...extra,
  });
  expect(() => parsePending(pending({ cooldownMS: 0 }))).toThrow(
    /Invalid committed roll/,
  );
  expect(
    parsePending(pending({ cooldownMS: 0, skills: ["bounce"] })).cooldownMS,
  ).toBe(0);
  expect(
    parsePending(pending({ cooldownMS: 0, flywheel: "boost" })).cooldownMS,
  ).toBe(0);
  // Committed draws must belong to the plan that was charged for them.
  expect(() => parsePending(pending({ draws: [604827, 12] }))).toThrow(
    /Invalid committed roll/,
  );
  expect(() =>
    parsePending(pending({ skills: ["twice"], draws: [604827, 12, 13] })),
  ).toThrow(/Invalid committed roll/);
  expect(() =>
    parsePending(pending({ skills: ["twice"], draws: [1, 2] })),
  ).toThrow(/Invalid committed roll/);
  const honest = parsePending(
    pending({ skills: ["twice", "bedrock"], draws: [604827, 999, 42] }),
  );
  expect(honest.draws).toEqual([604827, 999, 42]);
  const plan = drawPlanFor(["twice", "bedrock"]);
  expect(honest.draws.length).toBeLessThanOrEqual(
    Math.min(plan.attempts, SKILL_MAX_DRAWS),
  );
  // Timings still cannot outrun the upgrades the save paid for.
  expect(() =>
    parsePending(pending({ rollMS: 10000 }), ["quickwind-1"]),
  ).toThrow(/do not match your upgrades/);
});

test("rebirth hands back the run — shelf, companions and wallet — grants the ladder skill and keeps the history", () => {
  const state = fund(5000000, {
    profile: { id: "p", username: "Tester", createdAt: 1 },
    discovered: ids.slice(0, REBIRTH_STEPS[0].badges * BADGE_TOTAL),
    owned: ["quickwind-1", "starfall", "flywheel", "skill-bay-1"],
    equipped: "starfall",
    pets: ["pebble"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    skillCharge: { surge: 4 },
    flywheelCharge: 3,
    // The rung's other half: EP this cycle has scored. It is a mark of
    // progress, not a spend, so the wallet is untouched by it.
    history: [
      {
        id: "old",
        type: "roll",
        at: 1,
        number: 5,
        tier: "trash",
        ep: 1,
        badges: [],
      },
      {
        id: "old2",
        type: "roll",
        at: 2,
        number: 604827,
        tier: "common",
        ep: REBIRTH_STEPS[0].ep,
        badges: [],
      },
    ],
    receipts: ["old"],
  });
  // The ladder's first rung: a fifth of the collection and 250,000 EP the
  // cycle earned — both are met by this account.
  expect(REBIRTH_STEPS[0]).toEqual({ badges: 0.2, ep: 250000 });
  const reborn = applyProgress(state, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 200000,
    eventId: "ev1",
  });
  expect(reborn.rebirths).toBe(1);
  // The run is handed back: the wallet, the shelf, the companions and the
  // collection all start over, and the wallet restarts on the sum the rung
  // just paid.
  expect(reborn.balance).toBe(REBIRTH_STARTER_EP);
  expect(reborn.owned).toEqual([]);
  expect(reborn.pets).toEqual([]);
  expect(reborn.equipped).toBe("none");
  expect(reborn.discovered).toEqual([]);
  expect(reborn.skillCharge).toEqual({});
  expect(reborn.flywheelCharge).toBe(0);
  expect(reborn.pendingRoll).toBeNull();
  expect(reborn.cooldownUntil).toBe(0);
  // The wallet keeps its balance of EP earned all-time and the +2% the rung
  // just paid — the companion that went back with the run does not count.
  expect(reborn.totalEarned).toBe(5000000 + REBIRTH_STARTER_EP);
  expect(walletMultiplier(reborn, [])).toBeCloseTo(1.02, 6);
  // The ladder skill is earned, not bought: it arrives unlocked and takes the
  // rack's slot, while the shop skill went back on the stall.
  const granted = rebirthSkill(1);
  expect(reborn.skills).toEqual([granted.id]);
  expect(reborn.equippedSkills).toEqual([granted.id]);
  // The activity history is the account's, so the old roll stays and the
  // rebirth is recorded after it.
  expect(reborn.history.map((e) => e.type)).toEqual([
    "roll",
    "roll",
    "rebirth",
  ]);
  expect(reborn.history.at(-1)).toMatchObject({
    id: "ev1",
    type: "rebirth",
    count: 1,
    skill: granted.id,
  });
  expect(parseProgress(JSON.stringify(reborn)).skills).toContain(granted.id);
  // The next rung asks for more badges and more EP, and the cycle has to
  // rediscover the collection before it can be claimed.
  expect(REBIRTH_STEPS[1]).toEqual({ badges: 0.25, ep: 600000 });
  expect(() =>
    applyProgress(reborn, { type: "rebirth", expectedRebirths: 1, at: 200000 }),
  ).toThrow(/Discover/);
});

test("the ultra-rebirth only exists at the top of the ladder and restarts the run for a permanent bonus", () => {
  const top = fund(9000000, {
    profile: { id: "p", username: "Tester", createdAt: 1 },
    discovered: ids,
    // The ultra-rebirth asks for the cycle's EP as well as the badges.
    history: [
      {
        id: "old",
        type: "roll",
        at: 1,
        number: 604827,
        tier: "common",
        ep: ultraRebirthRequirement().ep,
        badges: [],
      },
    ],
    owned: ["quickwind-1", "starfall"],
    equipped: "starfall",
    pets: ["pebble"],
    activePet: "pebble",
    // One shop skill and one the ladder paid for: the first goes back on the
    // stall, the second was earned by a rebirth the account keeps.
    skills: ["surge", "reborn-drive"],
    equippedSkills: ["surge", "reborn-drive"],
    skillCharge: { surge: 5 },
    rebirths: REBIRTH_TOTAL,
    ultraRebirths: 1,
  });
  // Not available before the last rung.
  expect(() =>
    applyProgress(
      { ...top, rebirths: REBIRTH_TOTAL - 1 },
      { type: "ultra-rebirth", expectedUltraRebirths: 1, at: 200000 },
    ),
  ).toThrow(/ladder/);
  // And not without half the collection back.
  expect(() =>
    applyProgress(
      { ...top, discovered: ids.slice(0, 10) },
      { type: "ultra-rebirth", expectedUltraRebirths: 1, at: 200000 },
    ),
  ).toThrow(/Discover 118 badges/);
  // Nor without the EP the cycle has to have earned.
  expect(() =>
    applyProgress(
      { ...top, history: [] },
      { type: "ultra-rebirth", expectedUltraRebirths: 1, at: 200000 },
    ),
  ).toThrow(/Earn 30,000,000 EP/);
  const reborn = applyProgress(top, {
    type: "ultra-rebirth",
    expectedUltraRebirths: 1,
    at: 200000,
    eventId: "u2",
  });
  expect(reborn.ultraRebirths).toBe(2);
  expect(reborn.profile).toEqual(top.profile);
  // The same fresh start a rebirth gives: wallet, collection, shelf and
  // companions go back, and the shop skill with them.
  expect(reborn.balance).toBe(cycleStarterEp(REBIRTH_TOTAL, 2));
  expect(reborn.discovered).toEqual([]);
  expect(reborn.owned).toEqual([]);
  expect(reborn.pets).toEqual([]);
  expect(reborn.skills).toEqual(["reborn-drive"]);
  expect(reborn.equippedSkills).toEqual(["reborn-drive"]);
  expect(reborn.skillCharge).toEqual({});
  // It costs the run, never the account: the ladder and its bonuses stay.
  expect(reborn.rebirths).toBe(REBIRTH_TOTAL);
  expect(reborn.totalEarned).toBe(9000000 + cycleStarterEp(REBIRTH_TOTAL, 2));
  // The roll that paid for it stays in the log, and the ultra-rebirth is
  // recorded after it: the history is the account's, never the cycle's.
  expect(reborn.history).toHaveLength(2);
  expect(reborn.history[0]).toMatchObject({ type: "roll" });
  expect(reborn.history[1]).toMatchObject({ type: "ultra-rebirth", count: 2 });
  // The bonus is permanent and multiplies banked EP only: +10% per ultra.
  expect(ULTRA_BONUS_PER_REBIRTH).toBe(0.1);
  expect(walletMultiplier({ activePet: "none", ultraRebirths: 3 })).toBeCloseTo(
    1.3,
    6,
  );
  const result = evaluate(1337);
  const credited = applyProgress(
    {
      ...reborn,
      balance: 0,
      totalEarned: 0,
      pendingRoll: {
        id: "u",
        number: 1337,
        startedAt: 1,
        rollMS: 45000,
        cooldownMS: 60000,
      },
    },
    { type: "complete", result, id: "u", cooldownUntil: 2, at: 3 },
  );
  // The bonus is permanent and multiplies banked EP only: +10% per ultra,
  // stacked on the +2% every rung of the ladder paid.
  expect(credited.balance).toBe(
    Math.round(result.totalEP * 1.2 * (1 + 0.02 * REBIRTH_TOTAL)),
  );
  // The roll this settlement wrote, not the one that paid for the ultra.
  expect(credited.history.findLast((e) => e.type === "roll").ep).toBe(
    result.totalEP,
  );
});

test("the skill stall sells three skills at a time and rotates every five minutes", () => {
  const ids = shopSkills.map((skill) => skill.id);
  expect(SKILL_STOCK_SIZE).toBe(3);
  expect(SKILL_STOCK_WINDOW_MS).toBe(5 * 60 * 1000);
  // The window is the clock, not a stored list.
  expect(skillStockWindow(0)).toBe(0);
  expect(skillStockWindow(SKILL_STOCK_WINDOW_MS - 1)).toBe(0);
  expect(skillStockWindow(SKILL_STOCK_WINDOW_MS)).toBe(1);
  // One window, one pair — deterministic, so two tabs can never disagree.
  const pair = skillStock(42);
  expect(pair).toEqual(skillStock(42));
  expect(pair).toHaveLength(SKILL_STOCK_SIZE);
  expect(new Set(pair).size).toBe(SKILL_STOCK_SIZE);
  for (const id of pair) expect(ids).toContain(id);
  // Owning one slides it out of the stall and the next into view, without
  // reshuffling the rest of the window's order.
  const [first, second] = pair;
  const restocked = skillStock(42, [first]);
  expect(restocked).toHaveLength(SKILL_STOCK_SIZE);
  expect(restocked[0]).toBe(second);
  expect(restocked).not.toContain(first);
  const finalSlot = skillStock(
    42,
    ids.filter((id) => id !== first),
  );
  expect(finalSlot).toEqual([first]);
  // Owning everything sells the stall out completely.
  expect(skillStock(42, ids)).toEqual([]);
  // Across windows the pair rotates and every shop skill gets its turn.
  const pairs = new Set(),
    seen = new Set();
  for (let index = 0; index < 25; index++) {
    const window = skillStock(index);
    pairs.add(window.join("+"));
    window.forEach((id) => seen.add(id));
  }
  expect(pairs.size).toBeGreaterThan(4);
  expect([...seen].sort()).toEqual([...ids].sort());
});

test("the stall can say exactly when an out-of-stock skill comes back", () => {
  const ids = shopSkills.map((skill) => skill.id);
  for (let window = 40; window < 60; window++) {
    for (const id of ids) {
      const offset = nextSkillStockOffset(window, [], id);
      // The rotation carries every skill back within the two-hour horizon.
      expect(offset).toBeGreaterThanOrEqual(1);
      expect(offset).toBeLessThanOrEqual(24);
      // …and the answer is exact: that window has it, no earlier one does.
      expect(skillStock(window + offset)).toContain(id);
      for (let earlier = 1; earlier < offset; earlier++)
        expect(skillStock(window + earlier)).not.toContain(id);
    }
  }
  // An owned skill never comes back on the stall, so there is no answer.
  expect(nextSkillStockOffset(40, ["surge"], "surge")).toBeNull();
  // The answer is deterministic: every tab quotes the same window.
  expect(nextSkillStockOffset(41, [], "twice")).toBe(
    nextSkillStockOffset(41, [], "twice"),
  );
});

test("only the stocked skills can be bought, and buying one does not reshuffle the rest", () => {
  const ids = shopSkills.map((skill) => skill.id);
  const at = 7 * SKILL_STOCK_WINDOW_MS + 1000; // Firmly inside window 7.
  const stocked = skillStock(7);
  const away = ids.filter((id) => !stocked.includes(id));
  expect(away.length).toBeGreaterThan(0);
  const base = fund(100000000);
  // The stall refuses an out-of-stock purchase, politely and without a sale.
  for (const id of away)
    expect(() => applyProgress(base, { type: "buy", id, at })).toThrow(
      /out of stock/,
    );
  expect(base.owned).toEqual([]);
  // The stocked pair sells exactly as before: unlock, rack slot, one purchase.
  const bought = applyProgress(base, {
    type: "buy",
    id: stocked[0],
    at,
    eventId: "b1",
  });
  expect(bought.owned).toEqual([stocked[0]]);
  expect(bought.skills).toEqual([stocked[0]]);
  expect(bought.equippedSkills).toEqual([stocked[0]]);
  expect(bought.balance).toBe(100000000 - productById.get(stocked[0]).price);
  // The other slot keeps its skill: the stall slides the next one in behind
  // it rather than dealing a brand-new pair mid-window.
  const after = skillStock(7, bought.owned);
  expect(after).toHaveLength(SKILL_STOCK_SIZE);
  expect(after).toContain(stocked[1]);
  expect(after).not.toContain(stocked[0]);
  // The arriving skill is buyable too, in the same window.
  const newcomer = after.find((id) => id !== stocked[1]);
  expect(() =>
    applyProgress(bought, { type: "buy", id: newcomer, at }),
  ).not.toThrow();
});

test("skill effects never touch the draw itself", () => {
  // The whole engine only ever picks between numbers that were really rolled:
  // a plan states a budget, and the floors are thresholds, not guarantees.
  const plan = drawPlanFor(["quarry", "griffin-dive"]);
  expect(plan.attempts).toBeLessThanOrEqual(SKILL_MAX_DRAWS);
  expect(plan.floor).toBe(100000);
  // A floor cannot promise EP: an unfinished plan still commits a real number.
  const fallingBack = parsePending({
    id: "p1",
    number: 7,
    startedAt: 1,
    rollMS: 45000,
    cooldownMS: 60000,
    skills: ["quarry"],
    draws: [7, 8, 9],
  });
  expect(fallingBack.draws).toContain(fallingBack.number);
  expect(fallingBack.skills).toEqual(["quarry"]);
  // Skill products carry no number-editing payload of their own.
  for (const product of shopProducts.filter((p) => p.kind === "skill")) {
    expect(product.rollMS).toBeUndefined();
    expect(product.value).toBeUndefined();
  }
});
