// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.5.1",
    title: "RNGween update",
    body: [
      "RNGween runs October 21–November 3, 2026 (UTC): Halloween decorations, a Limited Shop with Pumpkoins and the Reaper's World.",
      "four Halloween tasks on October 25–31, 2026 unlock Jack-o'-Glow, Phantom Veil, Witchfire and Blood Moon. They never return.",
      "a roll shows at most six numbers, each with its own aura, and the mobile skill rack can be folded away.",
    ],
  },
  {
    version: "v0.5",
    title: "tasks and a larger activity history",
    body: [
      "tasks arrive: three daily and four weekly goals, each claimed on its own. A skip costs 125,000 EP, one per day and three in five days.",
      "the R4ND0MN3S5 event ran four missions that gave away Static Veil, Bit Storm, Scramble and Hex Dump; they are now permanent shop auras.",
      "every aura you own, including the one you are wearing, survives Rebirth. Other purchases reset as before.",
      "shop, Tasks and Badges lead the navigation, and Rebirth hints at what waits past the last rung.",
      "companion prices shifted: the first six went up and the top seven came down.",
      "history keeps 6,000 rolls and warns at 4,500. Deleted rolls still count in your profile, and bulk delete keeps your bookmarks.",
      "share and bookmark are icon buttons, and a roll can never be credited twice once its history entry is gone.",
      "a roll that pays several numbers shows them all on one screen; the best turns green and tapping any of them opens its stats.",
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
      "rebirth resets purchases, companions, wallet and collection. Your account, history, rebirth skills and bonuses stay.",
      "its six rungs ask for 20-45% of the badges and 250,000 to 15,000,000 cycle EP; whatever you overshoot carries into the next wallet.",
      "the shop hides what you cannot buy yet, and every aura family has its own banner, gradient, typeface and page.",
      "nine skills rotate through the stall three at a time, drawn with one hand-made icon set for the shelf and the rack.",
      "companions live in a single cage you flip through. Each has its own colour and skill, and bobs along when it changes your number.",
      "the device link page explains which transport is in use, where the room lives and what a relay can and cannot keep.",
      "your account can wear a logo you upload. It is squared, shrunk into the save and carried to your other device.",
      "ultra-rebirths add exclusives and a full-screen ceremony, and every purchase celebrates on the spot.",
    ],
  },
  {
    version: "v0.3",
    title: "one release: the shop, the rack, rebirth and the shelves",
    body: [
      "the shop opens as six shelves, cheapest first: skills, pace, companions, auras, offline and tools. Each has its own page.",
      "the skills shelf is a stall: two on sale, new stock every five minutes, the rest waiting dimmed behind a green glow.",
      "skills charge in the corner rack. A full circle fires on your next roll, and Flywheel sits beside them.",
      "13 companions, one worn at a time. When its signature skill fires, it pins itself to your number until the roll settles.",
      "rebirth has its own page: a six-step ladder where every rung grants a skill and a permanent +2% on banked EP. Ultra adds +10%.",
      "Auto-Roll is a rack ability, and any archived roll can be shared from History with what it really earned.",
      "the whole interface uses one hand-drawn icon set, and the aura ladder grows to eighteen.",
    ],
  },
  {
    version: "v0.2",
    title: "companions, cheaper upgrades and real URLs",
    body: [
      "companions multiply the EP you bank, never your odds. Buy one, or find one at roughly 1 in 250 rolls.",
      "rebirth moved to the top bar, with a ring that fills as your collection grows.",
      "shop prices dropped about 40%. The late game was a wall.",
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
