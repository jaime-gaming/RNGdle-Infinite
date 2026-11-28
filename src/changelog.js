export const CHANGELOG = [
  {
    version: "v0.6.1",
    date: "2026-11-28",
    title: "rngmas: the winter village",
    body: [
      "the update arrives november 28; RNGmas and Christmas mode open december 1 at 00:00 UTC and close january 2 at 00:00 UTC.",
      "tasks → RNGmas holds season missions, eleven gatherings, eight rotating commissions and five weekly chapters.",
      "shop → RNGmas: advent doors december 1–24, the christmas day star, collection and market. Missed doors cannot be recovered.",
      "eight permanent auras and five companion skins; skins need their base companion. Earned boosts wait for manual activation.",
      "shared winter decoration, countdowns and bookmarks; black friday and Legacy Pages retire december 1 at midnight Madrid time.",
    ],
  },
  {
    version: "v0.6",
    date: "2026-11-18",
    title: "battle pass, new discoveries and a clearer shop",
    body: [
      "the Battle Pass has a schedule per season: 30 levels, optional EP premium and boosts at levels 5, 8, 15, 18, 25 and 28.",
      "daily, weekly and season missions add BPEP; online rolls add more in season. Matching charges extend boosts.",
      "new originals: Perfect Number, Narcissistic, Triangular, Kaprekar, Automorphic, Factorion, Emirp; rarity follows number frequency.",
      "companions get bolder portraits, species-specific frames and reveal animations: Moss Beetle, Clockwork Crab, Comet Axolotl.",
      "the premium track grants First Light Crown; Prism Axolotl stays. Cloud copies shrink, wallet bonuses add, shop filters arrive.",
    ],
    badges: [
      "INFINITE_PERFECT_NUMBER",
      "INFINITE_NARCISSISTIC",
      "INFINITE_TRIANGULAR",
      "INFINITE_KAPREKAR",
      "INFINITE_AUTOMORPHIC",
      "INFINITE_FACTORION",
      "INFINITE_EMIRP",
    ],
  },
  {
    version: "v0.5.2",
    date: "2026-11-03",
    title: "cloud accounts and easier save recovery",
    body: [
      "name a local profile to keep progress on this device, or sign in to a Cloud Account and keep it in step on every device.",
      "restore an earlier local save from Settings → Restore save, with a preview before you choose.",
      "the Black Friday sale arrives November 27, 2026 (UTC): discounts, sale stamps and a limited aura for one day.",
    ],
  },
  {
    version: "v0.5.1",
    date: "2026-10-20",
    title: "the RNGween update",
    body: [
      "the RNGween update added Halloween decorations, the Limited Shop with Pumpkoins and the Reaper's World, Oct 21 – Nov 3, 2026.",
      "four aura tasks unlock Jack-o'-Glow, Phantom Veil, Witchfire and Blood Moon, October 25–31, 2026; they never return.",
      "october 31 doubled Pumpkoins and awarded the Hollow Lantern; leftover coins became a small EP farewell.",
    ],
  },
  {
    version: "v0.5",
    date: "2026-10-10",
    title: "tasks and a larger activity history",
    body: [
      "tasks arrive: three daily and four weekly goals, each claimed on its own. A skip costs 125,000 EP, one per day and three in five days.",
      "the R4ND0MN3S5 event ran four missions that gave away Static Veil, Bit Storm, Scramble and Hex Dump; they are now permanent shop auras.",
      "every aura you own survives Rebirth; other purchases reset as before. Shop, Tasks and Badges lead the navigation.",
      "companion prices shifted: the first six went up and the top seven came down.",
      "history keeps 6,000 rolls and warns at 4,500; deleted rolls count in your profile and bulk delete keeps bookmarks.",
    ],
  },
  {
    version: "v0.4.1",
    date: "2026-10-06",
    title: "tiny update",
    body: ["qol, like basic UI changes :D"],
  },
  {
    version: "v0.4",
    date: "2026-10-04",
    title:
      "rebirth rewards the overshoot, ultra-rebirths throw a ceremony, and devices link live",
    body: [
      "rebirth resets purchases, companions, wallet and collection. Your account, history, rebirth skills and bonuses stay.",
      "its six rungs ask for 20-45% of the badges and 250,000 to 15,000,000 cycle EP; overshoot carries into the next wallet.",
      "the shop hides what you cannot buy yet, and every aura family has its own banner, gradient, typeface and page.",
      "nine skills rotate through the stall three at a time, drawn with one hand-made icon set for the shelf and the rack.",
      "companions live in a cage you flip through, each with its own colour and skill. ultra-rebirths add exclusives and a ceremony.",
    ],
  },
  {
    version: "v0.3",
    date: "2026-09-28",
    title: "one release: the shop, the rack, rebirth and the shelves",
    body: [
      "the shop opens as six shelves, cheapest first: skills, pace, companions, auras, offline and tools. Each has its own page.",
      "the skills shelf is a stall: two on sale, new stock every five minutes, the rest waiting dimmed behind a green glow.",
      "skills charge in the corner rack. A full circle fires on your next roll, and Flywheel sits beside them.",
      "thirteen companions, one worn at a time. Its signature skill pins itself to your number until the roll settles.",
      "rebirth has its own page: a six-step ladder where every rung grants a skill and a permanent +2% on banked EP. Ultra adds +10%.",
    ],
  },
  {
    version: "v0.2",
    date: "2026-09-19",
    title: "companions, cheaper upgrades and bookmarkable pages",
    body: [
      "companions multiply the EP you bank, never your odds. Buy one, or find one at roughly 1 in 250 rolls.",
      "rebirth moved to the top bar, with a ring that fills as your collection grows.",
      "shop prices dropped about 40%. The late game was a wall. Light mode is fixed.",
      "you can bookmark a shelf or page and open it again later. Sharing a result copies the link as well as the text.",
      "new badges: Pendulum (anomaly) and Last Second (anomaly). Rarity now follows how often each number appears.",
    ],

    badges: ["INFINITE_PENDULUM", "INFINITE_LAST_SECOND"],
  },
  {
    version: "v0.1",
    date: "2026-09-18",
    title: "launch",
    body: [
      "the game is live: roll a number from 0 to 1,000,000 and find out what makes it special.",
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0].version;
const SEEN_KEY = "rng-infinite-changelog-seen-v1";

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
