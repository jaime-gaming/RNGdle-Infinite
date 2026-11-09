import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import {
  drawPlanFor,
  skillById,
  skillEffectChips,
  skillEffectSummary,
  skillForPet,
  skillSlots,
} from "../src/skills.js";
import { rackReport } from "../src/rack.js";
import {
  applyProgress,
  emptyProgress,
  loadoutName,
  parseProgress,
  LOADOUT_LIMIT,
} from "../src/progress.js";
import { PETS, petById } from "../src/pets.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import {
  REBIRTH_BONUS_PER_REBIRTH,
  ULTRA_BONUS_PER_REBIRTH,
} from "../src/rebirth.js";

const ids = allBadgeMetadata.map((badge) => badge.id);
const armed = (extra = {}) => ({
  ...emptyProgress(),
  ...extra,
});

test("every skill states its contribution in a short, numeric chip", () => {
  for (const pet of PETS) {
    const chip = skillEffectChips(skillForPet(pet.id))[0];
    expect(typeof chip).toBe("string");
    expect(chip.length).toBeGreaterThan(0);
    expect(chip.length).toBeLessThanOrEqual(34);
  }
  expect(skillEffectChips({ kind: "wallet", value: 2 })).toEqual([
    "×2 banked EP",
    "multiplier, wallet only",
  ]);
  expect(skillEffectChips({ kind: "waive" })).toEqual([
    "no cooldown",
    "full reveal still plays",
  ]);
  expect(
    skillEffectChips({ kind: "floor", floor: 25000, attempts: 4 })[0],
  ).toBe("never below 25,000 EP");
  expect(skillEffectChips({ kind: "best-of", attempts: 2 })[0]).toBe(
    "2 draws, best kept",
  );
  expect(skillEffectChips({ kind: "pet-luck", value: 4 })[0]).toBe(
    "×4 companion luck",
  );
});

test("the rack adds up its own effects, and only for the skills it holds", () => {
  const bare = rackReport(emptyProgress());
  expect(bare.slots).toBe(2);
  expect(bare.used).toBe(0);
  expect(bare.next.chips).toEqual([]);
  expect(bare.next.walletMultiplier).toBe(1);
  expect(bare.next.attempts).toBe(1);

  const armedSurge = rackReport(
    armed({
      owned: ["surge"],
      skills: ["surge"],
      equippedSkills: ["surge"],
      skillCharge: { surge: 6 },
    }),
  );
  expect(armedSurge.armed).toEqual(["surge"]);
  expect(armedSurge.next.walletMultiplier).toBe(2);
  expect(armedSurge.next.chips).toContain("×2 banked EP");
  expect(armedSurge.equipped[0].charge).toBe(6);

  const charging = rackReport(
    armed({
      owned: ["surge"],
      skills: ["surge"],
      equippedSkills: ["surge"],
      skillCharge: { surge: 2 },
    }),
  );
  expect(charging.armed).toEqual([]);
  expect(charging.next.walletMultiplier).toBe(1);
  expect(charging.next.chips).toEqual([]);
});

test("rebirth bonuses are named parts of the wallet total", () => {
  const reborn = rackReport(armed({ rebirths: 2 }));
  expect(reborn.next.walletMultiplier).toBeCloseTo(
    1 + REBIRTH_BONUS_PER_REBIRTH * 2,
    6,
  );
  expect(reborn.next.walletParts).toEqual([
    {
      id: "rebirth",
      label: "Rebirths ×2",
      value: 1 + REBIRTH_BONUS_PER_REBIRTH * 2,
    },
  ]);

  const stacked = rackReport(
    armed({
      rebirths: 1,
      ultraRebirths: 1,
      pets: ["pebble"],
      activePet: "pebble",
    }),
  );
  expect(stacked.next.walletParts.map((part) => part.id)).toEqual([
    "pet:pebble",
    "rebirth",
    "ultra",
  ]);
  expect(stacked.next.walletMultiplier).toBeCloseTo(
    petById.get("pebble").multiplier * 1.02 * 1.1,
    6,
  );
});

test("a companion and a prestige bonus are part of the same total", () => {
  const report = rackReport(
    armed({
      owned: ["surge"],
      skills: ["surge"],
      equippedSkills: ["surge"],
      skillCharge: { surge: 6 },
      pets: ["kit"],
      activePet: "kit",
      ultraRebirths: 2,
    }),
  );

  expect(report.next.walletMultiplier).toBeCloseTo(
    petById.get("kit").multiplier * (1 + ULTRA_BONUS_PER_REBIRTH * 2) * 2,
    6,
  );
  expect(report.next.walletParts.map((part) => part.label)).toEqual([
    "Static Kit companion",
    "Prestige ×2",
    "Surge",
  ]);
  expect(report.walletSummary).toContain("Static Kit companion +13%");
});

