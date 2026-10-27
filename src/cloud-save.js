import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestoreDb, firebaseConfigured } from "./firebase.js";
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
 * Compare the saved cycle generation. Each counter only resets when the
 * counter to its left advances: fresh start, rollback, prestige, then rebirth.
 * That lets us recognize a deliberate newer cycle without treating its reset
 * wallet/collection as evidence that an older snapshot is richer.
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
 * Compare two same-profile saves as a partial order, not a guessed timestamp or
 * one weighted score. A later explicit reset/cycle generation wins first; in
 * the same generation, a save is richer only if it is at least as strong in
 * every measured dimension and ahead in one or more. Ties and mixed evidence
 * deliberately return cloud as the safe winner.
 */
export function compareSaveRichness(local, cloud) {
  if (!local?.profile && !cloud?.profile) return "equal";
  if (!local?.profile) return "cloud";
  if (!cloud?.profile) return "local";
  if (local.profile.id !== cloud.profile.id) return "incomparable";
  const epoch = compareSaveEpoch(local, cloud);
  if (epoch !== "same") return epoch;

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
    "cooldownUntil",
    "receiptFloor",
  ])
    compareNumber(local[key], cloud[key]);
  for (const key of ["rolls", "spent", "companions", "skills", "boosts"])
    compareNumber(localTally[key], cloudTally[key]);
  compareNumber(localTally.best?.ep, cloudTally.best?.ep);
  compareNumber(local.history?.length, cloud.history?.length);

  for (const key of ["discovered", "owned", "pets", "skills", "bookmarks"])
    compareSet(local[key], cloud[key]);
  compareSet(localTally.badges, cloudTally.badges);
  compareSet(localTally.discovered, cloudTally.discovered);
  compareSet(localTally.pets, cloudTally.pets);
  compareSet(local.rngweenLimited?.auras, cloud.rngweenLimited?.auras);
  compareSet(Object.keys(local.events ?? {}), Object.keys(cloud.events ?? {}));
  compareSet(
    (local.loadouts ?? []).map((entry) => entry?.id),
    (cloud.loadouts ?? []).map((entry) => entry?.id),
  );
  compareSet(
    local.profile.avatar ? [local.profile.avatar] : [],
    cloud.profile.avatar ? [cloud.profile.avatar] : [],
  );
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

export function chooseSaveWinner(local, cloud, { allowLocal = true } = {}) {
  if (!cloud) {
    return {
      progress: allowLocal ? local : null,
      winner: allowLocal && local?.profile ? "local" : "none",
      comparison: "no-cloud-save",
    };
  }
  const comparison = compareSaveRichness(local, cloud);
  if (allowLocal && comparison === "local")
    return { progress: local, winner: "local", comparison };
  return { progress: cloud, winner: "cloud", comparison };
}

function sameSave(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function writeRecoveryCopy(progress, storage, message, reason) {
  const raw =
    typeof progress === "string" ? progress : JSON.stringify(progress);
  if (!writeCloudRecovery(raw, { storage, reason })) throw new Error(message);
}

export function encodeCloudSave(progress) {
  const raw = JSON.stringify(progress);
  if (!isReadableSave(raw))
    throw new Error("The progress snapshot is not a readable save.");
  const packed = packVaultSave(raw);
  const bytes = new TextEncoder().encode(packed).byteLength;
  if (bytes > FIRESTORE_SAVE_LIMIT_BYTES)
    throw new Error(
      "This save is too large for Firestore. Keep the local save and contact support.",
    );
  return packed;
}

export function decodeCloudSave(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string")
    throw new Error("The cloud save has an unsupported format.");
  const raw = unpackVaultSave(value);
  if (!isReadableSave(raw))
    throw new Error("The cloud save could not be decompressed or read.");
  return JSON.parse(raw);
}

function requireFirestore() {
  if (!firebaseConfigured || !firestoreDb)
    throw new Error("Firebase cloud saves are not configured in this build.");
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
  if (!userId) throw new Error("Sign in before loading a cloud save.");
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
  if (!userId) throw new Error("Sign in before saving to the cloud.");
  const database = requireFirestore();
  await setDoc(doc(database, CLOUD_SAVE_COLLECTION, userId), {
    save_data: encodeCloudSave(progress),
    updated_at: serverTimestamp(),
  });
  return new Date().toISOString();
}

/**
 * Read and reconcile both snapshots in one Firestore transaction. A later
 * explicit cycle/reset generation wins; within one generation local replaces
 * cloud only by strict dominance. The displaced version is first written to
 * the browser's separate recovery slot; localStorage remains the live save.
 */
export async function reconcileCloudSave(
  userId,
  localCandidate,
  { allowLocal = true, storage } = {},
) {
  if (!userId) throw new Error("Sign in before reconciling a cloud save.");
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
      throw new Error("This cloud account has no saved game profile yet.");

    const choice = chooseSaveWinner(localProgress, remoteProgress, {
      allowLocal,
    });
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
      throw new Error("The selected save has no game profile to synchronize.");

    if (choice.winner === "local" && remoteRaw) {
      writeRecoveryCopy(
        remoteRaw,
        storage,
        "The previous cloud save could not be kept in the local recovery copy. Nothing was overwritten.",
        "Cloud save before a richer local save replaced it.",
      );
    } else if (
      choice.winner === "cloud" &&
      localProgress?.profile &&
      !sameSave(localProgress, remoteProgress)
    ) {
      writeRecoveryCopy(
        localProgress,
        storage,
        "This browser's save could not be kept in the local recovery copy. The cloud save was not applied locally.",
        "Browser save displaced by an existing cloud save.",
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
      });
    }

    let notice = "";
    const epochWinner = compareSaveEpoch(localProgress, remoteProgress);
    if (choice.winner === "local" && remoteProgress) {
      notice =
        epochWinner === "local"
          ? "This browser is in a later reset/cycle, so that newer game state was synced. The displaced cloud save is in the local recovery copy."
          : "This browser had strictly richer progress, so it was synced to the cloud. The displaced cloud save is in the local recovery copy.";
    } else if (
      choice.winner === "cloud" &&
      localProgress?.profile &&
      !sameSave(localProgress, remoteProgress)
    ) {
      const reason =
        epochWinner === "cloud"
          ? "the cloud save is from a later reset/cycle"
          : choice.comparison === "equal"
            ? "the saves were tied"
            : choice.comparison === "incomparable"
              ? "the saves were incomparable"
              : "the cloud save was richer";
      notice = `The cloud save was kept because ${reason}. The displaced browser save is in the local recovery copy.`;
    } else if (choice.winner === "local" && !remoteProgress) {
      notice = "Your existing local save was imported to this cloud account.";
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
      notice,
    };
  });

  if (!outcome)
    throw new Error(
      "The cloud save could not be reconciled. Retry before playing.",
    );
  return outcome;
}

export async function deleteCloudSave(userId) {
  if (!userId) return;
  const database = requireFirestore();
  await deleteDoc(doc(database, CLOUD_SAVE_COLLECTION, userId));
}
