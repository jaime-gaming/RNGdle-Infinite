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
  skillTakesSlot,
  skillWaivesCooldown,
  skillWalletMultiplier,
  trimToSlots,
  unlockedSkills,
} from "./skills.js";
import { flywheelRequired } from "./flywheel.js";
import { petById } from "./pets.js";
import {
  REBIRTH_BONUS_PER_REBIRTH,
  REBIRTH_TOTAL,
  ULTRA_BONUS_PER_REBIRTH,
  surplusMultiplier,
} from "./rebirth.js";

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
// Exported so the roll result can itemise the same bonus the rack quotes.
export function walletParts(progress, armed) {
  const parts = [];
  const pet = petById.get(progress.activePet);
  if (pet && pet.multiplier > 1)
    parts.push({
      id: `pet:${pet.id}`,
      label: `${pet.name} companion`,
      value: pet.multiplier,
    });
  const rebirths = progress.rebirths ?? 0;
  if (rebirths > 0)
    parts.push({
      id: "rebirth",
      label: `Rebirths ×${rebirths}`,
      value: 1 + REBIRTH_BONUS_PER_REBIRTH * rebirths,
    });
  const ultras = progress.ultraRebirths ?? 0;
  if (ultras > 0)
    parts.push({
      id: "ultra",
      label: `Ultra-rebirth ×${ultras}`,
      value: 1 + ULTRA_BONUS_PER_REBIRTH * ultras,
    });
  const surplus = progress.surplusBanked ?? 0;
  if (surplus > 0)
    parts.push({
      id: "surplus",
      label: `Surplus +${surplus}%`,
      value: surplusMultiplier(surplus),
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
  // Free skills ride beside the slots, so they are never the ones trimmed.
  const equipped = trimToSlots(
    [...new Set(progress.equippedSkills ?? [])],
    slots,
  )
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
  const equippedSet = new Set(equipped.map((skill) => skill.id));
  const unlocked = unlockedSkills(progress)
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
      equipped: equippedSet.has(skill.id),
    }));
  const passives = [];
  const pet = petById.get(progress.activePet);
  if (pet && pet.multiplier > 1)
    passives.push({
      id: `pet:${pet.id}`,
      kind: "pet",
      petId: pet.id,
      name: `${pet.name} companion`,
      chip: `+${Math.round((pet.multiplier - 1) * 100)}% EP`,
      value: pet.multiplier,
      tint: "green",
      fraction: 1,
      effect: `Banks ×${Number(pet.multiplier.toFixed(2))} EP on every roll (wallet only)`,
      meta: "Active companion · always on",
    });
  const rebirths = progress.rebirths ?? 0;
  if (rebirths > 0)
    passives.push({
      id: "rebirth",
      kind: "rebirth",
      name: `Rebirths ×${rebirths}`,
      chip: `+${Math.round(REBIRTH_BONUS_PER_REBIRTH * 100 * rebirths)}% EP`,
      value: 1 + REBIRTH_BONUS_PER_REBIRTH * rebirths,
      tint: "green",
      fraction: Math.min(1, rebirths / REBIRTH_TOTAL),
      effect: `Permanent +${Math.round(REBIRTH_BONUS_PER_REBIRTH * 100 * rebirths)}% banked EP from ${rebirths} rebirth${rebirths === 1 ? "" : "s"}`,
      meta: `${rebirths} / ${REBIRTH_TOTAL} rebirth rungs · always on`,
    });
  const ultras = progress.ultraRebirths ?? 0;
  if (ultras > 0)
    passives.push({
      id: "ultra",
      kind: "ultra",
      name: `Ultra-rebirth ×${ultras}`,
      chip: `+${Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% EP`,
      value: 1 + ULTRA_BONUS_PER_REBIRTH * ultras,
      tint: "gold",
      fraction: 1,
      effect: `Permanent +${Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% banked EP from ${ultras} ultra-rebirth${ultras === 1 ? "" : "s"}`,
      meta: "Beyond the ladder · always on",
    });
  const surplus = progress.surplusBanked ?? 0;
  if (surplus > 0)
    passives.push({
      id: "surplus",
      kind: "surplus",
      name: `Surplus +${surplus}%`,
      chip: `+${surplus}% EP`,
      value: surplusMultiplier(surplus),
      tint: "gold",
      fraction: 1,
      effect: `Permanent +${surplus}% banked EP from cycle overshoot`,
      meta: "Rebirth surplus dividend · always on",
    });
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

  // "No cooldown" and "n draws" affect the next roll's shape: they are added
  // up here for display, and the plan they quote is the very same one the roll
  // spends — stacked draw budgets and all, inside the cap.
  const chips = [];
  if (plan)
    chips.push(
      plan.keeps > 1
        ? `${plan.attempts} draws · ${plan.keeps} numbers paid`
        : `${plan.attempts} draws, best kept`,
    );
  if (plan?.floor) chips.push(`never below ${amount(plan.floor)} EP`);
  if (walletMultiplier > 1) chips.push(`${times(walletMultiplier)} banked EP`);
  if (petLuck > 1) chips.push(`${times(petLuck)} companion luck`);
  if (chargeFactor > 1) chips.push(`${times(chargeFactor)} charge`);
  if (absorbs) chips.push("no cooldown");

  return {
    slots,
    // The slots only hold shop skills: rebirth rewards and companion
    // signatures ride free, so "used" counts the shop skills alone.
    used: equipped.filter((skill) => skillTakesSlot(skill.id)).length,
    equipped,
    unlocked,
    passives,
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