test("draw skills are reported as one plan, never as a taller total", () => {
  const report = rackReport(
    armed({
      owned: ["twice", "bedrock"],
      skills: ["twice", "bedrock"],
      equippedSkills: ["twice", "bedrock"],
      skillCharge: { twice: 10, bedrock: 8 },
    }),
  );

  expect(report.next).toMatchObject({ attempts: 6, floor: 25000 });
  expect(report.next.chips).toEqual([
    "6 draws · 2 numbers paid",
    "never below 25,000 EP",
  ]);
  expect(drawPlanFor(["twice", "bedrock"])).toEqual({
    attempts: 6,
    floor: 25000,
    keeps: 2,
  });
});

test("Flywheel and Auto-Roll appear in the record without touching the sums", () => {
  const report = rackReport(
    armed({
      owned: ["flywheel", "auto-roll"],
      flywheelCharge: 4,
    }),
  );
  expect(report.flywheel).toMatchObject({
    owned: true,
    charge: 4,
    ready: true,
  });
  expect(report.next.cooldownFree).toBe(true);
  expect(report.next.chips).toContain("no cooldown");

  expect(report.next.walletMultiplier).toBe(1);
  expect(report.next.attempts).toBe(1);
});

test("the rack never reports more slots or effects than the save allows", () => {
  const report = rackReport(
    armed({
      owned: ["surge", "trail", "bounce"],
      skills: ["surge", "trail", "bounce"],
      equippedSkills: ["surge", "trail", "bounce"],
      skillCharge: { surge: 6 },
    }),
  );

  expect(skillSlots(["surge", "trail", "bounce"])).toBe(2);
  expect(report.used).toBeLessThanOrEqual(report.slots);

  for (const skill of report.equipped)
    expect(skill.effect).toBe(skillEffectSummary(skillById.get(skill.id)));
});

test("the rack report counts slots in shop skills, with free skills beside them", () => {
  const report = rackReport(
    armed({
      owned: ["surge", "trail"],
      skills: ["surge", "trail", "reborn-drive"],
      equippedSkills: ["surge", "trail", "reborn-drive"],
      skillCharge: { surge: 6 },
    }),
  );
  expect(report.slots).toBe(2);

  expect(report.used).toBe(2);
  expect(report.equipped.map((skill) => skill.id)).toEqual([
    "surge",
    "trail",
    "reborn-drive",
  ]);
});

const rack = (extra = {}) => ({
  ...armed({
    profile: { id: "tester", username: "Tester", createdAt: 0 },
    owned: ["surge", "trail", "bounce", "skill-bay-1"],
    skills: ["surge", "trail", "bounce"],
    equippedSkills: ["surge", "trail"],
  }),
  ...extra,
});

test("a rack can be saved, applied and deleted, and none of it costs anything", () => {
  const saved = applyProgress(rack(), { type: "save-loadout" });
  expect(saved.loadouts).toHaveLength(1);
  expect(saved.loadouts[0].skills).toEqual(["surge", "trail"]);

  expect(saved.loadouts[0].name).toBe("Surge + Trail");

  expect(saved.balance).toBe(rack().balance);
  expect(saved.history).toEqual(rack().history);
  expect(saved.skillCharge).toEqual(rack().skillCharge);

  expect(applyProgress(saved, { type: "save-loadout" })).toBe(saved);

  const second = applyProgress(
    { ...saved, equippedSkills: ["bounce"] },
    { type: "save-loadout" },
  );
  expect(second.loadouts).toHaveLength(2);

  const applied = applyProgress(second, {
    type: "apply-loadout",
    id: second.loadouts[0].id,
  });
  expect(applied.equippedSkills).toEqual(["surge", "trail"]);
  expect(applied.history).toEqual(rack().history);

  const deleted = applyProgress(second, {
    type: "delete-loadout",
    id: second.loadouts[0].id,
  });
  expect(deleted.loadouts.map((entry) => entry.id)).toEqual([
    second.loadouts[1].id,
  ]);

  expect(applyProgress(deleted, { type: "delete-loadout", id: "nope" })).toBe(
    deleted,
  );
});

