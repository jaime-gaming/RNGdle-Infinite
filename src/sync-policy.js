import { validUsername } from "./progress.js";

function readSave(state) {
  try {
    const save = typeof state === "string" ? JSON.parse(state) : state;
    return save && typeof save === "object" ? save : null;
  } catch {
    return null;
  }
}

function hasProfile(state) {
  const save = readSave(state);
  const profile = save?.profile;
  return (
    typeof profile?.id === "string" &&
    !!profile.id &&
    validUsername(profile.username) &&
    Number.isSafeInteger(profile.createdAt) &&
    profile.createdAt >= 0
  );
}

// The account a save belongs to, or "" for a guest/broken save. Two saves with
// the same id are the same account seen from two devices; different ids mean two
// separate accounts meeting for the first time.
export function profileId(state) {
  const save = readSave(state);
  return hasProfile(save) ? String(save.profile.id) : "";
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// How much of the game a save actually carries. Linking two devices is a
// choice about which account survives, and the honest answer is the one that
// has been played: a browser that was opened once must never replace one with
// a long history, whatever either clock says. The score is deliberately coarse
// — it only has to separate "played" from "barely touched", never to rank two
// equally advanced saves, which the timestamp order still decides.
export function progressWeight(state) {
  const save = readSave(state);
  if (!save) return 0;
  let weight = 0;
  // Rolls are the game; badges, purchases and companions are what they bought.
  weight += count(save.history) * 4;
  weight += count(save.discovered) * 3;
  weight += count(save.owned) * 5;
  weight += count(save.pets) * 3;
  weight += count(save.skills) * 3;
  weight += count(save.equippedSkills) * 2;
  weight += count(save.loadouts) * 3;
  weight += count(save.bookmarks) * 2;
  weight += count(save.removedTotals);
  weight += positive(save.rebirths) * 40 + positive(save.ultraRebirths) * 80;
  // Wallet and lifetime income on a log scale: one enormous roll should count
  // for something, but not outvote a long history of ordinary ones.
  weight += Math.floor(Math.log10(positive(save.totalEarned) + 1)) * 8;
  weight += Math.floor(Math.log10(positive(save.balance) + 1)) * 2;
  // Task progress, in both halves of the list.
  for (const cadence of ["daily", "weekly"]) {
    const slot = save.tasks?.[cadence];
    weight += count(slot?.claimed) * 3;
    weight += count(
      Object.keys(slot?.counts ?? {}).filter((k) =>
        positive(slot?.counts?.[k]),
      ),
    );
  }
  const event = save.tasks?.rngween;
  weight += count(event?.earned) * 8;
  weight += count(
    Object.keys(event?.counts ?? {}).filter((k) =>
      positive(event?.counts?.[k]),
    ),
  );
  // The Halloween event's own collections.
  const limited = save.rngweenLimited;
  weight += count(limited?.auras) * 6;
  weight += count(limited?.drawn) * 3;
  weight += count(limited?.bought) * 3;
  weight += count(limited?.rewardedMissions) * 2;
  weight += Math.floor(Math.log10(positive(limited?.pumpkoins) + 1)) * 2;
  const fragments = Object.values(limited?.world?.fragments ?? {}).filter(
    (earned) => earned === true,
  ).length;
  weight += fragments * 4;
  const games = Object.values(limited?.world?.games ?? {}).reduce(
    (sum, played) => sum + positive(played),
    0,
  );
  weight += games * 2;
  weight += count(Object.keys(save.events ?? {})) * 2;
  return weight;
}

// A save that has not been played at all: no rolls, no badges, no purchases.
// Such a device is a blank slate and may receive anything.
export function isBlankSave(state) {
  return progressWeight(state) < EMPTY_WEIGHT_LIMIT;
}
const EMPTY_WEIGHT_LIMIT = 12;

// Which side carries more of the game, when the gap is big enough to call. A
// save must be both clearly larger and at least half again as large, so two
// devices that are simply a little out of step keep the timestamp order that
// each queued change relies on.
export function richerSide(local, remote) {
  const localWeight = progressWeight(local);
  const remoteWeight = progressWeight(remote);
  const [low, high] = [localWeight, remoteWeight].sort((a, b) => a - b);
  if (high < low + WEIGHT_GAP || high < low * WEIGHT_RATIO) return "";
  return localWeight > remoteWeight ? "local" : "remote";
}
const WEIGHT_GAP = 40;
const WEIGHT_RATIO = 1.5;

function stamp(value) {
  return Number.isFinite(value) ? value : 0;
}

// The stamp a change that has not reached the room yet carries: one step past
// the last save the room accepted, or the moment the change was made, whichever
// is later. The step matters when the other device's clock runs ahead, so the
// change still beats the save it would otherwise tie with.
// A single stable writer prevents simultaneous actions from independent
// browsers. Existing links without a declared owner elect one only after both
// device IDs are known; until then they fail closed instead of splitting.
export function chooseSyncOwner(devices = [], declaredOwners = []) {
  const members = [
    ...new Set(devices.filter((id) => typeof id === "string" && id)),
  ];
  const declared = [
    ...new Set(declaredOwners.filter((id) => members.includes(id))),
  ].sort();
  if (declared.length) return declared[0];
  return members.length > 1 ? members.sort()[0] : "";
}

export function isSyncWriter(device, ownerDevice) {
  return !!device && !!ownerDevice && device === ownerDevice;
}

export function pendingStamp(savedAt, dirtyAt) {
  return Math.max(stamp(savedAt) + 1, stamp(dirtyAt));
}

// A device link starts with one account and one empty browser. On the P2P
// transport both can send at stamp zero, so the device-id tie-break alone can
// let the guest win. A valid account must always beat a guest save; once both
// sides have profiles, keep the normal timestamp/device ordering.
export function syncDecision(local, remote, now = Date.now()) {
  const localSavedAt = stamp(local.savedAt);
  const remoteSavedAt = stamp(remote.savedAt);
  const localHasProfile = hasProfile(local.state);
  const remoteHasProfile = hasProfile(remote.state);

  // A profile always outranks a guest save, and so does the account that has
  // actually been played: linking two different accounts keeps the one with
  // more data, never the one whose clock or last write happens to be newer.
  // The rule is about whose account survives the join, so it only settles
  // saves that are not the same account; between two devices of one account
  // the timestamp order below still decides, and no queued change is refused.
  const primary = primarySide(local, remote);
  if (localHasProfile !== remoteHasProfile) {
    if (localHasProfile) {
      return {
        direction: "send",
        savedAt: Math.max(localSavedAt, remoteSavedAt, stamp(now)) + 1,
      };
    }
    return { direction: "receive" };
  }
  if (primary === "local")
    return {
      direction: "send",
      savedAt: Math.max(localSavedAt, remoteSavedAt, stamp(now)) + 1,
    };
  if (primary === "remote") return { direction: "receive" };

  if (
    remoteSavedAt > localSavedAt ||
    (remoteSavedAt === localSavedAt &&
      typeof remote.device === "string" &&
      remote.device < local.device)
  ) {
    return { direction: "receive" };
  }
  if (
    remoteSavedAt < localSavedAt ||
    (remoteSavedAt === localSavedAt && remote.device !== local.device)
  ) {
    return { direction: "send", savedAt: localSavedAt };
  }
  return { direction: "none" };
}

// Two saves of different accounts — or one that was barely touched — meet for
// the first time here. The one carrying more of the game is the primary: it is
// kept whole and the other device adopts it. Saves of the same, already played
// account are left to the timestamp order, so ordinary sync keeps working.
export function primarySide(local, remote) {
  const localId = profileId(local.state);
  const remoteId = profileId(remote.state);
  const differentAccounts = localId !== remoteId;
  if (
    !differentAccounts &&
    !isBlankSave(local.state) &&
    !isBlankSave(remote.state)
  )
    return "";
  return richerSide(local.state, remote.state);
}
