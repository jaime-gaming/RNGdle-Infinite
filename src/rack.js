import {
  drawPlanFor,
  skillArmed,
  skillById,
  skillChargeFactor,
  skillChargeOf,
  skillEffectChips,
  skillEffectSummary,
  skillPetLuck,
  skillSlots,
  skillWaivesCooldown,
  skillWalletMultiplier,
} from "./skills.js";
import { flywheelRequired } from "./flywheel.js";
import { petById } from "./pets.js";
import { ULTRA_BONUS_PER_REBIRTH } from "./rebirth.js";

// What the rack adds up to.
//
// Everything a player owns is described somewhere, but the *total* was only
// visible by adding it up in your head: Surge doubles banked EP, Double Vision
// draws twice, Bedrock sets a floor, the companion and the ultra-rebirth bonus
// multiply again. This module collects those numbers in one place so the rack,
// the shop and the activity feed all quote the same figures.
//
// It is presentation only. Nothing here can change a draw, a score or a price.

const amount = (value) => Math.round(value).toLocaleString("en-US");
const times = (value) => `×${Number(value.toFixed(2))}`;

// The effects of one skill, short enough for a chip: "×2 wallet EP",
// "2 draws, best kept", "floor 25,000 EP".
export function skillEffectChip(skill) {
  return skillEffectChips(skill)[0] ?? skillEffectSummary(skill);
}

// The multiplier a roll actually banks, and where every part of it comes from.
function walletParts(progress, armed) {
  const parts = [];
  const pet = petById.get(progress.activePet);
  if (pet && pet.multiplier > 1)
    parts.push({
      id: `pet:${pet.id}`,
      label: `${pet.name} companion`,
      value: pet.multiplier,
    });
  const ultras = progress.ultraRebirths ?? 0;
  if (ultras > 0)
    parts.push({
      id: "ultra",
      label: `Ultra-rebirth ×${ultras}`,
      value: 1 + ULTRA_BONUS_PER_REBIRTH * ultras,
    });
  for (const id of armed) {
    if (skillById.get(id)?.kind === "wallet")
      parts.push({
        id,
        label: skillById.get(id).name,
        value: skillById.get(id).value,
      });
  }
  return parts;
}

// `progress` is any object with owned/equippedSkills/skillCharge/flywheelCharge
// and the wallet multipliers, i.e. a save plus its derived state.
export function rackReport(progress = {}) {
  const slots = skillSlots(progress.owned ?? []);
  // The save already refuses more skills than the rack holds; the report
  // enforces the same ceiling so a hand-edited object cannot overstate it.
  const equipped = [...new Set(progress.equippedSkills ?? [])]
    .slice(0, slots)
    .map((id) => skillById.get(id))
    .filter(Boolean)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      icon: skill.icon,
      tint: skill.tint,
      effect: skillEffectSummary(skill),
      chip: skillEffectChip(skill),
      charges: skill.charges,
      charge: skillChargeOf(progress, skill.id),
      armed: skillArmed(progress, skill.id),
    }));
  const armedIds = equipped.filter((skill) => skill.armed).map((s) => s.id);
  const plan = drawPlanFor(armedIds);
  const parts = walletParts(progress, armedIds);
  const walletMultiplier = parts.reduce((total, part) => total * part.value, 1);
  const petLuck = skillPetLuck(armedIds);
  const chargeFactor = skillChargeFactor(armedIds);
  const ownsFlywheel = (progress.owned ?? []).includes("flywheel");
  const flywheelNeeded = flywheelRequired(progress.owned ?? []);
  const flywheelCharge = progress.flywheelCharge ?? 0;
  const flywheelReady = ownsFlywheel && flywheelCharge >= flywheelNeeded;
  const absorbs = skillWaivesCooldown(armedIds) || flywheelReady;

  // "No cooldown" and "n draws" affect the next roll's shape: they are summed
  // for display only and never combined into a draw the game would not make.
  const chips = [];
  if (plan) chips.push(`${plan.attempts} draws, best kept`);
  if (plan?.floor) chips.push(`never below ${amount(plan.floor)} EP`);
  if (walletMultiplier > 1) chips.push(`${times(walletMultiplier)} banked EP`);
  if (petLuck > 1) chips.push(`${times(petLuck)} companion luck`);
  if (chargeFactor > 1) chips.push(`${times(chargeFactor)} charge`);
  if (absorbs) chips.push("no cooldown");

  return {
    slots,
    used: equipped.length,
    equipped,
    armed: armedIds,
    flywheel: {
      owned: ownsFlywheel,
      charge: flywheelCharge,
      required: flywheelNeeded,
      ready: flywheelReady,
    },
    next: {
      attempts: plan?.attempts ?? 1,
      floor: plan?.floor ?? 0,
      walletMultiplier,
      walletParts: parts,
      petLuck,
      chargeFactor,
      cooldownFree: absorbs,
      chips,
    },
    // The wallet multiplier in words, for tooltips that need one sentence.
    walletSummary:
      parts.length > 0
        ? parts
            .map((part) =>
              part.value >= 2
                ? `${part.label} ×${Number(part.value.toFixed(2))}`
                : `${part.label} +${Math.round((part.value - 1) * 100)}%`,
            )
            .join(" · ")
        : "No wallet bonuses yet",
  };
}
