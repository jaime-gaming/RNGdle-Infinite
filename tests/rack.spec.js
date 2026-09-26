import { test, expect } from "@playwright/test";
import {
  drawPlanFor,
  skillById,
  skillEffectChips,
  skillEffectSummary,
  skillForPet,
  skillSlots,
} from "../src/skills.js";
import { rackReport } from "../src/rack.js";
import { emptyProgress } from "../src/progress.js";
import { PETS, petById } from "../src/pets.js";
import { ULTRA_BONUS_PER_REBIRTH } from "../src/rebirth.js";

// The rack report is the single place that adds the active effects up: the
// corner summary on the Roll page and the skills shelf in the shop both read
// it, so a player never has to do the arithmetic in their head.
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

  // Surge armed: it fires on the next roll, so the total moves.
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

  // Charging, not armed: equipped but worth nothing yet.
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

test("a companion and an ultra-rebirth bonus are part of the same total", () => {
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
  // 1.13 companion × 1.2 ultra × 2 Surge, each part named.
  expect(report.next.walletMultiplier).toBeCloseTo(
    petById.get("kit").multiplier * (1 + ULTRA_BONUS_PER_REBIRTH * 2) * 2,
    6,
  );
  expect(report.next.walletParts.map((part) => part.label)).toEqual([
    "Static Kit companion",
    "Ultra-rebirth ×2",
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
  // The same collapse the draw itself uses: more attempts, the higher floor.
  expect(report.next).toMatchObject({ attempts: 4, floor: 25000 });
  expect(report.next.chips).toEqual([
    `${4} draws, best kept`,
    "never below 25,000 EP",
  ]);
  expect(drawPlanFor(["twice", "bedrock"])).toEqual({
    attempts: 4,
    floor: 25000,
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
  // Auto-Roll is a tool: it never adds a multiplier or an extra draw.
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
  // Two slots by default, and the report refuses to show more.
  expect(skillSlots(["surge", "trail", "bounce"])).toBe(2);
  expect(report.used).toBeLessThanOrEqual(report.slots);
  // The description of each contribution is the same sentence the tooltip and
  // the screen reader get.
  for (const skill of report.equipped)
    expect(skill.effect).toBe(skillEffectSummary(skillById.get(skill.id)));
});
