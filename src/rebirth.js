import { allBadgeMetadata } from "./infinite-badges.js";
import { shopProducts } from "./shop-data.js";
import { rebirthSkills } from "./skills.js";

export const BADGE_TOTAL = allBadgeMetadata.length;
const badgeIds = new Set(allBadgeMetadata.map((b) => b.id));

// Rebirth is a collection milestone, not a spending one. Cosmetic auras and
// optional tools are deliberately excluded from the requirement, and no
// purchase unlocks or blocks a step.
export const REBIRTH_OPTIONAL_KINDS = ["aura", "utility", "offline-cap"];
export const rebirthOptionalProducts = shopProducts
  .filter((product) => REBIRTH_OPTIONAL_KINDS.includes(product.kind))
  .map((product) => product.id);
const optional = new Set(rebirthOptionalProducts);

export function rebirthRelevantPurchases(owned = []) {
  return owned.filter((id) => !optional.has(id));
}

// The ladder used to demand all 235 badges at once, which made it effectively
// unreachable. It now climbs: the icon appears at 30% of the collection, the
// first rebirth is available at 50%, and every finished cycle raises the bar
// by ten points until the collection itself is the requirement.
export const REBIRTH_VISIBLE_AT = Math.ceil(BADGE_TOTAL * 0.3);
export const REBIRTH_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const REBIRTH_TOTAL = REBIRTH_STEPS.length;

// Everything an ultra-rebirth grants on top of the cosmetic mark: a permanent,
// always-on wallet bonus. It multiplies banked EP only, exactly like a
// companion, so the scored roll and its rank stay identical for everyone.
export const ULTRA_BONUS_PER_REBIRTH = 0.1;

export function ultraRebirthMultiplier(ultraRebirths = 0) {
  return 1 + ULTRA_BONUS_PER_REBIRTH * Math.max(0, ultraRebirths);
}

// Rebirth stays completely out of sight until the ladder unlocks: no badge, no
// teaser, no counter. The nav entry, the page and the help page all ask this one
// question, so the reveal can never be half-done.
export function rebirthUnlocked(progress) {
  return (
    discoveredCount(progress) >= REBIRTH_VISIBLE_AT ||
    (progress.rebirths ?? 0) > 0 ||
    (progress.ultraRebirths ?? 0) > 0
  );
}

export function discoveredCount(progress) {
  return new Set(progress.discovered.filter((id) => badgeIds.has(id))).size;
}

// How many badges the next rebirth needs, and what that is in percent. Null
// once the whole ladder is complete.
export function rebirthRequirement(rebirths = 0) {
  const step = REBIRTH_STEPS[rebirths];
  if (step == null) return null;
  return {
    rebirth: rebirths + 1,
    percent: Math.round(step * 100),
    badges: Math.ceil(BADGE_TOTAL * step),
  };
}

export function nextRebirthSkill(rebirths = 0) {
  return rebirthSkills.find((skill) => skill.rebirth === rebirths + 1) ?? null;
}

function commitmentBlocker(progress, now) {
  if (progress.pendingRoll || progress.offline?.batch)
    return "Finish your committed rolls before rebirthing.";
  if (now < progress.cooldownUntil)
    return "Wait for the current cooldown to finish.";
  return "";
}

export function rebirthBlocker(progress, now) {
  const requirement = rebirthRequirement(progress.rebirths ?? 0);
  if (!requirement)
    return `The rebirth ladder is complete. Ultra-rebirth is unlocked at ${BADGE_TOTAL} badges.`;
  const count = discoveredCount(progress);
  if (count < requirement.badges)
    return `Discover ${requirement.badges} badges (${requirement.percent}%) to rebirth. ${requirement.badges - count} to go.`;
  return commitmentBlocker(progress, now);
}

export function rebirthReady(progress, now) {
  return (
    discoveredCount(progress) >=
      (rebirthRequirement(progress.rebirths ?? 0)?.badges ?? BADGE_TOTAL) &&
    !commitmentBlocker(progress, now)
  );
}

// An ultra-rebirth needs the last rung of the ladder and a complete
// collection. It is optional: a completed ladder is a legitimate resting
// place, and the button only ever appears once the requirement is met.
export function ultraRebirthBlocker(progress, now) {
  if ((progress.rebirths ?? 0) < REBIRTH_TOTAL)
    return `Finish the whole rebirth ladder first: ${REBIRTH_TOTAL - (progress.rebirths ?? 0)} rebirths to go.`;
  if (discoveredCount(progress) !== BADGE_TOTAL)
    return `An ultra-rebirth starts everything over. Discover all ${BADGE_TOTAL} badges first.`;
  return commitmentBlocker(progress, now);
}

export function ultraRebirthAvailable(progress, now) {
  return (
    (progress.rebirths ?? 0) >= REBIRTH_TOTAL &&
    discoveredCount(progress) === BADGE_TOTAL &&
    !commitmentBlocker(progress, now)
  );
}
