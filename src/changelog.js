// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.5",
    title: "a tidier shop, four new auras and companions with faces",
    body: [
      "the auras shelf is grouped into four families, and every card shows a chip of its own two colours.",
      "four new auras: Halcyon, Downpour, Blueprint and Inkblot. Cosmetic, like every aura before them.",
      "three new things to buy: Offline Vault III (360 rolls an absence), Miser (triple EP) and Triptych (three draws).",
      "the skill stall sells three at a time now, so all nine skills still come round before you finish reading.",
      "companions are redrawn: clearer creatures, and each one wears its own colour on the shelf and in the rack.",
    ],
  },
  {
    version: "v0.4",
    title:
      "rebirth rebalanced, faster pacing, and a history that keeps every run",
    body: [
      "rebirth resets purchases, companions, wallet and collection; your account, history, rebirth-earned skills and permanent bonuses stay.",
      "the six rungs now ask for 20–45% of badges and 100,000–7,000,000 cycle EP; ultra-rebirth asks for 50% and 15,000,000.",
      "each rung starts the next cycle with 250,000 EP and adds +2% banked EP; ultra-rebirth adds 1,000,000 EP and +10%.",
      "pace upgrades now reach a 10-second reveal and a 2-second cooldown; draw skills show every draw, but pay only the best.",
      "history keeps every cycle, tiers stay accurate, and the shop and narrow-screen layouts are polished.",
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
