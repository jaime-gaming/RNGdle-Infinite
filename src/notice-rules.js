import { EPIC_OR_BETTER } from "./tasks.js";

export function newlyReady(before, after) {
  return Math.max(0, after - before);
}

export function freshRareBadges(before, after, lookup) {
  const seen = new Set(before);
  return after
    .filter((id) => !seen.has(id))
    .map((id) => lookup(id))
    .filter((badge) => badge && EPIC_OR_BETTER.includes(badge.rarity));
}
