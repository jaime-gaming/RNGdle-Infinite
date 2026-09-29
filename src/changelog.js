// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.4",
    title:
      "a cheaper ladder, a cycle that gets paid, and a history that keeps every run",
    body: [
      "a rebirth hands the run back: every purchase, the companions, the wallet and the badge collection start over.",
      "your account keeps its story: the activity history, the rebirths with their skills, every permanent bonus and the EP earned all-time.",
      "the ladder asks for far fewer badges: a fifth of the collection for the first rung instead of half, and it closes at 45%, not 100%.",
      "a rung also asks for EP the cycle earned, from 100,000 EP to 7,000,000 EP: a mark of progress, not a spend, as the wallet restarts anyway.",
      "every cycle begins with a starting sum: 250,000 EP for each rung climbed, plus 1,000,000 EP per ultra-rebirth.",
      "the ultra-rebirth closes the ladder at half the collection — all 235 badges was a collection nobody could finish — and pays a bigger sum.",
      "history is never rewritten: a dotted line marks where each rebirth opened a new cycle, and every past roll stays readable.",
      "a draw skill now shows every draw it takes side by side, and only the best of them is scored, ranked and paid.",
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
      "rebirth keeps every purchase, auras included; at the top, the ultra-rebirth starts everything over for +10% each.",
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
