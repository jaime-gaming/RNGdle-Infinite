// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.2",
    title: "tf is this update",
    body: [
      "so we added pets. they follow you around and make your EP slightly bigger. not the number you rolled — that one stays exactly as random and as honest as before — just the part that lands in your wallet. anywhere from 4% to 20%. you can buy one or get very lucky and have one show up on its own (1 in 250, don't count on it).",
      "rebirth moved up to the top bar with a little ring that fills as you find badges, so you can finally see how doomed you are.",
      "everything in the shop got cheaper. like, 40% cheaper overall. the late game was a wall and now it's a slightly shorter wall.",
      "light mode was, and there's no polite way to say this, broken. two different palettes were fighting each other. only one of them survived.",
      "every page has a real URL now (/shop, /badges, that kind of thing) so you can actually bookmark things.",
      "share now gives you the link too, in case you wanted to inflict this on somebody.",
      "also guest play doesn't save anymore. it never really did, we just weren't honest about it.",
    ],
  },
  {
    version: "v0.1",
    title: "launch",
    body: ["so uhhhh we launched RNGdle infinite"],
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
