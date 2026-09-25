// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.3",
    title: "one release: the shop, the rack, rebirth and the shelves",
    body: [
      "the shop opens as six buttons — skills, pace, companions, auras, offline, tools — and each one lands on its shelf.",
      "every button carries the one count that matters: slots used, current timings, companions found, EP per roll.",
      "every item is a card again: a preview of what it changes, the plain description, the price and one button. Long descriptions stay folded.",
      "the aura ladder grows to eighteen, Starfall to the Chrono Dial: six new finishes, each drawn on the rarity box.",
      "the skills shelf states the total: equipped skills, their charges, the banked-EP multiplier and what the next roll will get.",
      "three featured picks sit above the shelves, chosen from your goal and your wallet, and each one is only a doorway to its shelf.",
      "Auto-Roll is an ability in the rack. Click the circle to arm it, click again to stand it down.",
      "companions have their own artwork, walk the stage with a name plate, and a new one gets a proper entrance.",
      "any archived roll can be shared from History, with the badges and the EP that roll actually earned.",
      "rebirth has a full page: the ladder, the skill each step grants, what is kept and what resets, and the permanent ultra-rebirth bonus.",
      "rebirth stays completely hidden until it unlocks — no counter, no teaser.",
      "13 companions, only one equipped at a time, and the equipped one walks the roll screen.",
      "every companion carries its own exclusive skill, and the shop sells more.",
      "skills are circles in the top-left corner: full circle, and the next roll fires it. Flywheel lives in the same rack.",
      "your profile is a full page: how far you have come, and a one-way export of the save.",
      "the whole interface uses one hand-drawn icon set: one grid, one stroke weight, one filled accent per glyph.",
    ],
  },
  {
    version: "v0.2",
    title: "companions, cheaper upgrades and real URLs",
    body: [
      "companions multiply the EP you bank, never your odds: buy one, or find one at roughly 1 in 250 rolls.",
      "rebirth moved to the top bar with a ring that fills as your collection grows.",
      "shop prices dropped about 40% — the late game was a wall.",
      "light mode is fixed.",
      "pages have real URLs, so a shelf or a page can be bookmarked.",
      "sharing a result copies the link as well as the text.",
      "guest play is not saved, and the interface now says so plainly.",
    ],
  },
  {
    version: "v0.1",
    title: "launch",
    body: [
      "RNGdle Infinite is live: roll a number from 0 to 1,000,000 and find out what makes it special.",
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0].version;
export const SEEN_KEY = "rng-infinite-changelog-seen-v1";

export function readSeenVersion(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(SEEN_KEY);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function markSeen(
  version = LATEST_VERSION,
  storage = globalThis.localStorage,
) {
  try {
    storage?.setItem(SEEN_KEY, version);
    return true;
  } catch {
    return false;
  }
}

export function hasUnseenVersion(seen) {
  return seen !== LATEST_VERSION;
}
