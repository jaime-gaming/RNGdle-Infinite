import { allBadgeMetadata } from "./infinite-badges.js";
export const BADGE_TOTAL = allBadgeMetadata.length;
export const REBIRTH_VISIBLE_AT = Math.ceil(BADGE_TOTAL * 0.6);
const badgeIds = new Set(allBadgeMetadata.map((b) => b.id));
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