test("saved racks respect the rack they land in", () => {
  expect(() =>
    applyProgress(rack({ equippedSkills: [] }), { type: "save-loadout" }),
  ).toThrow(/worth saving/);

  const full = rack({
    equippedSkills: ["bounce"],
    loadouts: Array.from({ length: LOADOUT_LIMIT }, (_, i) => ({
      id: `rack-x${i}`,
      name: `Rack ${i}`,
      skills: ["surge"],
    })),
  });
  expect(() => applyProgress(full, { type: "save-loadout" })).toThrow(
    /saved racks/,
  );

  const saved = applyProgress(rack(), { type: "save-loadout" });
  expect(() =>
    applyProgress(
      { ...saved, owned: [], skills: [], equippedSkills: [] },
      { type: "apply-loadout", id: saved.loadouts[0].id },
    ),
  ).toThrow(/unlocked/);

  const half = applyProgress(
    { ...saved, owned: ["surge"], skills: ["surge"], equippedSkills: [] },
    { type: "apply-loadout", id: saved.loadouts[0].id },
  );
  expect(half.equippedSkills).toEqual(["surge"]);

  expect(() =>
    applyProgress(saved, { type: "apply-loadout", id: "gone" }),
  ).toThrow(/gone/);

  const three = applyProgress(
    rack({
      owned: ["surge", "trail", "bounce"],
      skills: ["surge", "trail", "bounce"],
      equippedSkills: ["surge", "trail", "bounce"],
    }),
    { type: "save-loadout" },
  );
  const narrow = applyProgress(
    { ...three, owned: ["surge", "trail", "bounce"], equippedSkills: [] },
    { type: "apply-loadout", id: three.loadouts[0].id },
  );
  expect(narrow.equippedSkills).toHaveLength(
    skillSlots(["surge", "trail", "bounce"]),
  );
});

test("a saved rack keeps its free skills when the slots run out", () => {
  const mixed = rack({
    owned: ["surge", "trail", "bounce"],
    skills: ["surge", "trail", "bounce", "reborn-drive"],
    equippedSkills: ["surge", "trail", "bounce", "reborn-drive"],
  });
  const saved = applyProgress(mixed, { type: "save-loadout" });
  expect(saved.loadouts[0].skills).toEqual([
    "surge",
    "trail",
    "bounce",
    "reborn-drive",
  ]);
  const narrow = applyProgress(
    { ...saved, equippedSkills: [] },
    { type: "apply-loadout", id: saved.loadouts[0].id },
  );

  expect(narrow.equippedSkills).toEqual(["surge", "trail", "reborn-drive"]);
});

test("saved racks survive a reload, are repaired when damaged and kept through rebirth", () => {
  const saved = applyProgress(rack(), { type: "save-loadout" });

  const parsed = parseProgress(
    JSON.stringify({
      ...saved,
      loadouts: [
        ...saved.loadouts,
        { id: "no-skills", skills: [] },
        { id: "bad-skill", skills: ["not-a-skill", 7] },
        null,
        "rack",
        { skills: ["surge"] },
      ],
    }),
  );
  expect(parsed.loadouts).toHaveLength(1);
  expect(parsed.loadouts[0].skills).toEqual(["surge", "trail"]);

  const unnamed = parseProgress(
    JSON.stringify({ ...saved, loadouts: [{ id: "a", skills: ["surge"] }] }),
  );
  expect(unnamed.loadouts[0].name).toBe("Surge");
  expect(loadoutName(["surge", "trail", "bounce"])).toBe("Surge + 2 more");
  expect(loadoutName([])).toBe("Empty rack");

  const many = parseProgress(
    JSON.stringify({
      ...saved,
      loadouts: Array.from({ length: LOADOUT_LIMIT + 5 }, (_, i) => ({
        id: `rack-x${i}`,
        skills: ["surge"],
      })),
    }),
  );
  expect(many.loadouts).toHaveLength(LOADOUT_LIMIT);

  const ladder = {
    ...saved,
    discovered: ids.slice(0, 60),
    balance: 9_000_000,
    totalEarned: 20_000_000,
    cycleEarnedEP: 9_000_000,
    rebirths: 0,
    ultraRebirths: 0,
  };
  const reborn = applyProgress(ladder, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 1_800_000_000_000,
  });
  expect(reborn.loadouts).toEqual(saved.loadouts);
  expect(reborn.skills).toContain("reborn-drive");
});
