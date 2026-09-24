// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.4",
    title: "the shop, the rack and rebirth, reorganised",
    body: [
      "the shop is five shelves and one sticky bar: search, filters and a count of what you can afford right now.",
      "every item is a single row now — an icon, what it changes, its price and its state. Long descriptions stay folded until you open them.",
      "the skills shelf states the total: equipped skills, their charges, the banked-EP multiplier and what the next roll will get.",
      "Auto-Roll is an ability in the rack. Click the circle to arm it, click again to stand it down.",
      "companions have their own artwork, walk the stage with a name plate, and a new one gets a proper entrance.",
      "any archived roll can be shared from History, with the badges and the EP that roll actually earned.",
      "rebirth has a full page: the ladder, the skill each step grants, what is kept and what resets, and the permanent ultra-rebirth bonus.",
      "rebirth stays completely hidden until it unlocks — no counter, no teaser.",
    ],
  },
  {
    version: "v0.3",
    title: "companions, skills and a rebirth you can actually reach",
    body: [
      "13 companions, only one equipped at a time, and the equipped one walks the roll screen.",
      "every companion carries its own exclusive skill, and the shop sells more.",
      "skills are circles in the top-left corner: full circle, and the next roll fires it.",
      "flywheel lives in the same rack, with the same charge and the same free roll.",
      "the shop has jump links: skills, pace, companions, auras, offline, tools.",
      "your profile is a full page: how far you have come, and a one-way export of the save.",
      "rebirth is a ladder with its own page: it appears at 30% of the collection, the first step asks for 50%, and each cycle adds ten points.",
      "finish all six steps and an ultra-rebirth grants a permanent +10% EP.",
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
