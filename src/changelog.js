// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.3",
    title: "one release: the shop, the rack, rebirth and the shelves",
    body: [
      "the shop opens as six shelves — skills, pace, companions, auras, offline, tools — each on its own page with the one count that matters.",
      "every shelf reads cheapest first, and every item is one card: a preview, the plain description, the price, one button.",
      "the skills shelf is a stall: two skills on sale, new stock every five minutes, the rest of the catalogue waiting under a green aura.",
      "the aura ladder grows to eighteen, Starfall to the Chrono Dial, every finish drawn on the rarity box.",
      "three featured picks sit above the shelves, chosen from your goal and your wallet.",
      "skills are charged circles in the corner rack: a full circle fires on your next roll. Flywheel lives in the same rack.",
      "13 companions: one equipped at a time, each with its own artwork and skill, walking the roll screen with a name plate.",
      "a firing companion skill pins the companion to the corner of your number until the roll settles.",
      "companions multiply banked EP only — never your odds, the number or its score.",
      "rebirth has its own page: a six-step ladder, and every step grants a skill plus a permanent +2% bonus on banked EP.",
      "rebirth keeps every purchase, auras included; only the collection, the history and the worn aura reset.",
      "finish the ladder and the ultra-rebirth opens: everything starts over for +10% banked EP per ultra-rebirth.",
      "Auto-Roll is an ability in the rack: one click to arm it, one to stand it down.",
      "any archived roll can be shared from History, with the badges and the EP it actually earned.",
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
