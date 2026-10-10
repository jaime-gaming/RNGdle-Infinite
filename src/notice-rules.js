import { EPIC_OR_BETTER } from "./tasks.js";

// When a notice is worth a card. These are plain functions, so the rules can be
// tested without rendering the app. The App calls them when the save changes.

// How many more tasks can be claimed than when last looked. A rise is news; a
// fall (a claim, or a new reset) is not.
export function newlyReady(before, after) {
  return Math.max(0, after - before);
}

// The badges a change in the discovered list has just found, kept to Epic or
// better. `lookup` maps a badge id to its metadata, which carries the rarity.
export function freshRareBadges(before, after, lookup) {
  const seen = new Set(before);
  return after
    .filter((id) => !seen.has(id))
    .map((id) => lookup(id))
    .filter((badge) => badge && EPIC_OR_BETTER.includes(badge.rarity));
}
