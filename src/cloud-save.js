import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
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
  validAvatar,
} from "./progress.js";
import {
  isReadableSave,
  packVaultSave,
  unpackVaultSave,
  writeCloudRecovery,
} from "./save-vault.js";
import { productById } from "./shop-data.js";
import {
  UNKNOWN_CLOUD_OWNER,
  isCloudUserDeleted,
  readCloudOwner,
  writeCloudOwner,
} from "./save-owner.js";

export { readCloudOwner, writeCloudOwner };

const CLOUD_SAVE_COLLECTION = "player_saves";
const CLOUD_PROFILE_SETTINGS_COLLECTION = "cloud_profile_settings";
const CLOUD_PROFILE_NAME_COLLECTION = "cloud_profile_names";
const CLOUD_SAVE_WRITE_LIMIT_COLLECTION = "cloud_save_write_limits";
const CLOUD_PUBLIC_PROFILE_WRITE_LIMIT_COLLECTION =
  "cloud_public_profile_write_limits";
const PUBLIC_PROFILE_OWNER_COLLECTION = "public_profile_owners";
const CLOUD_SAVE_WRITE_INTERVAL_MS = 2_000;
const CLOUD_PROFILE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;
const CLOUD_PROFILE_AVATAR_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;
const CLOUD_DIRTY_KEY = "rng-infinite-cloud-dirty-v1";
const CLOUD_DIRTY_USER_PREFIX = `${CLOUD_DIRTY_KEY}:`;
const CLOUD_CACHE_PREFIX = "rng-infinite-cloud-cache-v1:";
const UNKNOWN_CLOUD_CACHE_KEY = `${CLOUD_CACHE_PREFIX}unknown-owner`;
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

export function cloudAccountOwnsLocalSave(userId, localOwner) {
  return (
    typeof userId === "string" &&
    userId.length > 0 &&
    typeof localOwner === "string" &&
    localOwner === userId
  );
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
  return userId === UNKNOWN_CLOUD_OWNER
    ? UNKNOWN_CLOUD_CACHE_KEY
    : `${CLOUD_CACHE_PREFIX}uid:${encodeURIComponent(userId)}`;
}

// Older builds used the encoded UID directly after the prefix. Continue to
// read and clear that shape while all new writes use disjoint namespaces.
function legacyCloudCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

export function cacheLocalSaveForUser(userId, raw, storage) {
  if (typeof userId === "string" && isCloudUserDeleted(userId, storage))
    return false;
  if (
    (typeof userId !== "string" && userId !== UNKNOWN_CLOUD_OWNER) ||
    (typeof userId === "string" && !userId) ||
    typeof raw !== "string" ||
    !raw
  )
    return false;
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
  if (
    !userId ||
    userId === UNKNOWN_CLOUD_OWNER ||
    isCloudUserDeleted(userId, storage)
  )
    return null;
  try {
    const target = storageRef(storage);
    return (
      target?.getItem(cloudCacheKey(userId)) ??
      target?.getItem(legacyCloudCacheKey(userId)) ??
      null
    );
  } catch {
    return null;
  }
}

