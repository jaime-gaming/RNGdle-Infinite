import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestoreDb, firebaseConfigured } from "./firebase.js";
import {
  PUBLIC_PROFILE_COLLECTION,
  publicProfileDocument,
  publicProfileId,
} from "./public-profile.js";
import { allTimeTally } from "./profile-stats.js";
import {
  parseAndRepairProgress,
  preservePermanentCosmetics,
} from "./progress.js";
import {
  isReadableSave,
  packVaultSave,
  unpackVaultSave,
  writeCloudRecovery,
} from "./save-vault.js";
import { productById } from "./shop-data.js";

const CLOUD_SAVE_COLLECTION = "player_saves";
const CLOUD_OWNER_KEY = "rng-infinite-cloud-owner-v1";
const CLOUD_DIRTY_KEY = "rng-infinite-cloud-dirty-v1";
const CLOUD_DIRTY_USER_PREFIX = `${CLOUD_DIRTY_KEY}:`;
const CLOUD_CACHE_PREFIX = "rng-infinite-cloud-cache-v1:";
// Firestore documents have a 1 MiB limit. Leave room for field names and
// metadata even if compression is unavailable or the save is unusual.
const FIRESTORE_SAVE_LIMIT_BYTES = 900_000;

function storageRef(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCloudOwner(storage) {
  try {
    return storageRef(storage)?.getItem(CLOUD_OWNER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeCloudOwner(userId, storage) {
  try {
    const target = storageRef(storage);
    if (!target) return false;
    if (userId) target.setItem(CLOUD_OWNER_KEY, userId);
    else target.removeItem(CLOUD_OWNER_KEY);
    return true;
  } catch {
    return false;
  }
}

export function cloudAccountOwnsLocalSave(userId, localOwner) {
  return Boolean(userId && localOwner && userId === localOwner);
}

export function readCloudDirtyOwner(storage) {
  try {
    return storageRef(storage)?.getItem(CLOUD_DIRTY_KEY) ?? "";
  } catch {
    return "";
  }
}

function cloudDirtyKey(userId) {
  return `${CLOUD_DIRTY_USER_PREFIX}${encodeURIComponent(userId)}`;
}

export function isCloudDirty(userId, storage) {
  if (!userId) return false;
  try {
    const target = storageRef(storage);
    return Boolean(
      target &&
      (target.getItem(cloudDirtyKey(userId)) === "1" ||
        target.getItem(CLOUD_DIRTY_KEY) === userId),
    );
  } catch {
    return false;
  }
}

export function markCloudDirty(userId, storage) {
  if (!userId) return false;
  try {
    const target = storageRef(storage);
    if (!target) return false;
    // Promote the former single-owner marker before replacing it. Saves can be
    // cached for several signed-in users while the browser switches accounts.
    const previousOwner = target.getItem(CLOUD_DIRTY_KEY);
    if (previousOwner && previousOwner !== userId)
      target.setItem(cloudDirtyKey(previousOwner), "1");
    target.setItem(cloudDirtyKey(userId), "1");
    target.setItem(CLOUD_DIRTY_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

export function clearCloudDirty(userId, storage) {
  try {
    const target = storageRef(storage);
    if (!target) return false;
    if (userId) {
      target.removeItem(cloudDirtyKey(userId));
      if (target.getItem(CLOUD_DIRTY_KEY) === userId)
        target.removeItem(CLOUD_DIRTY_KEY);
    } else {
      target.removeItem(CLOUD_DIRTY_KEY);
      for (let index = target.length - 1; index >= 0; index--) {
        const key = target.key(index);
        if (key?.startsWith(CLOUD_DIRTY_USER_PREFIX)) target.removeItem(key);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function selectLocalSaveForCloudUser({
  userId,
  localOwner,
  localProgress,
  cachedProgress,
  emptyProgress,
}) {
  if (localOwner && localOwner !== userId)
    return {
      progress: cachedProgress ?? emptyProgress,
      owner: cachedProgress ? userId : null,
    };
  return { progress: localProgress, owner: localOwner || null };
}

// When switching accounts, prefer the exact on-disk bytes if the local save is
// healthy. If a recent write failed, preserve the newer in-memory progress
// instead of caching a stale readable save from before that failure.
export function accountSwitchSnapshot({
  localRaw,
  progress,
  localSaveHealthy = true,
}) {
  if (localSaveHealthy && typeof localRaw === "string" && localRaw)
    return localRaw;
  return JSON.stringify(progress);
}

function cloudCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

export function cacheLocalSaveForUser(userId, raw, storage) {
  if (!userId || typeof raw !== "string" || !raw) return false;
  try {
    const target = storageRef(storage);
    if (!target) return false;
    target.setItem(cloudCacheKey(userId), raw);
    return true;
  } catch {
    return false;
  }
}

export function readCachedSaveForUser(userId, storage) {
  if (!userId) return null;
  try {
    return storageRef(storage)?.getItem(cloudCacheKey(userId)) ?? null;
  } catch {
    return null;
  }
}

export function removeCachedSaveForUser(userId, storage) {
  if (!userId) return false;
  try {
    storageRef(storage)?.removeItem(cloudCacheKey(userId));
    return true;
  } catch {
    return false;
  }
}

function safeAmount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function uniqueIds(value) {
  return new Set(
    Array.isArray(value)
      ? value.filter((id) => typeof id === "string" && id.length > 0)
      : [],
  );
}

function investedWealth(progress) {
  let wealth = safeAmount(progress.balance);
  for (const id of uniqueIds(progress.owned)) {
    const price = safeAmount(productById.get(id)?.price);
    wealth = Math.min(Number.MAX_SAFE_INTEGER, wealth + price);
  }
  return wealth;
}

/**
 * Classify reset-generation order. The ordered counters identify whether two
 * saves are from the same or different reset generations; this comparison is
 * never sufficient to choose a winner. A generation conflict is shown to the
 * player, who may keep either complete save.
 */
export function compareSaveEpoch(local, cloud) {
  if (!local?.profile || !cloud?.profile) return "incomparable";
  if (local.profile.id !== cloud.profile.id) return "incomparable";
  for (const key of ["freshStarts", "rollbacks", "ultraRebirths", "rebirths"]) {
    const a = safeAmount(local[key]);
    const b = safeAmount(cloud[key]);
    if (a > b) return "local";
    if (a < b) return "cloud";
  }
  return "same";
}

/**
 * Compare same-profile game progress as a partial order, not by file size or a
 * guessed timestamp. A save is richer only when it is at least as strong in
 * every measured progress dimension and ahead in one or more. Generation
 * conflicts are reported separately so the player can choose safely.
 */
export function compareSaveRichness(local, cloud) {
  if (!local?.profile && !cloud?.profile) return "equal";
  if (!local?.profile) return "cloud";
  if (!cloud?.profile) return "local";
  if (local.profile.id !== cloud.profile.id) return "incomparable";

  const localTally = allTimeTally(local);
  const cloudTally = allTimeTally(cloud);
  let localAhead = false;
  let cloudAhead = false;
  const compareNumber = (left, right) => {
    const a = safeAmount(left);
    const b = safeAmount(right);
    if (a > b) localAhead = true;
    else if (a < b) cloudAhead = true;
  };
  const compareSet = (left, right) => {
    const a = uniqueIds(left);
    const b = uniqueIds(right);
    for (const id of a) if (!b.has(id)) localAhead = true;
    for (const id of b) if (!a.has(id)) cloudAhead = true;
  };
  const compareFlag = (left, right) => {
    if (Boolean(left) && !Boolean(right)) localAhead = true;
    else if (!Boolean(left) && Boolean(right)) cloudAhead = true;
  };

  // Count wallet EP plus the listed cost of owned products so buying an item
  // does not make a save look poorer than the same wallet before the purchase.
  compareNumber(investedWealth(local), investedWealth(cloud));
  for (const key of [
    "totalEarned",
    "cycleEarnedEP",
    "rebirths",
    "ultraRebirths",
    "rollbacks",
    "freshStarts",
    "surplusBanked",
  ])
    compareNumber(local[key], cloud[key]);
  for (const key of ["rolls", "spent"])
    compareNumber(localTally[key], cloudTally[key]);
  compareNumber(localTally.best?.ep, cloudTally.best?.ep);

  for (const key of ["discovered", "owned", "pets", "skills"])
    compareSet(local[key], cloud[key]);
  compareSet(localTally.badges, cloudTally.badges);
  compareSet(localTally.discovered, cloudTally.discovered);
  compareSet(localTally.pets, cloudTally.pets);
  compareSet(local.rngweenLimited?.auras, cloud.rngweenLimited?.auras);
  compareFlag(
    local.rngweenLimited?.skinEarned,
    cloud.rngweenLimited?.skinEarned,
  );
  compareFlag(
    local.rngweenLimited?.finaleEarned,
    cloud.rngweenLimited?.finaleEarned,
  );

  const localPending = local.pendingRoll;
  const cloudPending = cloud.pendingRoll;
  if (!localPending && cloudPending) cloudAhead = true;
  else if (localPending && !cloudPending) localAhead = true;
  else if (
    localPending &&
    cloudPending &&
    (localPending.id !== cloudPending.id ||
      localPending.number !== cloudPending.number)
  ) {
    localAhead = true;
    cloudAhead = true;
  }

  if (localAhead && !cloudAhead) return "local";
  if (cloudAhead && !localAhead) return "cloud";
  return localAhead ? "incomparable" : "equal";
}

export function summarizeSaveProgress(progress) {
  const tally = allTimeTally(progress);
  return {
    username: String(progress?.profile?.username ?? "Player"),
    balance: safeAmount(progress?.balance),
    totalEarned: safeAmount(progress?.totalEarned),
    cycleEarnedEP: safeAmount(progress?.cycleEarnedEP),
    rebirths: safeAmount(progress?.rebirths),
    prestiges: safeAmount(progress?.ultraRebirths),
    rollbacks: safeAmount(progress?.rollbacks),
    freshStarts: safeAmount(progress?.freshStarts),
    surplusBanked: safeAmount(progress?.surplusBanked),
    rolls: safeAmount(tally.rolls),
    bestRollEP: safeAmount(tally.best?.ep),
    badges: new Set([
      ...uniqueIds(progress?.discovered),
      ...uniqueIds(tally.discovered),
    ]).size,
    upgrades: uniqueIds(progress?.owned).size,
    skills: uniqueIds(progress?.skills).size,
    companions: uniqueIds(progress?.pets).size,
    pendingRoll: Boolean(progress?.pendingRoll),
  };
}

function choiceMessage(reason) {
  if (reason === "generation")
    return "These copies are from different stages of your game. Choose one; the other stays saved in Settings.";
  if (reason === "profile")
    return "These are different profiles and cannot be combined. Choose one; the other stays saved in Settings.";
  if (reason === "tie")
    return "These copies contain the same progress but differ in other details. Choose one; the other stays saved in Settings.";
  if (reason === "changed")
    return "Your progress changed while you were choosing. Review the latest copies and choose again; the other stays saved in Settings.";
  return "Each copy has different progress. Choose one; the other stays saved in Settings.";
}

function choiceRequiredOutcome({
  localProgress,
  cloudProgress,
  localSource,
  cloudExists,
  cloudSaveData,
  updatedAt,
  repairs = [],
  reason,
  comparison,
}) {
  const message = choiceMessage(reason);
  const canChooseLocal = Boolean(localProgress?.profile);
  return {
    progress: null,
    winner: "choice",
    comparison,
    choiceRequired: true,
    repairs,
    updatedAt,
    uploaded: false,
    notice: message,
    conflict: {
      reason,
      message,
      canChooseLocal,
      canChooseCloud: Boolean(cloudProgress?.profile),
      local: summarizeSaveProgress(localProgress ?? {}),
      cloud: summarizeSaveProgress(cloudProgress ?? {}),
      expectedLocalSource: localSource,
      expectedCloudExists: cloudExists,
      expectedCloudSaveData: cloudSaveData,
    },
  };
}

export function chooseSaveWinner(
  local,
  cloud,
  { allowLocal = true, decision = null } = {},
) {
  if (!cloud) {
    return {
      progress: allowLocal ? local : null,
      winner: allowLocal && local?.profile ? "local" : "none",
      comparison: "no-cloud-save",
    };
  }
  const comparison = compareSaveRichness(local, cloud);
  if (!allowLocal || !local?.profile || !cloud?.profile)
    return { progress: cloud, winner: "cloud", comparison };
  // Different profile IDs are not mergeable, but the player may explicitly
  // choose either complete save after reviewing the conflict.
  if (
    local.profile.id !== cloud.profile.id &&
    decision !== "local" &&
    decision !== "cloud"
  )
    return {
      progress: null,
      winner: "choice",
      comparison: "incomparable",
      choiceReason: "profile",
    };
  if (decision === "local" || decision === "cloud")
    return {
      progress: decision === "local" ? local : cloud,
      winner: decision,
      comparison,
      selectedByUser: true,
    };
  const epoch = compareSaveEpoch(local, cloud);
  if (epoch !== "same")
    return {
      progress: null,
      winner: "choice",
      comparison: "generation-conflict",
      choiceReason: "generation",
      epoch,
    };
  if (comparison === "local" || comparison === "cloud")
    return {
      progress: comparison === "local" ? local : cloud,
      winner: comparison,
      comparison,
    };
  if (comparison === "equal" && sameSave(local, cloud))
    return { progress: cloud, winner: "cloud", comparison };
  return {
    progress: null,
    winner: "choice",
    comparison,
    choiceReason: comparison === "equal" ? "tie" : "incomparable",
  };
}

function sameSave(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function cloudConflictVersionChanged({
  expectedCloudExists,
  expectedCloudSaveData,
  expectedLocalSource,
  cloudExists,
  cloudSaveData,
  localSource,
}) {
  const cloudChanged =
    typeof expectedCloudExists === "boolean" &&
    (cloudExists !== expectedCloudExists ||
      !sameSave(cloudSaveData ?? null, expectedCloudSaveData ?? null));
  const localChanged =
    typeof expectedLocalSource === "string" &&
    localSource !== expectedLocalSource;
  return cloudChanged || localChanged;
}

function writeRecoveryCopy(progress, storage, message, reason) {
  const raw =
    typeof progress === "string" ? progress : JSON.stringify(progress);
  if (!writeCloudRecovery(raw, { storage, reason })) throw new Error(message);
}

export function encodeCloudSave(progress) {
  const raw = JSON.stringify(progress);
  if (!isReadableSave(raw))
    throw new Error("The saved progress could not be opened.");
  const packed = packVaultSave(raw);
  const bytes = new TextEncoder().encode(packed).byteLength;
  if (bytes > FIRESTORE_SAVE_LIMIT_BYTES)
    throw new Error(
      "This progress is too large to back up. Keep your copy on this device and contact support.",
    );
  return packed;
}

export function decodeCloudSave(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string")
    throw new Error(
      "This online save cannot be opened by this version of the game.",
    );
  const raw = unpackVaultSave(value);
  if (!isReadableSave(raw))
    throw new Error("This online save could not be opened. Try again later.");
  return JSON.parse(raw);
}

const PUBLIC_PROFILE_CLEANUP_ERROR = "public-profile-cleanup-unavailable";

function publicProfileCleanupError() {
  const error = new Error(
    "The public profile could not be safely verified or removed.",
  );
  error.code = PUBLIC_PROFILE_CLEANUP_ERROR;
  return error;
}

function requireFirestore() {
  if (!firebaseConfigured || !firestoreDb)
    throw new Error("Online backups aren’t available here.");
  return firestoreDb;
}

function timestampToIso(value) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function readCloudSave(userId) {
  if (!userId) throw new Error("Sign in before loading online progress.");
  const database = requireFirestore();
  const snapshot = await getDoc(doc(database, CLOUD_SAVE_COLLECTION, userId));
  if (!snapshot.exists()) return null;
  const saved = snapshot.data();
  return {
    save_data: decodeCloudSave(saved?.save_data),
    updated_at: timestampToIso(saved?.updated_at),
  };
}

export async function writeCloudSave(userId, progress) {
  if (!userId) throw new Error("Sign in before backing up progress online.");
  const database = requireFirestore();
  await setDoc(doc(database, CLOUD_SAVE_COLLECTION, userId), {
    save_data: encodeCloudSave(progress),
    updated_at: serverTimestamp(),
    public_profile_id: null,
  });
  // Restoring a save after a failed local deletion must never fail just because
  // public-profile rules have not been deployed yet.
  try {
    await publishPublicProfile(userId, progress);
  } catch {
    // The private save is the recovery copy; profile publication can retry later.
  }
  return new Date().toISOString();
}

async function publishPublicProfile(userId, progress) {
  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const publicProfile = publicProfileDocument(userId, progress);
  const publicId = publicProfile.username_key;
  const publicReference = doc(database, PUBLIC_PROFILE_COLLECTION, publicId);
  let published = false;

  await runTransaction(database, async (transaction) => {
    const saveSnapshot = await transaction.get(saveReference);
    if (!saveSnapshot.exists())
      throw new Error(
        "Your progress changed before your public profile could be updated. Try again.",
      );
    const envelope = saveSnapshot.data();
    const remoteRaw = decodeCloudSave(envelope.save_data);
    const remoteProgress = parseAndRepairProgress(
      JSON.stringify(remoteRaw),
    ).progress;
    if (!sameSave(remoteProgress, progress))
      throw new Error(
        "Your progress changed before your public profile could be updated. Try again.",
      );

    const previousId =
      publicProfileIdFromEnvelope(envelope) ||
      publicProfileId(remoteProgress.profile?.username);
    const previousReference =
      previousId && previousId !== publicId
        ? doc(database, PUBLIC_PROFILE_COLLECTION, previousId)
        : null;
    const publicSnapshot = await transaction.get(publicReference);
    const previousSnapshot = previousReference
      ? await transaction.get(previousReference)
      : null;
    published =
      !publicSnapshot.exists() || publicSnapshot.data()?.owner_uid === userId;

    if (
      previousReference &&
      previousSnapshot?.exists() &&
      previousSnapshot.data()?.owner_uid === userId
    )
      transaction.delete(previousReference);
    if (published) {
      const current = publicSnapshot.exists() ? publicSnapshot.data() : null;
      const profileChanged =
        !current ||
        current.owner_uid !== userId ||
        current.username !== publicProfile.username ||
        current.username_key !== publicProfile.username_key ||
        JSON.stringify({ ...current.record, at: "" }) !==
          JSON.stringify({ ...publicProfile.record, at: "" });
      if (profileChanged)
        transaction.set(publicReference, {
          ...publicProfile,
          updated_at: serverTimestamp(),
        });
    }

    const nextPublicId = published ? publicId : null;
    if (envelope.public_profile_id !== nextPublicId)
      transaction.set(saveReference, {
        save_data: envelope.save_data,
        updated_at: envelope.updated_at ?? serverTimestamp(),
        public_profile_id: nextPublicId,
      });
  });
  return { published, conflict: !published };
}

function publicProfileIdFromEnvelope(envelope) {
  return publicProfileId(envelope?.public_profile_id);
}

/**
 * Read and reconcile both snapshots in one Firestore transaction. A clear
 * same-generation progress winner is automatic; generation conflicts, ties,
 * and incomparable progress wait for the player's choice. The displaced save
 * is backed up before either the browser or Firestore copy is replaced.
 */
export async function reconcileCloudSave(
  userId,
  localCandidate,
  {
    allowLocal = true,
    storage,
    decision = null,
    expectedCloudExists,
    expectedCloudSaveData,
    expectedLocalSource,
  } = {},
) {
  if (!userId)
    throw new Error("Sign in before choosing between saved progress.");
  const database = requireFirestore();
  const reference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  let outcome = null;

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const remoteEnvelope = snapshot.exists() ? snapshot.data() : null;
    const remoteRaw = remoteEnvelope
      ? decodeCloudSave(remoteEnvelope.save_data)
      : null;
    const localSource =
      typeof localCandidate === "string"
        ? localCandidate
        : localCandidate
          ? JSON.stringify(localCandidate)
          : null;
    const remoteSource = remoteRaw ? JSON.stringify(remoteRaw) : null;
    const localParsed = localSource
      ? parseAndRepairProgress(localSource)
      : null;
    const remoteParsed = remoteSource
      ? parseAndRepairProgress(remoteSource)
      : null;
    const localProgress = localParsed?.progress ?? null;
    const remoteProgress = remoteParsed?.progress ?? null;
    if (remoteProgress && !remoteProgress.profile)
      throw new Error("This online account does not have a game profile yet.");

    const cloudExists = snapshot.exists();
    const cloudSaveData = remoteEnvelope?.save_data ?? null;
    const expectedWasProvided = typeof expectedCloudExists === "boolean";
    const versionChanged = cloudConflictVersionChanged({
      expectedCloudExists,
      expectedCloudSaveData,
      expectedLocalSource,
      cloudExists,
      cloudSaveData,
      localSource,
    });
    if (expectedWasProvided && versionChanged) {
      outcome = choiceRequiredOutcome({
        localProgress,
        cloudProgress: remoteProgress,
        localSource,
        cloudExists,
        cloudSaveData,
        updatedAt: timestampToIso(remoteEnvelope?.updated_at),
        reason: "changed",
        comparison: "changed",
      });
      return;
    }

    const choice = chooseSaveWinner(localProgress, remoteProgress, {
      allowLocal,
      decision,
    });
    if (choice.winner === "choice") {
      outcome = choiceRequiredOutcome({
        localProgress,
        cloudProgress: remoteProgress,
        localSource,
        cloudExists,
        cloudSaveData,
        updatedAt: timestampToIso(remoteEnvelope?.updated_at),
        repairs: localParsed?.repairs ?? [],
        reason: choice.choiceReason,
        comparison: choice.comparison,
      });
      return;
    }
    let selected = choice.progress;
    if (!selected?.profile && !remoteProgress?.profile) {
      outcome = {
        progress: allowLocal
          ? (localProgress ?? remoteProgress ?? localCandidate ?? null)
          : (remoteProgress ?? null),
        winner: "none",
        comparison: choice.comparison,
        repairs: localParsed?.repairs ?? [],
        updatedAt: timestampToIso(remoteEnvelope?.updated_at),
        uploaded: false,
        notice: "",
      };
      return;
    }
    if (!selected?.profile && remoteProgress?.profile)
      selected = remoteProgress;
    if (!selected?.profile)
      throw new Error(
        "This copy does not include a game profile. Choose another copy.",
      );

    if (choice.winner === "local" && remoteRaw) {
      writeRecoveryCopy(
        remoteRaw,
        storage,
        "The previous online copy could not be saved for recovery. Nothing was overwritten.",
        choice.selectedByUser
          ? "Online copy set aside after you chose progress from this device."
          : "Online copy set aside before progress from this device was saved online.",
      );
    } else if (
      choice.winner === "cloud" &&
      localProgress?.profile &&
      !sameSave(localProgress, remoteProgress)
    ) {
      writeRecoveryCopy(
        localProgress,
        storage,
        "The copy on this device could not be saved for recovery. The online progress was not applied.",
        choice.selectedByUser
          ? "Device copy set aside after you chose the online progress."
          : "Device copy set aside when the online progress was kept.",
      );
    }

    const previous = choice.winner === "local" ? remoteProgress : localProgress;
    selected = preservePermanentCosmetics(previous, selected);
    // A repaired cloud snapshot is safe to use locally but is not silently
    // rewritten: its exact original remains in Firestore until a real local
    // winner replaces it, at which point the recovery copy is mandatory.
    const shouldUpload = !remoteProgress || !sameSave(selected, remoteProgress);
    if (shouldUpload) {
      transaction.set(reference, {
        save_data: encodeCloudSave(selected),
        updated_at: serverTimestamp(),
        // Keep the last successfully published alias until its replacement is
        // committed. Profile-index writes happen after this private save.
        public_profile_id: remoteEnvelope?.public_profile_id ?? null,
      });
    }

    let notice = "";
    if (
      choice.selectedByUser &&
      localProgress?.profile &&
      remoteProgress?.profile
    ) {
      notice =
        choice.winner === "local"
          ? "You chose progress from this device. The online copy is saved in Settings."
          : "You chose the online progress. The device copy is saved in Settings.";
    } else if (choice.winner === "local" && remoteProgress) {
      notice =
        "This device had more progress, so it was backed up online. The previous online copy is saved in Settings.";
    } else if (
      choice.winner === "cloud" &&
      localProgress?.profile &&
      !sameSave(localProgress, remoteProgress)
    ) {
      notice =
        "The online progress was ahead. The previous device copy is saved in Settings.";
    } else if (choice.winner === "local" && !remoteProgress) {
      notice =
        "Your existing progress on this device was added to this online account.";
    }
    outcome = {
      progress: selected,
      winner: choice.winner,
      comparison: choice.comparison,
      repairs:
        choice.winner === "cloud"
          ? (remoteParsed?.repairs ?? [])
          : (localParsed?.repairs ?? []),
      updatedAt: shouldUpload
        ? new Date().toISOString()
        : timestampToIso(remoteEnvelope?.updated_at),
      uploaded: shouldUpload,
      publicProfilePublished: false,
      notice,
    };
  });

  if (!outcome)
    throw new Error(
      "Your online progress could not be updated. Try again before playing.",
    );

  if (outcome.progress?.profile) {
    try {
      const publication = await publishPublicProfile(userId, outcome.progress);
      outcome.publicProfilePublished = publication.published;
      if (publication.conflict) {
        const collision = `Your progress is safe, but “${outcome.progress.profile.username}” is already used by another public profile. Choose a different name before sharing it.`;
        outcome.notice = [outcome.notice, collision].filter(Boolean).join(" ");
      }
    } catch (error) {
      outcome.publicProfilePublished = false;
      const missingRules =
        error?.code === "permission-denied" ||
        error?.code === "firestore/permission-denied";
      const publicationNotice = missingRules
        ? "Your progress is backed up, but your public profile is unavailable right now."
        : "Your progress is backed up, but your public profile could not be updated. Try again later.";
      outcome.notice = [outcome.notice, publicationNotice]
        .filter(Boolean)
        .join(" ");
    }
  }
  return outcome;
}

export async function deleteCloudSave(userId, progress = null) {
  if (!userId) return { exists: false, envelope: null };
  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  let deletedEnvelope = null;
  let deletedPublicProfiles = [];
  // Keep the private save and public listing in one transaction; a permission
  // error must abort both deletes rather than orphan a profile.
  await runTransaction(database, async (transaction) => {
    const saveSnapshot = await transaction.get(saveReference);
    const envelope = saveSnapshot.exists() ? saveSnapshot.data() : null;
    deletedEnvelope = envelope;
    const publicIds = new Set();
    const addPublicId = (username) => {
      const id = publicProfileId(username);
      if (id) publicIds.add(id);
    };
    addPublicId(envelope?.public_profile_id);
    addPublicId(progress?.profile?.username);
    if (envelope?.save_data) {
      try {
        const raw = decodeCloudSave(envelope.save_data);
        const parsed = parseAndRepairProgress(JSON.stringify(raw)).progress;
        addPublicId(parsed.profile?.username);
      } catch {
        // A damaged save could hide a different public username. Do not delete
        // any part of the account until the full cleanup set can be verified.
        throw publicProfileCleanupError();
      }
    }
    const publicReferences = [...publicIds].map((id) =>
      doc(database, PUBLIC_PROFILE_COLLECTION, id),
    );
    const publicSnapshots = await Promise.all(
      publicReferences.map((reference) => transaction.get(reference)),
    );
    deletedPublicProfiles = publicSnapshots.flatMap((snapshot, index) =>
      snapshot.exists() && snapshot.data()?.owner_uid === userId
        ? [{ id: publicReferences[index].id, data: snapshot.data() }]
        : [],
    );
    transaction.delete(saveReference);
    publicSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists() && snapshot.data()?.owner_uid === userId)
        transaction.delete(publicReferences[index]);
    });
  });
  return {
    exists: Boolean(deletedEnvelope || deletedPublicProfiles.length),
    envelope: deletedEnvelope,
    publicProfiles: deletedPublicProfiles,
  };
}

// Account deletion removes Firestore first so an auth failure can be undone.
// Restore only when no newer save has appeared, never overwriting concurrent
// progress that another tab or session may have written in the meantime.
export async function restoreCloudSaveSnapshot(userId, snapshot) {
  const envelope = snapshot?.envelope;
  const publicProfiles = Array.isArray(snapshot?.publicProfiles)
    ? snapshot.publicProfiles.filter(
        (profile) =>
          typeof profile?.id === "string" && profile.data?.owner_uid === userId,
      )
    : [];
  if (!userId || (!envelope?.save_data && !publicProfiles.length))
    return { restored: false };

  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const publicReferences = publicProfiles.map((profile) =>
    doc(database, PUBLIC_PROFILE_COLLECTION, profile.id),
  );
  let restored = false;
  let conflict = false;

  await runTransaction(database, async (transaction) => {
    const currentSave = await transaction.get(saveReference);
    if (currentSave.exists()) {
      conflict = true;
      return;
    }
    const currentProfiles = await Promise.all(
      publicReferences.map((reference) => transaction.get(reference)),
    );
    if (envelope?.save_data) transaction.set(saveReference, envelope);
    let restoredAnything = Boolean(envelope?.save_data);
    currentProfiles.forEach((current, index) => {
      if (current.exists() && current.data()?.owner_uid !== userId) {
        conflict = true;
        return;
      }
      transaction.set(publicReferences[index], publicProfiles[index].data);
      restoredAnything = true;
    });
    restored = restoredAnything;
  });

  if (!restored) return { restored: false, conflict };
  if (envelope?.save_data)
    try {
      const raw = decodeCloudSave(envelope.save_data);
      const progress = parseAndRepairProgress(JSON.stringify(raw)).progress;
      if (progress.profile) await publishPublicProfile(userId, progress);
    } catch {
      // The private save is restored even if public-profile rules or availability
      // prevent its index entry from being recreated in this attempt.
    }
  return { restored: true, conflict };
}
