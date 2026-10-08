// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.5",
    title: "daily and weekly tasks pay EP, and history holds more entries",
    body: [
      "daily and weekly tasks pay EP once per reset, and finishing every task on a list pays a bonus on top.",
      "claim finished tasks one at a time or all at once; a notice says what just happened, and a dot marks ready tasks.",
      "the activity log keeps up to 6,000 entries; from 4,500 it warns you, and once full the oldest unbookmarked make room.",
      "bulk delete clears a finished rebirth or the oldest entries, never bookmarked rolls; what leaves still counts in your profile.",
      "the share and bookmark buttons in History are icon-only, and their names stay for screen readers.",
      "a roll that failed to save is never credited twice, even when its history entry has been removed.",
      "past the sixth rebirth a door opens; the Rebirth page shows what waits behind it.",
      "a roll that pays several numbers keeps them all on screen; tap one to see its stats, and no total counts up.",
    ],
  },
  {
    version: "v0.4.1",
    title: "tiny update",
    body: [
      "QoL, like basic UI changes :D",
      "GitHub Pages now publishes the same build as the repository, including the latest assets and offline app files.",
    ],
  },
  {
    version: "v0.4",
    title:
      "rebirth rewards the overshoot, ultra-rebirths throw a ceremony, and devices link live",
    body: [
      "rebirth resets purchases, companions, wallet and collection; your account, history, rebirth-earned skills and bonuses stay.",
      "its six rungs ask 20-45% of badges and 250,000-15,000,000 cycle EP, and overshooting pays a surplus into the next wallet.",
      "the shop hides what you cannot buy yet, and every aura family has its three-look banner, its own gradient, type and page.",
      "nine skills wait in the stall three at a time, and one hand-drawn icon set covers the shelf and the corner rack.",
      "companions are a slideshow from one cage: each friend has its own colour and skill, and waddles or bobs when it changes your number.",
      "the device link page states the real transport, where the room lives and what a relay can and cannot keep.",
      "your account wears a logo you upload, squared and shrunk into the save and carried to the other device by that same link.",
      "ultra-rebirths add exclusives and a screen-filling ceremony, and every purchase now celebrates on the spot.",
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
