import { validUsername } from "./progress.js";

function hasProfile(state) {
  try {
    const save = typeof state === "string" ? JSON.parse(state) : state;
    const profile = save?.profile;
    return (
      typeof profile?.id === "string" &&
      !!profile.id &&
      validUsername(profile.username) &&
      Number.isSafeInteger(profile.createdAt) &&
      profile.createdAt >= 0
    );
  } catch {
    return false;
  }
}

function stamp(value) {
  return Number.isFinite(value) ? value : 0;
}

// The stamp a change that has not reached the room yet carries: one step past
// the last save the room accepted, or the moment the change was made, whichever
// is later. The step matters when the other device's clock runs ahead, so the
// change still beats the save it would otherwise tie with.
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

  if (localHasProfile !== remoteHasProfile) {
    if (localHasProfile) {
      return {
        direction: "send",
        savedAt: Math.max(localSavedAt, remoteSavedAt, stamp(now)) + 1,
      };
    }
    return { direction: "receive" };
  }

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
