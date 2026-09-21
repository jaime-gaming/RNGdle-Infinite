// Release notes, newest first. `version` doubles as the "seen" marker: the
// header badge appears while the newest entry has not been acknowledged.
export const CHANGELOG = [
  {
    version: "v0.3",
    title: "companions, skills and a rebirth you can actually reach",
    body: [
      "13 companions now, but only one is equipped at a time — that one walks the roll screen.",
      "every companion carries its own exclusive skill, and the shop sells more.",
      "skills are circles in the top-left corner, and their icons are back. full circle, it fires.",
      "flywheel lives in the same rack now. same charge, same boost.",
      "the shop has jump links now: skills, pace, companions, auras, offline, tools.",
      "your profile is a full page now: how far you have come, and you can export it as a file.",
      "rebirth is a ladder with its own page: 30% shows it, 50% gets the first, +10% per cycle.",
      "finish all six and you can ultra-rebirth for a permanent +10% EP.",
    ],
  },
  {
    version: "v0.2",
    title: "tf is this update",
    body: [
      "pets. they make your EP bigger, not your roll luckier. buy one or find one (1 in 250).",
      "rebirth is up in the top bar now with a little ring that fills up.",
      "shop is ~40% cheaper. the late game was a wall.",
      "light mode was broken. it isn't now.",
      "real URLs, so you can bookmark stuff.",
      "share copies the link too.",
      "guest play doesn't save. it never did, we just said otherwise.",
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
