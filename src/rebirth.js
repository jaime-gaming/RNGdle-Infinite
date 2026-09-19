import { allBadgeMetadata } from "./infinite-badges.js";
import { shopProducts } from "./shop-data.js";
export const BADGE_TOTAL = allBadgeMetadata.length;
export const REBIRTH_VISIBLE_AT = Math.ceil(BADGE_TOTAL * 0.6);
const badgeIds = new Set(allBadgeMetadata.map((b) => b.id));

// Rebirth is a collection milestone, not a spending one. Cosmetic auras and
// optional tools are deliberately excluded: they are convenience and
// appearance, so buying them is never a precondition for starting a new cycle.
export const REBIRTH_OPTIONAL_KINDS = ["aura", "utility", "offline-cap"];
export const rebirthOptionalProducts = shopProducts
  .filter((product) => REBIRTH_OPTIONAL_KINDS.includes(product.kind))
  .map((product) => product.id);
const optional = new Set(rebirthOptionalProducts);

// Only purchases that are actually required would ever be counted; auras and
// tools drop out here so no amount of shopping can gate or unlock a rebirth.
export function rebirthRelevantPurchases(owned = []) {
  return owned.filter((id) => !optional.has(id));
}

export function discoveredCount(progress) {
  return new Set(progress.discovered.filter((id) => badgeIds.has(id))).size;
}
export function rebirthBlocker(progress, now) {
  if (discoveredCount(progress) !== BADGE_TOTAL)
    return `Discover all ${BADGE_TOTAL} badges to rebirth.`;
  if (progress.pendingRoll || progress.offline?.batch)
    return "Finish your committed rolls before rebirthing.";
  if (now < progress.cooldownUntil)
    return "Wait for the current cooldown to finish.";
  return "";
}
