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
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  ULTRA_BONUS_PER_REBIRTH,
} from "../src/rebirth.js";
import { PETS, petById } from "../src/pets.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts, productById } from "../src/shop-data.js";
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
    expect(shopProducts.some((p) => p.id === skill.id && p.kind === "skill")).toBe(
      true,
    );
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

  let p = fund(10000000, { owned: ["surge", "trail"], skills: ["surge", "trail"] });
  p = applyProgress(p, { type: "equip-skill", id: "surge", at: 1 });
  p = applyProgress(p, { type: "equip-skill", id: "trail", at: 1 });
  expect(p.equippedSkills).toEqual(["surge", "trail"]);
  const balance = p.balance;
  // A third skill does not fit until a bay is bought.
  expect(() =>
    applyProgress({ ...p, owned: [...p.owned, "bounce"], skills: [...p.skills, "bounce"] }, {
      type: "equip-skill",
      id: "bounce",
      at: 1,
    }),
  ).toThrow(/rack holds 2 skills/);
  // Unequipping and re-equipping spends nothing, and no charge is lost.
  const charged = { ...p, skillCharge: { surge: 4, trail: 2 } };
  const swapped = applyProgress(charged, { type: "equip-skill", id: "surge", equipped: false, at: 1 });
  expect(swapped.equippedSkills).toEqual(["trail"]);
  expect(swapped.skillCharge.surge).toBe(4);
  expect(swapped.balance).toBe(balance);
  const back = applyProgress(swapped, { type: "equip-skill", id: "surge", equipped: true, at: 1 });
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
  expect(() => applyProgress(base, { type: "equip-skill", id: other.id, at: 1 })).toThrow(
    /Equip this companion/,
  );
});

