// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.4",
    title:
      "rebirth rewards the overshoot, ultra-rebirths throw a ceremony, and devices link live",
    body: [
      "rebirth resets purchases, companions, wallet and collection; your account, history, rebirth-earned skills and permanent bonuses stay.",
      "the six rungs ask 20-45% of badges and 250,000-15,000,000 cycle EP; overshooting the gate pays a surplus straight into the next wallet.",
      "the shop hides what you cannot buy yet, and every aura family has its three-look banner, its own gradient, type and page.",
      "nine skills in the stall, three at a time, with tinted cards and one set of hand-drawn icons across the shelf and the corner rack.",
      "companions are a slideshow: one cage in the middle, arrows to slide to the next, each friend with its own colour and skill.",
      "purchases celebrate on the spot, and companions waddle, bob and ripple whenever they change your number.",
      "one link joins two devices live through a relay, or the whole account crosses in a code when there is no relay at all.",
      "ultra-rebirths bring exclusives, a screen-filling ceremony and a note from the developer to whoever climbed the whole ladder.",
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