export function removeCachedSaveForUser(userId, storage) {
  if (typeof userId !== "string" || !userId) return false;
  try {
    const target = storageRef(storage);
    if (!target) return false;
    target.removeItem(cloudCacheKey(userId));
    target.removeItem(legacyCloudCacheKey(userId));
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

function writeRecoveryCopy(progress, storage, message, reason, ownerId = null) {
  const raw =
    typeof progress === "string" ? progress : JSON.stringify(progress);
  if (!writeCloudRecovery(raw, { storage, reason, ownerId }))
    throw new Error(message);
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

function timestampToMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") {
    try {
      return value.toMillis();
    } catch {
      return null;
    }
  }
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function profileSettingsRef(database, userId) {
  return doc(database, CLOUD_PROFILE_SETTINGS_COLLECTION, userId);
}

function profileNameRef(database, usernameKey) {
  return doc(database, CLOUD_PROFILE_NAME_COLLECTION, usernameKey);
}

function saveWriteLimitRef(database, userId) {
  return doc(database, CLOUD_SAVE_WRITE_LIMIT_COLLECTION, userId);
}

function publicProfileWriteLimitRef(database, userId) {
  return doc(database, CLOUD_PUBLIC_PROFILE_WRITE_LIMIT_COLLECTION, userId);
}

export function cloudProfileIdentity(settings, expectedUsername) {
  const expectedKey = publicProfileId(expectedUsername);
  const usernameKey =
    typeof settings?.username_key === "string" ? settings.username_key : null;
  const nameChangedAt = timestampToIso(settings?.username_changed_at);
  const avatarChangedAt = timestampToIso(settings?.avatar_changed_at);
  const nameChangedAtMs = timestampToMillis(settings?.username_changed_at);
  const avatarChangedAtMs = timestampToMillis(settings?.avatar_changed_at);
  return {
    reserved: Boolean(expectedKey && usernameKey === expectedKey),
    usernameKey,
    nameChangedAt,
    nameChangeAvailableAt:
      nameChangedAtMs == null
        ? null
        : new Date(
            nameChangedAtMs + CLOUD_PROFILE_RENAME_COOLDOWN_MS,
          ).toISOString(),
    avatarChangedAt,
    avatarChangeAvailableAt:
      avatarChangedAtMs == null
        ? null
        : new Date(
            avatarChangedAtMs + CLOUD_PROFILE_AVATAR_COOLDOWN_MS,
          ).toISOString(),
  };
}

function cloudProfileSettingsDocument({
  usernameKey,
  profileId,
  avatar,
  nameChangedAt = null,
  avatarChangedAt = null,
  updatedAt = serverTimestamp(),
}) {
  return {
    username_key: usernameKey,
    profile_id: profileId,
    username_changed_at: nameChangedAt,
    avatar: validAvatar(avatar) ? avatar : null,
    avatar_changed_at: avatarChangedAt,
    updated_at: updatedAt,
  };
}

function cloudSaveWriteLimitDocument() {
  return { last_write_at: serverTimestamp() };
}

export function cloudSaveWriteWaitMs(limitData, now = Date.now()) {
  const lastWrite = timestampToMillis(limitData?.last_write_at);
  return lastWrite == null
    ? 0
    : Math.max(0, lastWrite + CLOUD_SAVE_WRITE_INTERVAL_MS - now);
}

function isCloudWriteCooldownError(error) {
  return /wait a couple of seconds before (saving Cloud progress|updating the public profile|restoring Cloud progress)(?: again)?/i.test(
    String(error?.message ?? ""),
  );
}

async function runCloudTransaction(database, updateFunction) {
  let retries = 0;
  while (true) {
    try {
      return await runTransaction(database, updateFunction);
    } catch (error) {
      if (!isCloudWriteCooldownError(error) || retries >= 2) throw error;
      retries += 1;
      await new Promise((resolve) =>
        setTimeout(resolve, CLOUD_SAVE_WRITE_INTERVAL_MS + 350),
      );
    }
  }
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

export async function createCloudProfile(userId, progress) {
  if (!userId) throw new Error("Sign in before creating an online profile.");
  if (!progress?.profile)
    throw new Error("Create a profile before saving online.");
  const usernameKey = publicProfileId(progress.profile.username);
  if (!usernameKey) throw new Error("Choose a valid Cloud profile name.");

  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const nameReference = profileNameRef(database, usernameKey);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  let savedProgress = null;

  await runCloudTransaction(database, async (transaction) => {
    const [saveSnapshot, settingsSnapshot, writeLimitSnapshot] =
      await Promise.all([
        transaction.get(saveReference),
        transaction.get(settingsReference),
        transaction.get(writeLimitReference),
      ]);
    if (saveSnapshot.exists())
      throw new Error("This Cloud account already has a game profile.");
    const waitMs = cloudSaveWriteWaitMs(
      writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
    );
    if (waitMs > 0)
      throw new Error(
        "Wait a couple of seconds before saving Cloud progress again.",
      );

    const previousSettings = settingsSnapshot.exists()
      ? settingsSnapshot.data()
      : null;
    const previousNameKey = previousSettings?.username_key ?? null;
    const usernameChangedAt =
      previousNameKey === usernameKey
        ? (previousSettings?.username_changed_at ?? serverTimestamp())
        : serverTimestamp();
    const requestedAvatar = validAvatar(progress.profile.avatar)
      ? progress.profile.avatar
      : null;
    // Recreating a game profile on the same Cloud account preserves its
    // account-level logo and cooldown instead of resetting the seven-day clock.
    const avatar =
      requestedAvatar ??
      (validAvatar(previousSettings?.avatar) ? previousSettings.avatar : null);
    const avatarChangedAt =
      avatar === (previousSettings?.avatar ?? null)
        ? (previousSettings?.avatar_changed_at ?? null)
        : avatar
          ? serverTimestamp()
          : null;
    const profile = {
      ...progress.profile,
      username: usernameKey,
      ...(avatar ? { avatar } : {}),
    };
    if (!avatar) delete profile.avatar;
    savedProgress = { ...progress, profile };

    transaction.set(nameReference, {
      owner_uid: userId,
      profile_id: progress.profile.id,
    });
    transaction.set(
      settingsReference,
      cloudProfileSettingsDocument({
        usernameKey,
        profileId: progress.profile.id,
        avatar,
        nameChangedAt: usernameChangedAt,
        avatarChangedAt,
      }),
    );
    transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
    transaction.set(saveReference, {
      save_data: encodeCloudSave(savedProgress),
      updated_at: serverTimestamp(),
      public_profile_id: null,
      public_profile_enabled: false,
    });
  });

  const settingsSnapshot = await getDoc(settingsReference);
  return {
    progress: savedProgress ?? progress,
    updatedAt: new Date().toISOString(),
    profileIdentity: cloudProfileIdentity(
      settingsSnapshot.exists() ? settingsSnapshot.data() : null,
      usernameKey,
    ),
  };
}

async function ensureCloudProfileSettings(userId, progress) {
  if (!userId || !progress?.profile)
    return { reserved: false, settings: null, profileIdentity: null };
  const usernameKey = publicProfileId(progress.profile.username);
  if (!usernameKey)
    return { reserved: false, settings: null, profileIdentity: null };

  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const nameReference = profileNameRef(database, usernameKey);
  const currentSnapshot = await getDoc(settingsReference);
  if (currentSnapshot.exists()) {
    const current = currentSnapshot.data();
    if (current.username_key && current.username_key !== usernameKey)
      return {
        reserved: false,
        settings: current,
        profileIdentity: cloudProfileIdentity(current, usernameKey),
      };

    try {
      await runCloudTransaction(database, async (transaction) => {
        const [settingsSnapshot, saveSnapshot] = await Promise.all([
          transaction.get(settingsReference),
          transaction.get(saveReference),
        ]);
        if (!settingsSnapshot.exists() || !saveSnapshot.exists())
          throw new Error("The online profile changed. Reload and try again.");
        const settings = settingsSnapshot.data();
        const remote = parseAndRepairProgress(
          JSON.stringify(decodeCloudSave(saveSnapshot.data().save_data)),
        ).progress;
        if (remote.profile?.id !== progress.profile.id)
          throw new Error("The online profile changed. Reload and try again.");
        if (settings.username_key && settings.username_key !== usernameKey)
          throw new Error(
            "This profile name no longer matches the online account.",
          );
        const identityChanged =
          settings.username_key !== usernameKey ||
          settings.profile_id !== progress.profile.id;
        if (identityChanged) {
          transaction.set(settingsReference, {
            ...settings,
            username_key: usernameKey,
            profile_id: progress.profile.id,
            username_changed_at:
              settings.username_key === usernameKey
                ? settings.username_changed_at
                : serverTimestamp(),
            updated_at: serverTimestamp(),
          });
        }
        transaction.set(nameReference, {
          owner_uid: userId,
          profile_id: progress.profile.id,
        });
      });
    } catch (error) {
      if (
        error?.code !== "permission-denied" &&
        error?.code !== "firestore/permission-denied"
      )
        throw error;
      const latest = await getDoc(settingsReference);
      const settings = latest.exists() ? latest.data() : current;
      return {
        reserved: false,
        settings,
        profileIdentity: {
          ...cloudProfileIdentity(settings, usernameKey),
          reserved: false,
        },
      };
    }
    const latest = await getDoc(settingsReference);
    const settings = latest.exists() ? latest.data() : current;
    return {
      reserved: settings.username_key === usernameKey,
      settings,
      profileIdentity: cloudProfileIdentity(settings, usernameKey),
    };
  }

  const tryCreateSettings = async (reserveName) => {
    let created = null;
    await runCloudTransaction(database, async (transaction) => {
      const [saveSnapshot, settingsSnapshot] = await Promise.all([
        transaction.get(saveReference),
        transaction.get(settingsReference),
      ]);
      if (settingsSnapshot.exists()) {
        created = settingsSnapshot.data();
        return;
      }
      if (!saveSnapshot.exists())
        throw new Error("The online profile changed. Reload and try again.");
      const remote = parseAndRepairProgress(
        JSON.stringify(decodeCloudSave(saveSnapshot.data().save_data)),
      ).progress;
      if (remote.profile?.id !== progress.profile.id)
        throw new Error("The online profile changed. Reload and try again.");
      const avatar = validAvatar(progress.profile.avatar)
        ? progress.profile.avatar
        : null;
      created = cloudProfileSettingsDocument({
        usernameKey: reserveName ? usernameKey : null,
        profileId: progress.profile.id,
        avatar,
        nameChangedAt: reserveName ? serverTimestamp() : null,
        avatarChangedAt: avatar ? serverTimestamp() : null,
      });
      transaction.set(settingsReference, created);
      if (reserveName)
        transaction.set(nameReference, {
          owner_uid: userId,
          profile_id: progress.profile.id,
        });
    });
    const latest = await getDoc(settingsReference);
    const settings = latest.exists() ? latest.data() : created;
    return {
      reserved: settings?.username_key === usernameKey,
      settings,
      profileIdentity: cloudProfileIdentity(settings, usernameKey),
    };
  };

  try {
    return await tryCreateSettings(true);
  } catch (error) {
    if (
      error?.code !== "permission-denied" &&
      error?.code !== "firestore/permission-denied"
    )
      throw error;
    // A failed claim never leaks the reserved name: create a UID-private
    // cooldown record without the name, so the existing Cloud save can keep
    // syncing while its owner chooses a free alias.
    return tryCreateSettings(false);
  }
}

export async function writeCloudSave(userId, progress) {
  if (!userId) throw new Error("Sign in before backing up progress online.");
  if (!progress?.profile)
    throw new Error("Create a profile before saving online.");
  const database = requireFirestore();
  const reference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const existingSave = await getDoc(reference);
  if (!existingSave.exists())
    return (await createCloudProfile(userId, progress)).updatedAt;
  await ensureCloudProfileSettings(userId, progress);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  await runCloudTransaction(database, async (transaction) => {
    const [snapshot, writeLimitSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(writeLimitReference),
    ]);
    const waitMs = cloudSaveWriteWaitMs(
      writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
    );
    if (waitMs > 0)
      throw new Error(
        "Wait a couple of seconds before saving Cloud progress again.",
      );
    const envelope = snapshot.exists() ? snapshot.data() : null;
    transaction.set(reference, {
      save_data: encodeCloudSave(progress),
      updated_at: serverTimestamp(),
      public_profile_id: envelope?.public_profile_id ?? null,
      public_profile_enabled: envelope?.public_profile_enabled === true,
    });
    transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
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

async function publishPublicProfile(
  userId,
  expectedProgress = null,
  { enable = null } = {},
) {
  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const profileWriteLimitReference = publicProfileWriteLimitRef(
    database,
    userId,
  );
  const saveSnapshot = await getDoc(saveReference);
  if (!saveSnapshot.exists())
    throw new Error(
      "Your progress changed before your public profile could be updated. Try again.",
    );
  const remoteProgress = parseAndRepairProgress(
    JSON.stringify(decodeCloudSave(saveSnapshot.data().save_data)),
  ).progress;
  const expected = expectedProgress ?? remoteProgress;
  const identity = await ensureCloudProfileSettings(userId, expected);
  const nextEnabled =
    typeof enable === "boolean"
      ? enable
      : saveSnapshot.data().public_profile_enabled === true;
  if (nextEnabled && !identity.reserved)
    return {
      enabled: saveSnapshot.data().public_profile_enabled === true,
      published: false,
      conflict: true,
      identityConflict: true,
      profileIdentity: identity.profileIdentity,
    };

  let published = false;
  let enabled = false;
  let conflict = false;
  let profileIdentity = identity.profileIdentity;
  let previousPublicProfile = null;
  const runPublishTransaction = (skipPreviousAliasReads = false) =>
    runCloudTransaction(database, async (transaction) => {
      const writeLimitReference = saveWriteLimitRef(database, userId);
      const [
        currentSave,
        settingsSnapshot,
        writeLimitSnapshot,
        profileWriteLimitSnapshot,
      ] = await Promise.all([
        transaction.get(saveReference),
        transaction.get(settingsReference),
        transaction.get(writeLimitReference),
        transaction.get(profileWriteLimitReference),
      ]);
      if (!currentSave.exists() || !settingsSnapshot.exists())
        throw new Error(
          "Your progress changed before your public profile could be updated. Try again.",
        );
      const envelope = currentSave.data();
      const settings = settingsSnapshot.data();
      const remote = parseAndRepairProgress(
        JSON.stringify(decodeCloudSave(envelope.save_data)),
      ).progress;
      if (expectedProgress && !sameSave(remote, expectedProgress))
        throw new Error(
          "Your progress changed before your public profile could be updated. Try again.",
        );
      enabled =
        typeof enable === "boolean"
          ? enable
          : envelope.public_profile_enabled === true;
      const currentNameKey = publicProfileId(remote.profile?.username);
      previousPublicProfile = {
        enabled: envelope.public_profile_enabled === true,
        id: publicProfileIdFromEnvelope(envelope) || currentNameKey,
      };
      const publicId = settings.username_key || currentNameKey;
      const identityMatches = Boolean(
        publicId &&
        settings.username_key === publicId &&
        settings.profile_id === remote.profile?.id &&
        currentNameKey === publicId,
      );
      profileIdentity = cloudProfileIdentity(settings, currentNameKey);
      if (enabled && !identityMatches) {
        conflict = true;
        return;
      }
      const publicProfile = identityMatches
        ? publicProfileDocument(userId, remote, new Date(), {
            avatar: settings.avatar,
          })
        : null;
      const previousId =
        publicProfileIdFromEnvelope(envelope) || currentNameKey;
      const shouldReadPrevious =
        enabled ||
        envelope.public_profile_enabled !== false ||
        Boolean(envelope.public_profile_id);
      const ids = [
        ...new Set(
          (enabled
            ? [...(skipPreviousAliasReads ? [] : [previousId]), publicId]
            : shouldReadPrevious && !skipPreviousAliasReads
              ? [previousId]
              : []
          ).filter(Boolean),
        ),
      ];
      const references = ids.map((id) =>
        doc(database, PUBLIC_PROFILE_COLLECTION, id),
      );
      const ownerReferences = ids.map((id) =>
        doc(database, PUBLIC_PROFILE_OWNER_COLLECTION, id),
      );
      const snapshots = await Promise.all(
        references.map((reference) => transaction.get(reference)),
      );
      const ownerSnapshots = await Promise.all(
        ownerReferences.map((reference) => transaction.get(reference)),
      );
      const snapshotFor = new Map(
        ids.map((id, index) => [id, snapshots[index]]),
      );
      const ownerSnapshotFor = new Map(
        ids.map((id, index) => [id, ownerSnapshots[index]]),
      );
      const publicSnapshot = snapshotFor.get(publicId);
      const previousSnapshot = previousId ? snapshotFor.get(previousId) : null;
      const currentOwnerSnapshot = ownerSnapshotFor.get(publicId);
      const targetHasArtifacts = Boolean(
        publicSnapshot?.exists() || currentOwnerSnapshot?.exists(),
      );
      const ownsCurrent =
        targetHasArtifacts &&
        publicAliasOwnedByUser({
          userId,
          profileSnapshot: publicSnapshot,
          ownerSnapshot: currentOwnerSnapshot,
          profileId: publicId,
          linkedToThisSave:
            envelope.public_profile_enabled === true &&
            envelope.public_profile_id === publicId,
        });

      published = enabled && (!targetHasArtifacts || ownsCurrent);
      conflict = enabled && !published;
      // Never remove a previous alias, or alter the save's consent bit, when a
      // target name conflicts. A collision cannot unpublish the current owner.
      if (enabled && conflict) return;

      if (!enabled) {
        for (let index = 0; index < references.length; index++) {
          const id = ids[index];
          const ownerData = ownerSnapshots[index]?.exists()
            ? ownerSnapshots[index].data()
            : null;
          const linkedToThisSave =
            envelope.public_profile_enabled === true &&
            envelope.public_profile_id === id;
          const ownsAlias = publicAliasOwnedByUser({
            userId,
            profileSnapshot: snapshots[index],
            ownerSnapshot: ownerSnapshots[index],
            profileId: id,
            linkedToThisSave,
          });
          if (snapshots[index].exists() && ownsAlias)
            transaction.delete(references[index]);
          if (ownerData && ownsAlias)
            transaction.delete(ownerReferences[index]);
        }
      } else {
        if (!skipPreviousAliasReads && previousId && previousId !== publicId) {
          const previousIndex = ids.indexOf(previousId);
          const ownsPreviousAlias = publicAliasOwnedByUser({
            userId,
            profileSnapshot: previousSnapshot,
            ownerSnapshot: ownerSnapshotFor.get(previousId),
            profileId: previousId,
            linkedToThisSave:
              envelope.public_profile_enabled === true &&
              envelope.public_profile_id === previousId,
          });
          if (previousSnapshot?.exists() && ownsPreviousAlias)
            transaction.delete(references[previousIndex]);
          if (ownerSnapshotFor.get(previousId)?.exists() && ownsPreviousAlias)
            transaction.delete(ownerReferences[previousIndex]);
        }
        const current = publicSnapshot?.exists() ? publicSnapshot.data() : null;
        const profileChanged =
          !current ||
          Object.prototype.hasOwnProperty.call(current, "owner_uid") ||
          current.username !== publicProfile.username ||
          current.username_key !== publicProfile.username_key ||
          JSON.stringify({ ...current.record, at: "" }) !==
            JSON.stringify({ ...publicProfile.record, at: "" });
        const currentOwner = ownerSnapshotFor.get(publicId);
        const ownerChanged =
          !currentOwner?.exists() ||
          currentOwner.data()?.owner_uid !== userId ||
          currentOwner.data()?.profile_id !== publicId;
        if (profileChanged || ownerChanged) {
          const profileWaitMs = cloudSaveWriteWaitMs(
            profileWriteLimitSnapshot.exists()
              ? profileWriteLimitSnapshot.data()
              : null,
          );
          if (profileWaitMs > 0)
            throw new Error(
              "Wait a couple of seconds before updating the public profile again.",
            );
          if (profileChanged)
            transaction.set(references[ids.indexOf(publicId)], {
              ...publicProfile,
              updated_at: serverTimestamp(),
            });
          if (ownerChanged)
            transaction.set(ownerReferences[ids.indexOf(publicId)], {
              owner_uid: userId,
              profile_id: publicId,
            });
          transaction.set(
            profileWriteLimitReference,
            cloudSaveWriteLimitDocument(),
          );
        }
      }

      const nextPublicId = published ? publicId : null;
      if (
        envelope.public_profile_enabled !== enabled ||
        envelope.public_profile_id !== nextPublicId
      ) {
        const waitMs = cloudSaveWriteWaitMs(
          writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
        );
        if (waitMs > 0)
          throw new Error(
            "Wait a couple of seconds before saving Cloud progress again.",
          );
        transaction.set(saveReference, {
          save_data: envelope.save_data,
          updated_at: serverTimestamp(),
          public_profile_id: nextPublicId,
          public_profile_enabled: enabled,
        });
        transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
      }
      profileIdentity = cloudProfileIdentity(settings, publicId);
    });
  try {
    await runPublishTransaction(false);
  } catch (error) {
    if (
      error?.code !== "permission-denied" &&
      error?.code !== "firestore/permission-denied"
    )
      throw error;
    // If a legacy save points at another account's alias, Rules deliberately
    // hide that owner's documents. Retry without touching those artifacts;
    // the save Rules permit unlinking only when the old alias is verified as
    // belonging to someone else. If it is ours, the retry is denied atomically.
    await runPublishTransaction(true);
  }
  return {
    enabled,
    published,
    conflict,
    profileIdentity,
    previousPublicProfile,
  };
}

export async function setCloudProfileVisibility(userId, enabled) {
  if (!userId) throw new Error("Sign in before changing profile visibility.");
  return publishPublicProfile(userId, null, { enable: enabled === true });
}

export async function renameCloudProfile(
  userId,
  expectedProgress,
  replacementProgress,
) {
  if (!userId)
    throw new Error("Sign in before changing your online profile name.");
  if (!expectedProgress?.profile || !replacementProgress?.profile)
    throw new Error("Create a profile before changing its name.");
  if (expectedProgress.profile.id !== replacementProgress.profile.id)
    throw new Error("Changing a profile name cannot change its stable ID.");

  const usernameKey = publicProfileId(replacementProgress.profile.username);
  if (!usernameKey) throw new Error("Choose a valid Cloud profile name.");
  const normalizedProgress = {
    ...replacementProgress,
    profile: { ...replacementProgress.profile, username: usernameKey },
  };
  const unchangedExceptName = JSON.parse(JSON.stringify(expectedProgress));
  unchangedExceptName.profile.username = normalizedProgress.profile.username;
  if (!sameSave(unchangedExceptName, normalizedProgress))
    throw new Error("A profile name change cannot replace game progress.");

  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  const profileWriteLimitReference = publicProfileWriteLimitRef(
    database,
    userId,
  );
  const initialSaveSnapshot = await getDoc(saveReference);
  if (!initialSaveSnapshot.exists()) {
    const created = await createCloudProfile(userId, normalizedProgress);
    return {
      enabled: false,
      published: false,
      renamed: true,
      profileIdentity: created.profileIdentity,
      progress: created.progress,
    };
  }
  let settingsSnapshot = await getDoc(settingsReference);
  if (!settingsSnapshot.exists()) {
    await ensureCloudProfileSettings(userId, expectedProgress);
    settingsSnapshot = await getDoc(settingsReference);
  }
  const initialSettings = settingsSnapshot.exists()
    ? settingsSnapshot.data()
    : null;
  if (!initialSettings)
    throw new Error("Choose a free Cloud profile name before sharing it.");
  const oldNameKey = initialSettings.username_key ?? null;
  const changingName = oldNameKey !== usernameKey;
  const lastNameChange = timestampToMillis(initialSettings.username_changed_at);
  if (
    changingName &&
    oldNameKey &&
    lastNameChange != null &&
    Date.now() < lastNameChange + CLOUD_PROFILE_RENAME_COOLDOWN_MS
  ) {
    const nextDate = new Date(
      lastNameChange + CLOUD_PROFILE_RENAME_COOLDOWN_MS,
    ).toLocaleString();
    throw new Error(
      `Cloud profile names can be changed once every 30 days. Try again after ${nextDate}.`,
    );
  }

  const newNameReference = profileNameRef(database, usernameKey);
  const oldNameReference = oldNameKey
    ? profileNameRef(database, oldNameKey)
    : null;
  let oldNameOwned = false;
  if (oldNameReference && oldNameKey !== usernameKey)
    try {
      const oldNameSnapshot = await getDoc(oldNameReference);
      oldNameOwned =
        oldNameSnapshot.exists() &&
        oldNameSnapshot.data()?.owner_uid === userId;
    } catch {
      // A missing or stale claim is not owned; never try to delete a name that
      // another account may have reserved after this profile was removed.
    }
  const newPublicReference = doc(
    database,
    PUBLIC_PROFILE_COLLECTION,
    usernameKey,
  );
  const newOwnerReference = doc(
    database,
    PUBLIC_PROFILE_OWNER_COLLECTION,
    usernameKey,
  );
  let enabled = false;
  let published = false;
  let renamed = false;
  const runRenameTransaction = (skipPreviousAliasReads = false) =>
    runCloudTransaction(database, async (transaction) => {
      enabled = false;
      published = false;
      renamed = false;
      const [
        saveSnapshot,
        currentSettingsSnapshot,
        writeLimitSnapshot,
        profileWriteLimitSnapshot,
      ] = await Promise.all([
        transaction.get(saveReference),
        transaction.get(settingsReference),
        transaction.get(writeLimitReference),
        transaction.get(profileWriteLimitReference),
      ]);
      if (!saveSnapshot.exists() || !currentSettingsSnapshot.exists())
        throw new Error("The online profile changed. No name was changed.");
      const envelope = saveSnapshot.data();
      const settings = currentSettingsSnapshot.data();
      const remote = parseAndRepairProgress(
        JSON.stringify(decodeCloudSave(envelope.save_data)),
      ).progress;
      if (
        remote.profile?.id !== expectedProgress.profile.id ||
        !sameSave(remote, expectedProgress)
      )
        throw new Error(
          "Your progress changed on another device. No name was changed; reload and try again.",
        );
      if (
        settings.profile_id !== remote.profile.id ||
        (settings.username_key &&
          settings.username_key !== publicProfileId(remote.profile.username))
      )
        throw new Error(
          "The Cloud profile identity changed. Reload before renaming it.",
        );

      enabled = envelope.public_profile_enabled === true;
      const previousPublicId =
        publicProfileIdFromEnvelope(envelope) ||
        publicProfileId(remote.profile.username);
      const previousPublicReference = enabled
        ? doc(database, PUBLIC_PROFILE_COLLECTION, previousPublicId)
        : null;
      const previousOwnerReference = enabled
        ? doc(database, PUBLIC_PROFILE_OWNER_COLLECTION, previousPublicId)
        : null;
      let previousPublicSnapshot = null;
      let previousOwnerSnapshot = null;
      if (enabled && !skipPreviousAliasReads)
        [previousPublicSnapshot, previousOwnerSnapshot] = await Promise.all([
          transaction.get(previousPublicReference),
          transaction.get(previousOwnerReference),
        ]);

      const waitMs = cloudSaveWriteWaitMs(
        writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
      );
      if (waitMs > 0)
        throw new Error(
          "Wait a couple of seconds before saving Cloud progress again.",
        );

      const settingsAfter = {
        ...settings,
        username_key: usernameKey,
        profile_id: normalizedProgress.profile.id,
        username_changed_at: changingName
          ? serverTimestamp()
          : settings.username_changed_at,
        updated_at: serverTimestamp(),
      };
      transaction.set(settingsReference, settingsAfter);
      transaction.set(newNameReference, {
        owner_uid: userId,
        profile_id: normalizedProgress.profile.id,
      });
      if (oldNameReference && oldNameKey !== usernameKey && oldNameOwned)
        transaction.delete(oldNameReference);

      if (enabled) {
        const profileWaitMs = cloudSaveWriteWaitMs(
          profileWriteLimitSnapshot.exists()
            ? profileWriteLimitSnapshot.data()
            : null,
        );
        if (profileWaitMs > 0)
          throw new Error(
            "Wait a couple of seconds before updating the public profile again.",
          );
        const nextPublic = publicProfileDocument(
          userId,
          normalizedProgress,
          new Date(),
          { avatar: settings.avatar },
        );
        if (
          !skipPreviousAliasReads &&
          previousPublicId &&
          previousPublicId !== usernameKey
        ) {
          const ownsPreviousAlias = publicAliasOwnedByUser({
            userId,
            profileSnapshot: previousPublicSnapshot,
            ownerSnapshot: previousOwnerSnapshot,
            profileId: previousPublicId,
            linkedToThisSave: envelope.public_profile_id === previousPublicId,
          });
          if (previousPublicSnapshot?.exists() && ownsPreviousAlias)
            transaction.delete(previousPublicReference);
          if (previousOwnerSnapshot?.exists() && ownsPreviousAlias)
            transaction.delete(previousOwnerReference);
        }
        transaction.set(newPublicReference, {
          ...nextPublic,
          updated_at: serverTimestamp(),
        });
        transaction.set(newOwnerReference, {
          owner_uid: userId,
          profile_id: usernameKey,
        });
        transaction.set(
          profileWriteLimitReference,
          cloudSaveWriteLimitDocument(),
        );
        published = true;
      }

      transaction.set(saveReference, {
        save_data: encodeCloudSave(normalizedProgress),
        updated_at: serverTimestamp(),
        public_profile_id: enabled ? usernameKey : null,
        public_profile_enabled: enabled,
      });
      transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
      renamed = true;
    });
  try {
    await runRenameTransaction(false);
  } catch (error) {
    if (
      error?.code !== "permission-denied" &&
      error?.code !== "firestore/permission-denied"
    )
      throw error;
    // Preserve a foreign legacy alias. The fallback performs no reads or
    // deletes against that account's profile documents; the save Rules only
    // permit the rename if they verify the old alias is not ours.
    await runRenameTransaction(true);
  }

  const latestSettings = await getDoc(settingsReference);
  return {
    enabled,
    published,
    renamed,
    profileIdentity: cloudProfileIdentity(
      latestSettings.exists() ? latestSettings.data() : null,
      usernameKey,
    ),
    progress: normalizedProgress,
  };
}

export async function updateCloudProfileAvatar(
  userId,
  expectedProgress,
  replacementProgress,
) {
  if (!userId)
    throw new Error("Sign in before changing your Cloud profile logo.");
  if (!expectedProgress?.profile || !replacementProgress?.profile)
    throw new Error("Create a profile before changing its logo.");
  if (expectedProgress.profile.id !== replacementProgress.profile.id)
    throw new Error("A logo change cannot change the profile ID.");
  const expectedWithoutAvatar = JSON.parse(JSON.stringify(expectedProgress));
  const replacementWithoutAvatar = JSON.parse(
    JSON.stringify(replacementProgress),
  );
  delete expectedWithoutAvatar.profile.avatar;
  delete replacementWithoutAvatar.profile.avatar;
  if (!sameSave(expectedWithoutAvatar, replacementWithoutAvatar))
    throw new Error("A logo change cannot replace game progress.");

  const avatar = validAvatar(replacementProgress.profile.avatar)
    ? replacementProgress.profile.avatar
    : null;
  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  const profileWriteLimitReference = publicProfileWriteLimitRef(
    database,
    userId,
  );
  const previewSettings = await getDoc(settingsReference);
  if (!previewSettings.exists() || !previewSettings.data().username_key)
    throw new Error(
      "Choose a free Cloud profile name before changing its logo.",
    );
  const preview = previewSettings.data();
  if (avatar !== (preview.avatar ?? null)) {
    const lastChange = timestampToMillis(preview.avatar_changed_at);
    if (
      lastChange != null &&
      Date.now() < lastChange + CLOUD_PROFILE_AVATAR_COOLDOWN_MS
    ) {
      const nextDate = new Date(
        lastChange + CLOUD_PROFILE_AVATAR_COOLDOWN_MS,
      ).toLocaleString();
      throw new Error(
        `Cloud profile logos can be changed once every 7 days. Try again after ${nextDate}.`,
      );
    }
  }

  let enabled = false;
  let profileIdentity = null;
  await runCloudTransaction(database, async (transaction) => {
    const [
      saveSnapshot,
      settingsSnapshot,
      writeLimitSnapshot,
      profileWriteLimitSnapshot,
    ] = await Promise.all([
      transaction.get(saveReference),
      transaction.get(settingsReference),
      transaction.get(writeLimitReference),
      transaction.get(profileWriteLimitReference),
    ]);
    if (!saveSnapshot.exists() || !settingsSnapshot.exists())
      throw new Error("The Cloud profile changed. No logo was changed.");
    const envelope = saveSnapshot.data();
    const settings = settingsSnapshot.data();
    const remote = parseAndRepairProgress(
      JSON.stringify(decodeCloudSave(envelope.save_data)),
    ).progress;
    if (
      remote.profile?.id !== expectedProgress.profile.id ||
      !sameSave(remote, expectedProgress)
    )
      throw new Error(
        "Your progress changed on another device. No logo was changed; reload and try again.",
      );
    if (
      !settings.username_key ||
      settings.profile_id !== remote.profile.id ||
      settings.username_key !== publicProfileId(remote.profile.username)
    )
      throw new Error(
        "Choose a free Cloud profile name before changing its logo.",
      );

    enabled = envelope.public_profile_enabled === true;
    const changed = avatar !== (settings.avatar ?? null);
    const nextSettings = {
      ...settings,
      avatar,
      avatar_changed_at: changed
        ? serverTimestamp()
        : settings.avatar_changed_at,
      updated_at: serverTimestamp(),
    };
    const waitMs = cloudSaveWriteWaitMs(
      writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
    );
    if (waitMs > 0)
      throw new Error(
        "Wait a couple of seconds before saving Cloud progress again.",
      );

    if (enabled) {
      const profileWaitMs = cloudSaveWriteWaitMs(
        profileWriteLimitSnapshot.exists()
          ? profileWriteLimitSnapshot.data()
          : null,
      );
      if (profileWaitMs > 0)
        throw new Error(
          "Wait a couple of seconds before updating the public profile again.",
        );
      const profileId = envelope.public_profile_id;
      if (profileId !== settings.username_key)
        throw new Error(
          "The public profile alias changed. Reload before changing its logo.",
        );
      const profileReference = doc(
        database,
        PUBLIC_PROFILE_COLLECTION,
        profileId,
      );
      const ownerReference = doc(
        database,
        PUBLIC_PROFILE_OWNER_COLLECTION,
        profileId,
      );
      const [profileSnapshot, ownerSnapshot] = await Promise.all([
        transaction.get(profileReference),
        transaction.get(ownerReference),
      ]);
      if (
        profileSnapshot.exists() &&
        profileSnapshot.data()?.owner_uid !== userId &&
        (!ownerSnapshot.exists() || ownerSnapshot.data()?.owner_uid !== userId)
      )
        throw new Error(
          "The public profile could not be safely verified. No logo was changed.",
        );
      const publicProfile = publicProfileDocument(
        userId,
        replacementProgress,
        new Date(),
        { avatar },
      );
      transaction.set(profileReference, {
        ...publicProfile,
        updated_at: serverTimestamp(),
      });
      transaction.set(ownerReference, {
        owner_uid: userId,
        profile_id: profileId,
      });
      transaction.set(
        profileWriteLimitReference,
        cloudSaveWriteLimitDocument(),
      );
    }

    transaction.set(settingsReference, nextSettings);
    transaction.set(saveReference, {
      save_data: encodeCloudSave(replacementProgress),
      updated_at: serverTimestamp(),
      public_profile_id: envelope.public_profile_id ?? null,
      public_profile_enabled: enabled,
    });
    transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
    profileIdentity = cloudProfileIdentity(nextSettings, settings.username_key);
  });
  return { enabled, profileIdentity };
}

function publicProfileIdFromEnvelope(envelope) {
  return publicProfileId(envelope?.public_profile_id);
}

export function isPublicAliasOwnedByUser({
  userId,
  profile,
  owner,
  profileId,
  linkedToThisSave = false,
}) {
  if (owner)
    return owner.owner_uid === userId && owner.profile_id === profileId;
  if (typeof profile?.owner_uid === "string")
    return profile.owner_uid === userId;
  return Boolean(profile && linkedToThisSave);
}

function publicAliasOwnedByUser({
  userId,
  profileSnapshot,
  ownerSnapshot,
  profileId,
  linkedToThisSave = false,
}) {
  return isPublicAliasOwnedByUser({
    userId,
    profile: profileSnapshot?.exists() ? profileSnapshot.data() : null,
    owner: ownerSnapshot?.exists() ? ownerSnapshot.data() : null,
    profileId,
    linkedToThisSave,
  });
}

export function mayUseLocalSaveForCloudUser(userId, localOwner, cloudExists) {
  if (typeof userId !== "string" || !userId) return false;
  return localOwner === userId || (!cloudExists && localOwner == null);
}

export function restoredSaveOwner({
  copyOwner,
  userId = null,
  authReady = false,
  cloudReady = false,
  cloudUserId = null,
  cloudStatus = "",
} = {}) {
  if (!authReady) return { ok: false, reason: "auth-not-ready" };
  if (!userId)
    return {
      ok: true,
      ownerId: copyOwner === undefined ? UNKNOWN_CLOUD_OWNER : copyOwner,
    };
  if (!cloudReady || cloudUserId !== userId)
    return { ok: false, reason: "cloud-not-ready" };
  if (copyOwner === userId) return { ok: true, ownerId: userId };
  if (copyOwner == null && cloudStatus === "empty")
    return { ok: true, ownerId: userId, imported: true };
  return { ok: false, reason: "different-account" };
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
    localOwner = null,
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
  const settingsReference = profileSettingsRef(database, userId);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  const candidateSource =
    typeof localCandidate === "string"
      ? localCandidate
      : localCandidate
        ? JSON.stringify(localCandidate)
        : null;
  const candidateParsed = candidateSource
    ? parseAndRepairProgress(candidateSource)
    : null;
  const candidateProgress = candidateParsed?.progress ?? null;
  const hasExpectedVersion = typeof expectedCloudExists === "boolean";
  let preflightSaveSnapshot = null;
  if (
    !hasExpectedVersion &&
    allowLocal &&
    candidateProgress?.profile &&
    mayUseLocalSaveForCloudUser(userId, localOwner, false)
  ) {
    const existingSave = await getDoc(reference);
    preflightSaveSnapshot = existingSave;
    if (!existingSave.exists()) {
      let created = null;
      let creationError = null;
      try {
        created = await createCloudProfile(userId, candidateProgress);
      } catch (error) {
        creationError = error;
        if (error?.message?.includes("Wait a couple of seconds")) {
          await new Promise((resolve) =>
            setTimeout(resolve, CLOUD_SAVE_WRITE_INTERVAL_MS + 50),
          );
          try {
            created = await createCloudProfile(userId, candidateProgress);
            creationError = null;
          } catch (retryError) {
            creationError = retryError;
          }
        }
      }
      if (created)
        return {
          progress: created.progress,
          winner: "local",
          comparison: "no-cloud-save",
          repairs: candidateParsed?.repairs ?? [],
          updatedAt: created.updatedAt,
          uploaded: true,
          publicProfilePublished: false,
          publicProfileEnabled: false,
          profileIdentity: created.profileIdentity,
          notice:
            "Your existing progress on this device was added to this online account. Public sharing remains off.",
        };
      if (
        creationError?.message?.includes(
          "This Cloud account already has a game profile",
        )
      ) {
        // Another tab completed profile creation after the existence read;
        // continue into the version-checked reconciliation transaction.
      } else if (
        creationError?.code === "permission-denied" ||
        creationError?.code === "firestore/permission-denied"
      ) {
        const settingsSnapshot = await getDoc(
          profileSettingsRef(database, userId),
        );
        return {
          progress: candidateProgress,
          winner: "local",
          comparison: "no-cloud-save",
          repairs: candidateParsed?.repairs ?? [],
          updatedAt: null,
          uploaded: false,
          publicProfilePublished: false,
          publicProfileEnabled: false,
          profileIdentity: {
            ...cloudProfileIdentity(
              settingsSnapshot.exists() ? settingsSnapshot.data() : null,
              candidateProgress.profile.username,
            ),
            reserved: false,
          },
          needsCloudName: true,
          notice:
            "Your progress is safe on this device, but its name could not be reserved for this Cloud account. Choose an available name or wait for the account’s rename cooldown before backing it up online.",
        };
      } else {
        throw creationError;
      }
    }
  }

  // Existing Cloud saves from earlier versions may not have account settings.
  // Create or repair that private identity record before attempting a save
  // update; Firestore rules intentionally refuse to write an orphaned save.
  if (expectedCloudExists !== false) {
    const settingsPreflightSave =
      preflightSaveSnapshot ?? (await getDoc(reference));
    if (settingsPreflightSave.exists()) {
      const existingProgress = parseAndRepairProgress(
        JSON.stringify(decodeCloudSave(settingsPreflightSave.data().save_data)),
      ).progress;
      if (existingProgress.profile)
        await ensureCloudProfileSettings(userId, existingProgress);
    }
  }

  let outcome = null;

  await runCloudTransaction(database, async (transaction) => {
    const [snapshot, writeLimitSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(writeLimitReference),
      transaction.get(settingsReference),
    ]);
    const remoteEnvelope = snapshot.exists() ? snapshot.data() : null;
    const remoteRaw = remoteEnvelope
      ? decodeCloudSave(remoteEnvelope.save_data)
      : null;
    const candidateSource =
      typeof localCandidate === "string"
        ? localCandidate
        : localCandidate
          ? JSON.stringify(localCandidate)
          : null;
    const remoteSource = remoteRaw ? JSON.stringify(remoteRaw) : null;
    const candidateParsed = candidateSource
      ? parseAndRepairProgress(candidateSource)
      : null;
    const candidateProgress = candidateParsed?.progress ?? null;
    const cloudExists = snapshot.exists();
    const localEligible = mayUseLocalSaveForCloudUser(
      userId,
      localOwner,
      cloudExists,
    );
    const localSource = localEligible ? candidateSource : null;
    const localParsed = localEligible ? candidateParsed : null;
    const remoteParsed = remoteSource
      ? parseAndRepairProgress(remoteSource)
      : null;
    const localProgress = localParsed?.progress ?? null;
    const remoteProgress = remoteParsed?.progress ?? null;
    if (remoteProgress && !remoteProgress.profile)
      throw new Error("This online account does not have a game profile yet.");

    const cloudSaveData = remoteEnvelope?.save_data ?? null;
    if (!localEligible && candidateProgress?.profile) {
      writeRecoveryCopy(
        candidateSource,
        storage,
        "The unowned device copy could not be saved for recovery. The online progress was not changed.",
        "An unowned local copy was kept aside because this online account already has a save.",
        localOwner,
      );
    }
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
    const accountSettings = settingsSnapshot.exists()
      ? settingsSnapshot.data()
      : null;
    const reservedAccountName = accountSettings?.username_key ?? null;
    if (
      selected?.profile &&
      typeof reservedAccountName === "string" &&
      publicProfileId(selected.profile.username) !== reservedAccountName
    ) {
      // A conflict resolution can select a different stable profile. Keep the
      // Cloud account's already-reserved alias, but apply only the chosen save
      // in full; never merge profile state or reuse the displaced profile ID.
      selected = {
        ...selected,
        profile: { ...selected.profile, username: reservedAccountName },
      };
    }
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
        userId,
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
        localOwner,
      );
    }

    const previous = choice.winner === "local" ? remoteProgress : localProgress;
    selected = preservePermanentCosmetics(previous, selected);
    // A repaired cloud snapshot is safe to use locally but is not silently
    // rewritten: its exact original remains in Firestore until a real local
    // winner replaces it, at which point the recovery copy is mandatory.
    const shouldUpload = !remoteProgress || !sameSave(selected, remoteProgress);
    if (shouldUpload && !accountSettings)
      throw new Error(
        "Cloud account settings could not be repaired. Your online save was not changed.",
      );
    const settingsNeedProfileIdUpdate = Boolean(
      accountSettings && accountSettings.profile_id !== selected.profile.id,
    );
    if (settingsNeedProfileIdUpdate) {
      if (typeof accountSettings.username_key === "string")
        transaction.set(
          profileNameRef(database, accountSettings.username_key),
          {
            owner_uid: userId,
            profile_id: selected.profile.id,
          },
        );
      transaction.set(settingsReference, {
        ...accountSettings,
        profile_id: selected.profile.id,
        updated_at: serverTimestamp(),
      });
    }
    if (shouldUpload) {
      const waitMs = cloudSaveWriteWaitMs(
        writeLimitSnapshot.exists() ? writeLimitSnapshot.data() : null,
      );
      if (waitMs > 0)
        throw new Error(
          "Wait a couple of seconds before saving Cloud progress again.",
        );
      transaction.set(reference, {
        save_data: encodeCloudSave(selected),
        updated_at: serverTimestamp(),
        // Keep consent state with the private save. The publication transaction
        // changes the alias only after a profile has been explicitly enabled.
        public_profile_id: remoteEnvelope?.public_profile_id ?? null,
        public_profile_enabled: remoteEnvelope?.public_profile_enabled === true,
      });
      transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
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
      publicProfileEnabled: remoteEnvelope?.public_profile_enabled === true,
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
      outcome.publicProfileEnabled = publication.enabled;
      outcome.profileIdentity = publication.profileIdentity ?? null;
      if (publication.conflict) {
        const collision = `Your progress is safe, but “${outcome.progress.profile.username}” is already reserved by another Cloud account. Choose a different name before sharing it.`;
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

export async function deleteCloudSave(
  userId,
  progress = null,
  { deleteAccount = false } = {},
) {
  if (!userId)
    return {
      exists: false,
      envelope: null,
      settings: null,
      writeLimit: null,
      publicProfileWriteLimit: null,
      accountDeleted: deleteAccount,
    };
  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  const publicWriteLimitReference = publicProfileWriteLimitRef(
    database,
    userId,
  );
  let deletedEnvelope = null;
  let deletedSettings = null;
  let deletedWriteLimit = null;
  let deletedPublicWriteLimit = null;
  let deletedPublicProfiles = [];
  let nameClaimIdToRelease = null;
  try {
    const settingsSnapshot = await getDoc(settingsReference);
    const usernameKey = settingsSnapshot.exists()
      ? settingsSnapshot.data()?.username_key
      : null;
    if (typeof usernameKey === "string") {
      try {
        const nameSnapshot = await getDoc(
          profileNameRef(database, usernameKey),
        );
        if (nameSnapshot.exists() && nameSnapshot.data()?.owner_uid === userId)
          nameClaimIdToRelease = usernameKey;
      } catch {
        // A foreign or missing reservation is not ours to remove. The private
        // save and account can still be deleted without touching that name.
      }
    }
  } catch {
    // The transactional ownership checks below still protect the save. If the
    // name cannot be verified, leave its claim untouched rather than guessing.
  }
  // Delete the private save and every verifiably owned alias in one
  // transaction. A foreign legacy alias is deliberately left untouched.
  const runDeleteTransaction = () =>
    runCloudTransaction(database, async (transaction) => {
      deletedEnvelope = null;
      deletedSettings = null;
      deletedWriteLimit = null;
      deletedPublicWriteLimit = null;
      deletedPublicProfiles = [];
      const [
        saveSnapshot,
        settingsSnapshot,
        writeLimitSnapshot,
        publicWriteLimitSnapshot,
      ] = await Promise.all([
        transaction.get(saveReference),
        transaction.get(settingsReference),
        transaction.get(writeLimitReference),
        transaction.get(publicWriteLimitReference),
      ]);
      const envelope = saveSnapshot.exists() ? saveSnapshot.data() : null;
      const settings = settingsSnapshot.exists()
        ? settingsSnapshot.data()
        : null;
      deletedEnvelope = envelope;
      deletedSettings = settings;
      deletedWriteLimit = writeLimitSnapshot.exists()
        ? writeLimitSnapshot.data()
        : null;
      deletedPublicWriteLimit = publicWriteLimitSnapshot.exists()
        ? publicWriteLimitSnapshot.data()
        : null;
      const publicIds = new Set();
      const addPublicId = (username) => {
        const id = publicProfileId(username);
        if (id) publicIds.add(id);
      };
      addPublicId(envelope?.public_profile_id);
      addPublicId(settings?.username_key);
      addPublicId(progress?.profile?.username);
      let savedProgress = null;
      if (envelope?.save_data) {
        try {
          const raw = decodeCloudSave(envelope.save_data);
          savedProgress = parseAndRepairProgress(JSON.stringify(raw)).progress;
          // Older envelopes predate the explicit consent field. Their legacy
          // public document can be cleaned by its old owner_uid field, but only
          // if the save did not already name a different published alias.
          if (
            !Object.prototype.hasOwnProperty.call(
              envelope,
              "public_profile_enabled",
            ) &&
            !envelope.public_profile_id
          )
            addPublicId(savedProgress.profile?.username);
        } catch {
          throw publicProfileCleanupError();
        }
      }
      const publicIdsList = [...publicIds];
      const publicReferences = publicIdsList.map((id) =>
        doc(database, PUBLIC_PROFILE_COLLECTION, id),
      );
      const ownerReferences = publicIdsList.map((id) =>
        doc(database, PUBLIC_PROFILE_OWNER_COLLECTION, id),
      );
      const [publicSnapshots, ownerSnapshots] = await Promise.all([
        Promise.all(
          publicReferences.map((reference) => transaction.get(reference)),
        ),
        Promise.all(
          ownerReferences.map((reference) => transaction.get(reference)),
        ),
      ]);
      const ownershipAt = (index) => {
        const publicSnapshot = publicSnapshots[index];
        const ownerSnapshot = ownerSnapshots[index];
        const profileId = publicIdsList[index];
        const mapOwner = ownerSnapshot?.exists()
          ? ownerSnapshot.data()?.owner_uid
          : null;
        const mapOwned =
          mapOwner === userId && ownerSnapshot.data()?.profile_id === profileId;
        const linkedToThisSave =
          envelope?.public_profile_enabled === true &&
          envelope.public_profile_id === profileId;
        const ownsAlias = publicAliasOwnedByUser({
          userId,
          profileSnapshot: publicSnapshot,
          ownerSnapshot,
          profileId,
          linkedToThisSave,
        });
        return {
          publicOwned: ownsAlias,
          ownerOwned: Boolean(ownerSnapshot?.exists() && mapOwned),
        };
      };
      deletedPublicProfiles = publicSnapshots.flatMap((snapshot, index) =>
        ownershipAt(index).publicOwned && snapshot.exists()
          ? [{ id: publicReferences[index].id, data: snapshot.data() }]
          : [],
      );
      transaction.delete(saveReference);
      if (
        settings?.username_key &&
        settings.username_key === nameClaimIdToRelease
      )
        transaction.delete(profileNameRef(database, settings.username_key));
      if (deleteAccount) {
        if (settingsSnapshot.exists()) transaction.delete(settingsReference);
        if (writeLimitSnapshot.exists())
          transaction.delete(writeLimitReference);
        if (publicWriteLimitSnapshot.exists())
          transaction.delete(publicWriteLimitReference);
      }
      publicSnapshots.forEach((snapshot, index) => {
        const ownership = ownershipAt(index);
        if (ownership.publicOwned && snapshot.exists())
          transaction.delete(publicReferences[index]);
        if (ownership.ownerOwned) transaction.delete(ownerReferences[index]);
      });
    });
  // Keep account data and public-profile cleanup atomic. If Firestore denies
  // any required read or write, the transaction aborts and nothing is removed.
  await runDeleteTransaction();
  const envelopeForRecovery = deletedEnvelope;
  return {
    exists: Boolean(
      deletedEnvelope ||
      deletedSettings ||
      deletedWriteLimit ||
      deletedPublicWriteLimit ||
      deletedPublicProfiles.length,
    ),
    envelope: envelopeForRecovery,
    settings: deletedSettings,
    nameClaim: deletedSettings?.username_key
      ? {
          id: deletedSettings.username_key,
          data: {
            owner_uid: userId,
            profile_id: deletedSettings.profile_id,
          },
        }
      : null,
    writeLimit: deletedWriteLimit,
    publicProfileWriteLimit: deletedPublicWriteLimit,
    accountDeleted: deleteAccount,
    publicProfiles: deletedPublicProfiles,
  };
}

// Account deletion removes Firestore first so an auth failure can be undone.
// Restore only when no newer save has appeared, never overwriting concurrent
// progress that another tab or session may have written in the meantime.
export async function restoreCloudSaveSnapshot(userId, snapshot) {
  const envelope = snapshot?.envelope;
  if (!userId || !envelope?.save_data) return { restored: false };

  let progress;
  try {
    const raw = decodeCloudSave(envelope.save_data);
    progress = parseAndRepairProgress(JSON.stringify(raw)).progress;
    if (!progress.profile) return { restored: false };
  } catch {
    return { restored: false };
  }

  const database = requireFirestore();
  const saveReference = doc(database, CLOUD_SAVE_COLLECTION, userId);
  const settingsReference = profileSettingsRef(database, userId);
  const writeLimitReference = saveWriteLimitRef(database, userId);
  const savedSettings = snapshot.settings ?? null;
  const nameClaim = snapshot.nameClaim ?? null;
  const profileWasPublic = envelope.public_profile_enabled === true;
  const waitMs = snapshot.accountDeleted
    ? 0
    : cloudSaveWriteWaitMs(snapshot.writeLimit);
  if (waitMs > 0)
    await new Promise((resolve) => setTimeout(resolve, waitMs + 50));

  let restored = false;
  let conflict = false;
  let privateFallback = false;
  const restore = async (restoreIdentity) => {
    await runCloudTransaction(database, async (transaction) => {
      const [currentSave, currentSettings, currentWriteLimit] =
        await Promise.all([
          transaction.get(saveReference),
          transaction.get(settingsReference),
          transaction.get(writeLimitReference),
        ]);
      if (currentSave.exists()) {
        conflict = true;
        return;
      }
      const writeWait = cloudSaveWriteWaitMs(
        currentWriteLimit.exists() ? currentWriteLimit.data() : null,
      );
      if (writeWait > 0)
        throw new Error(
          "Wait a couple of seconds before restoring Cloud progress.",
        );

      const identityToRestore = currentSettings.exists()
        ? currentSettings.data()
        : savedSettings;
      if (restoreIdentity && identityToRestore) {
        const settings = currentSettings.exists()
          ? identityToRestore
          : {
              ...identityToRestore,
              username_changed_at: identityToRestore.username_key
                ? serverTimestamp()
                : null,
              avatar_changed_at: identityToRestore.avatar
                ? serverTimestamp()
                : null,
              updated_at: serverTimestamp(),
            };
        if (!currentSettings.exists())
          transaction.set(settingsReference, settings);
        if (nameClaim?.id && settings.username_key === nameClaim.id)
          transaction.set(
            profileNameRef(database, nameClaim.id),
            nameClaim.data,
          );
      } else if (!restoreIdentity && currentSettings.exists()) {
        const current = currentSettings.data();
        if (typeof current.username_key === "string")
          transaction.set(settingsReference, {
            ...current,
            username_key: null,
            updated_at: serverTimestamp(),
          });
      } else if (!currentSettings.exists()) {
        const previousSettings = identityToRestore ?? {};
        const previousName =
          typeof previousSettings.username_key === "string"
            ? previousSettings.username_key
            : null;
        const avatar = validAvatar(previousSettings.avatar)
          ? previousSettings.avatar
          : validAvatar(progress.profile.avatar)
            ? progress.profile.avatar
            : null;
        transaction.set(settingsReference, {
          ...cloudProfileSettingsDocument({
            usernameKey: null,
            profileId: progress.profile.id,
            avatar,
            nameChangedAt: previousName ? serverTimestamp() : null,
            avatarChangedAt: avatar ? serverTimestamp() : null,
          }),
          updated_at: serverTimestamp(),
        });
      }
      transaction.set(saveReference, {
        save_data: envelope.save_data,
        updated_at: serverTimestamp(),
        // Rebuild public data only if the identity reservation was restored;
        // a collision leaves the complete game save private and recoverable.
        public_profile_id: null,
        public_profile_enabled:
          restoreIdentity &&
          profileWasPublic &&
          typeof identityToRestore?.username_key === "string",
      });
      transaction.set(writeLimitReference, cloudSaveWriteLimitDocument());
      restored = true;
    });
  };

  try {
    await restore(true);
  } catch (error) {
    if (
      error?.code !== "permission-denied" &&
      error?.code !== "firestore/permission-denied"
    )
      throw error;
    // A different account may have claimed the alias during an account-delete
    // rollback window. Restore the entire save privately rather than touching
    // that reservation or losing progress.
    privateFallback = true;
    restored = false;
    conflict = false;
    await restore(false);
  }

  if (!restored) return { restored: false, conflict };
  if (!privateFallback && profileWasPublic)
    try {
      await publishPublicProfile(userId, progress, { enable: true });
    } catch {
      // The private save is restored even if publication rules or availability
      // prevent the opted-in summary from being rebuilt in this attempt.
    }
  return { restored: true, conflict, private: privateFallback };
}