test("circles charge on settled online rolls only, and firing empties them", () => {
  const base = fund(1000, {
    owned: ["surge", "trail"],
    skills: ["surge", "trail"],
    equippedSkills: ["surge", "trail"],
  });
  // An offline settlement never charges a circle.
  expect(chargeAfterSettlement({ ...base, pendingRoll: { id: "x", skills: ["surge"] } }, "x", "offline")).toEqual({});
  // A settlement that does not match the committed roll charges nothing.
  expect(chargeAfterSettlement({ ...base, pendingRoll: { id: "x", skills: [] } }, "y", "online")).toEqual({});
  // A committed online roll charges every equipped skill by one.
  const settled = applyProgress(
    { ...base, pendingRoll: roll("r1") },
    { type: "complete", result: evaluate(1337), id: "r1", cooldownUntil: 100000, at: 2 },
  );
  expect(settled.skillCharge).toEqual({ surge: 1, trail: 1 });
  // Firing empties the circle that fired and charges the others.
  const fired = applyProgress(
    { ...base, skillCharge: { surge: 6, trail: 3 }, pendingRoll: roll("r2", ["surge"]) },
    { type: "complete", result: evaluate(1337), id: "r2", cooldownUntil: 100000, at: 2 },
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
  expect(armedSkills({ ...base, skillCharge: { surge: 6, trail: 6 } })).toEqual([
    "surge",
    "trail",
  ]);
  // An equipped skill that is not unlocked never arms, whatever the charge says.
  const forged = { ...base, skills: ["trail"], skillCharge: { surge: 6, trail: 6 } };
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
  const scored = (p, id) => p.history.find((e) => e.type === "roll" && e.id === id);
  expect(scored(settled, "r1").ep).toBe(scored(plain, "r2").ep);
  expect(scored(settled, "r1").number).toBe(scored(plain, "r2").number);
  expect(scored(settled, "r1").tier).toBe(scored(plain, "r2").tier);
  expect(scored(settled, "r1").badges).toEqual(scored(plain, "r2").badges);
  // Only the wallet moves, and the receipt says which skills did it.
  expect(settled.balance - 1000000).toBe(result.totalEP * 2);
  expect(scored(settled, "r1").walletMultiplier).toBe(2);
  expect(scored(settled, "r1").walletBonus).toBe(result.totalEP);
  expect(scored(settled, "r1").skills).toEqual(["surge"]);
  // A companion, a skill and the ultra bonus all multiply banked EP together.
  const combined = applyProgress(
    {
      ...fund(0, {
        owned: ["surge"],
        skills: ["surge"],
        equippedSkills: ["surge"],
        pets: ["dragonet"],
        activePet: "dragonet",
        ultraRebirths: 2,
      }),
      pendingRoll: roll("r3", ["surge"]),
    },
    { type: "complete", result, id: "r3", cooldownUntil: 100000, at: 2 },
  );
  const multiplier = 2 * petById.get("dragonet").multiplier * (1 + 0.1 * 2);
  expect(walletMultiplier({ activePet: "dragonet", ultraRebirths: 2 }, ["surge"])).toBeCloseTo(multiplier, 6);
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
      JSON.stringify({ ...base, skillCharge: { surge: skillById.get("surge").charges + 1 } }),
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
  expect(() =>
    parsePending(pending({ draws: [604827, 12] })),
  ).toThrow(/Invalid committed roll/);
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

test("rebirth keeps everything it earned, grants the ladder skill and clears the auras", () => {
  const state = fund(5000000, {
    profile: { id: "p", username: "Tester", createdAt: 1 },
    discovered: ids.slice(0, Math.ceil(BADGE_TOTAL * 0.5)),
    owned: ["quickwind-1", "starfall", "flywheel", "skill-bay-1"],
    equipped: "starfall",
    pets: ["pebble"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    skillCharge: { surge: 4 },
    flywheelCharge: 3,
    history: [{ id: "old", type: "roll", at: 1, number: 5, tier: "trash", ep: 1, badges: [] }],
    receipts: ["old"],
  });
  expect(REBIRTH_STEPS[0]).toBe(0.5);
  const reborn = applyProgress(state, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 200000,
    eventId: "ev1",
  });
  expect(reborn.rebirths).toBe(1);
  expect(reborn.balance).toBe(5000000);
  expect(reborn.owned).toEqual(["quickwind-1", "flywheel", "skill-bay-1"]);
  expect(reborn.equipped).toBe("none");
  expect(reborn.pets).toEqual(["pebble"]);
  expect(reborn.skillCharge).toEqual({ surge: 4 });
  expect(reborn.flywheelCharge).toBe(3);
  expect(reborn.discovered).toEqual([]);
  expect(reborn.pendingRoll).toBeNull();
  expect(reborn.cooldownUntil).toBe(0);
  expect(reborn.receipts).toEqual([]);
  // The ladder skill arrives unlocked and takes a free slot; the activity
  // history restarts with the rebirth that opened the cycle.
  const granted = rebirthSkill(1);
  expect(reborn.skills).toContain(granted.id);
  expect(reborn.equippedSkills).toContain(granted.id);
  expect(reborn.history).toHaveLength(1);
  expect(reborn.history[0]).toMatchObject({
    id: "ev1",
    type: "rebirth",
    count: 1,
    skill: granted.id,
  });
  expect(parseProgress(JSON.stringify(reborn)).skills).toContain(granted.id);
  // The next rung asks for ten points more, and the collection has to be
  // rediscovered before it can be claimed.
  expect(REBIRTH_STEPS[1]).toBe(0.6);
  expect(() =>
    applyProgress(reborn, { type: "rebirth", expectedRebirths: 1, at: 200000 }),
  ).toThrow(/Discover/);
});

test("the ultra-rebirth only exists at the top of the ladder and resets everything for a permanent bonus", () => {
  const top = fund(9000000, {
    profile: { id: "p", username: "Tester", createdAt: 1 },
    discovered: ids,
    owned: ["quickwind-1", "starfall"],
    equipped: "starfall",
    pets: ["pebble"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
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
  // And not without the whole collection.
  expect(() =>
    applyProgress(
      { ...top, discovered: ids.slice(0, 10) },
      { type: "ultra-rebirth", expectedUltraRebirths: 1, at: 200000 },
    ),
  ).toThrow(/Discover all/);
  const reborn = applyProgress(top, {
    type: "ultra-rebirth",
    expectedUltraRebirths: 1,
    at: 200000,
    eventId: "u2",
  });
  expect(reborn.ultraRebirths).toBe(2);
  expect(reborn.profile).toEqual(top.profile);
  expect(reborn.balance).toBe(0);
  expect(reborn.discovered).toEqual([]);
  expect(reborn.owned).toEqual([]);
  expect(reborn.pets).toEqual([]);
  expect(reborn.skills).toEqual([]);
  expect(reborn.equippedSkills).toEqual([]);
  expect(reborn.skillCharge).toEqual({});
  expect(reborn.rebirths).toBe(0);
  expect(reborn.history).toHaveLength(1);
  expect(reborn.history[0]).toMatchObject({ type: "ultra-rebirth", count: 2 });
  // The bonus is permanent and multiplies banked EP only: +10% per ultra.
  expect(ULTRA_BONUS_PER_REBIRTH).toBe(0.1);
  expect(walletMultiplier({ activePet: "none", ultraRebirths: 3 })).toBeCloseTo(1.3, 6);
  const result = evaluate(1337);
  const credited = applyProgress(
    { ...reborn, balance: 0, totalEarned: 0, pendingRoll: { id: "u", number: 1337, startedAt: 1, rollMS: 45000, cooldownMS: 60000 } },
    { type: "complete", result, id: "u", cooldownUntil: 2, at: 3 },
  );
  expect(credited.balance).toBe(Math.round(result.totalEP * 1.2));
  expect(credited.history.find((e) => e.type === "roll").ep).toBe(result.totalEP);
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
