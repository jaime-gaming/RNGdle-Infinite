// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.4",
    title:
      "rebirth rebalanced, a shop that regroups, and companions with faces",
    body: [
      "rebirth resets purchases, companions, wallet and collection; your account, history, rebirth-earned skills and permanent bonuses stay.",
      "the six rungs ask for 20-45% of badges and 100,000-7,000,000 cycle EP; each starts the next cycle with 250,000 EP and +2% banked EP.",
      "history keeps every cycle behind a dotted line labelled with the rebirth that opened it, and tiers follow the scoring table.",
      "the shop hides what you cannot buy yet: an upgrade only shows up once the step before it is yours.",
      "auras are four families, each with a banner of its three best looks in its own gradient and type, and a page of its own.",
      "nine skills in the stall, three at a time and cheaper to charge; four new auras, three new buys and four saved racks.",
      "companions redrawn with a colour of their own, and their signature skills rebalanced so the rare ones are worth the wait.",
    ],
  },
  {
    version: "v0.3",
    title: "one release: the shop, the rack, rebirth and the shelves",
    body: [
      "the shop opens as six shelves, cheapest first: skills, pace, companions, auras, offline, tools — each on its own page.",
      "the skills shelf is a stall: two skills on sale, new stock every five minutes, the rest waiting dimmed under a green aura.",
      "skills charge in the corner rack: a full circle fires on your next roll, and Flywheel lives beside them.",
      "13 companions, one worn at a time: a firing signature skill pins it to the corner of your number until the roll settles.",
      "rebirth has its own page — a six-step ladder; every step grants an exclusive skill and a permanent +2% on banked EP.",
      "each of six rebirth rungs grants an exclusive skill and a permanent +2% banked-EP bonus; ultra-rebirth adds +10%.",
      "Auto-Roll is an ability in the rack, and any archived roll can be shared from History with what it actually earned.",
      "the whole interface speaks one hand-drawn icon set, and the aura ladder grows to eighteen.",
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
