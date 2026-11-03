import { gameNow } from "./game-clock";
import { useEffect, useRef, useState } from "react";
import { drainSerialQueue, enqueueSerial } from "./serial-queue.js";
import {
  accountSwitchSnapshot,
  cacheLocalSaveForUser,
  cloudAccountOwnsLocalSave,
  clearCloudDirty,
  createCloudProfile,
  deleteCloudSave,
  markCloudDirty,
  readCachedSaveForUser,
  readCloudOwner,
  reconcileCloudSave,
  renameCloudProfile,
  removeCachedSaveForUser,
  restoreCloudSaveSnapshot,
  restoredSaveOwner,
  selectLocalSaveForCloudUser,
  setCloudProfileVisibility,
  updateCloudProfileAvatar,
  writeCloudOwner,
} from "./cloud-save.js";
import { firebaseConfigured } from "./firebase.js";
import { cloudGameAccess } from "./auth-gate.js";
import {
  archiveSavedCopy,
  clearLocalSaveRecovery,
  getRecoveryCopies,
  isReadableSave,
  readCloudRecovery,
  readVault,
  writePreRepairOwner,
  writeVault,
} from "./save-vault.js";
import {
  UNKNOWN_CLOUD_OWNER,
  isCloudUserDeleted,
  markCloudUserDeleted,
} from "./save-owner.js";
import {
  PROGRESS_KEY,
  GUEST_ROLL_KEY,
  PRE_REPAIR_BACKUP_KEY,
  emptyProgress,
  parseProgress,
  preservePermanentCosmetics,
  parseAndRepairProgress,
  applyProgress,
  settleOfflineRoll,
  parsePending,
  recoverUnsavedRolls,
} from "./progress.js";
import { generateRoll, restoreRoll } from "./roll-client.js";
import { runDrawPicks } from "./draw-plan.js";
import { clearAutoRoll } from "./auto-roll.js";
import { flywheelForDraw } from "./flywheel.js";
import {
  armedSkills,
  SKILL_MAX_DRAWS,
  drawPicksFor,
  drawPlanFor,
  skillWaivesCooldown,
} from "./skills.js";
import { parseCooldownWindow } from "./cooldown.js";
import { rollSettings, offlineSettings, productById } from "./shop-data.js";
import {
  offlinePlan,
  readPresence,
  writePresence,
  clearPresence,
} from "./offline.js";
// Keep repair details out of player-facing messages; readable progress stays.
function repairWarning(repairs) {
  if (!repairs.length) return "";
  return "Some saved details needed fixing. Your readable progress was kept.";
}
function readLocalSave() {
  try {
    return localStorage.getItem(PROGRESS_KEY);
  } catch {
    return null;
  }
}
function ensureCloudOwner(userId) {
  return readCloudOwner() === userId || writeCloudOwner(userId);
}
function parseStoredSave(raw) {
  if (!raw) return { progress: emptyProgress(), repairs: [] };
  return parseAndRepairProgress(raw);
}
function readLocalCandidateForCloudUser(userId) {
  const owner = readCloudOwner();
  const raw =
    owner && owner !== userId ? readCachedSaveForUser(userId) : readLocalSave();
  return raw
    ? parseStoredSave(raw)
    : { progress: emptyProgress(), repairs: [] };
}
function writeLocalSave(progress, ownerId = readCloudOwner()) {
  try {
    const raw = JSON.stringify(progress);
    localStorage.setItem(PROGRESS_KEY, raw);
    writeVault(raw, { storage: localStorage, ownerId });
    return true;
  } catch {
    return false;
  }
}
function load() {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    const { progress, repairs } = parseAndRepairProgress(stored);
    if (!progress.profile) {
      // A stale guest guard is ephemeral session data: when it cannot be
      // read it is dropped instead of failing the whole load.
      try {
        const guard = JSON.parse(
          sessionStorage.getItem(GUEST_ROLL_KEY) || "null",
        );
        if (guard) {
          progress.pendingRoll = parsePending(guard.pendingRoll);
          if (
            !Number.isSafeInteger(guard.cooldownUntil) ||
            guard.cooldownUntil < 0
          )
            throw new Error("Invalid roll guard");
          progress.cooldownUntil = Math.max(
            progress.cooldownUntil,
            guard.cooldownUntil,
          );
          progress.cooldownWindow = parseCooldownWindow(
            guard.cooldownWindow,
            progress.cooldownUntil,
            progress.pendingRoll,
          );
        }
      } catch {
        progress.pendingRoll = null;
      }
    }
    if (!repairs.length)
      writeVault(stored, {
        storage: localStorage,
        ownerId: readCloudOwner(),
      });
    if (repairs.length) {
      console.info("[RNGdle] save repaired:", repairs);
      try {
        // Heal the file itself, keeping the exact pre-repair bytes aside so
        // a bad repair can always be undone by hand.
        localStorage.setItem(PRE_REPAIR_BACKUP_KEY, stored);
        const saveOwner = readCloudOwner();
        writePreRepairOwner(saveOwner, localStorage);
        const repairedRaw = JSON.stringify(progress);
        localStorage.setItem(PROGRESS_KEY, repairedRaw);
        writeVault(repairedRaw, {
          storage: localStorage,
          ownerId: saveOwner,
        });
      } catch {
        // Storage unwritable: the repaired save still runs in memory.
      }
    }
    return { progress, warning: repairs.length ? repairWarning(repairs) : "" };
  } catch {
    return {
      progress: emptyProgress(),
      warning:
        "Your saved progress could not be opened. You can keep playing in this tab, but changes may not be saved.",
    };
  }
}
export function useProgress({
  userId = null,
  authReady = true,
  passwordRequired = false,
  cloudEnabled = firebaseConfigured,
  requireCloudAccount = true,
  localPlay = false,
  localProfileRequired = false,
  online = true,
  deleteAuthUser = null,
} = {}) {
  const [initial] = useState(load),
    [progress, setProgress] = useState(initial.progress),
    [warning, setWarning] = useState(initial.warning),
    [epoch, setEpoch] = useState(0),
    [cloudRetry, setCloudRetry] = useState(0),
    [cloudWriteRetry, setCloudWriteRetry] = useState(0);
  const [cloud, setCloudState] = useState(() =>
    !cloudEnabled
      ? { status: "unconfigured", ready: true, userId: null, error: "" }
      : !authReady
        ? { status: "checking-auth", ready: false, userId: null, error: "" }
        : userId
          ? { status: "loading", ready: false, userId, error: "" }
          : { status: "signed-out", ready: true, userId: null, error: "" },
  );
  const current = useRef(initial.progress),
    healthy = useRef(!initial.warning),
    // The rolls this tab settled while saving was failing, by id. Only these
    // are owed again when the save recovers (see recoverUnsavedRolls).
    unsaved = useRef(new Set()),
    generation = useRef(0),
    queue = useRef(Promise.resolve()),
    cloudGeneration = useRef(0),
    cloudQueue = useRef(Promise.resolve()),
    cloudWriteVersion = useRef(0),
    cloudWriteFailure = useRef({ snapshot: null, userId: null, attempts: 0 }),
    pendingCloudConflict = useRef(null);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const authRef = useRef({
    userId,
    authReady,
    passwordRequired,
    cloudEnabled,
    requireCloudAccount,
    localPlay,
    localProfileRequired,
    deleteAuthUser,
  });
  authRef.current = {
    userId,
    authReady,
    passwordRequired,
    cloudEnabled,
    requireCloudAccount,
    localPlay,
    localProfileRequired,
    deleteAuthUser,
  };
  const cloudGate = useRef({
    userId: null,
    ready: !cloudEnabled || (authReady && !userId),
  });
  function updateCloud(next) {
    cloudRef.current = next;
    setCloudState(next);
  }
  function markLocalCloudDirty() {
    const activeUser = authRef.current.userId;
    const owner =
      activeUser &&
      cloudGate.current.ready &&
      cloudGate.current.userId === activeUser
        ? activeUser
        : readCloudOwner();
    if (typeof owner === "string" && owner) markCloudDirty(owner);
  }
  function reset(next = emptyProgress()) {
    generation.current++;
    setEpoch(generation.current);
    current.current = next;
    setProgress(next);
    healthy.current = true;
    unsaved.current = new Set();
    setWarning("");
  }
  function showCloudConflict(result, activeUserId, cacheWarning = "") {
    const conflict = result.conflict;
    if (!conflict) return false;
    pendingCloudConflict.current = {
      userId: activeUserId,
      localCandidate: conflict.expectedLocalSource,
      expectedCloudExists: conflict.expectedCloudExists,
      expectedCloudSaveData: conflict.expectedCloudSaveData,
      cacheWarning,
    };
    cloudGate.current = { userId: activeUserId, ready: false };
    updateCloud({
      status: "needs-choice",
      ready: false,
      userId: activeUserId,
      updatedAt: result.updatedAt ?? null,
      error: "",
      notice: result.notice ?? conflict.message,
      conflict: {
        reason: conflict.reason,
        message: conflict.message,
        canChooseLocal: conflict.canChooseLocal,
        canChooseCloud: conflict.canChooseCloud,
        local: conflict.local,
        cloud: conflict.cloud,
      },
      resolving: false,
    });
    return true;
  }
  function applyCloudReconciliation(result, activeUserId, cacheWarning = "") {
    const selected = result.progress ?? emptyProgress();
    try {
      sessionStorage.removeItem(GUEST_ROLL_KEY);
    } catch {}

    if (!writeLocalSave(selected, activeUserId)) {
      const error =
        "Your online progress loaded, but this device could not save a copy. Free up space and try again before playing.";
      cloudGate.current = { userId: activeUserId, ready: false };
      pendingCloudConflict.current = null;
      updateCloud({
        status: "error",
        ready: false,
        userId: activeUserId,
        updatedAt: result.updatedAt ?? null,
        error,
        notice: result.notice ?? "",
      });
      return { ok: false, message: error };
    }

    reset(selected);
    if (result.repairs?.length) setWarning(repairWarning(result.repairs));
    if (cacheWarning) setWarning(cacheWarning);
    if (!ensureCloudOwner(activeUserId)) {
      const error =
        "This device could not remember which account owns this progress. Free up space before playing or switching accounts.";
      cloudGate.current = { userId: activeUserId, ready: false };
      pendingCloudConflict.current = null;
      updateCloud({
        status: "error",
        ready: false,
        userId: activeUserId,
        updatedAt: result.updatedAt ?? null,
        error,
        notice: result.notice ?? "",
      });
      return { ok: false, message: error };
    }

    clearCloudDirty(activeUserId);
    pendingCloudConflict.current = null;
    cloudGate.current = { userId: activeUserId, ready: true };
    updateCloud({
      status: result.needsCloudName
        ? "name-required"
        : selected.profile
          ? "synced"
          : "empty",
      ready: true,
      userId: activeUserId,
      updatedAt: result.updatedAt ?? null,
      error: "",
      notice: result.notice ?? "",
      publicProfileAvailable: result.publicProfilePublished ?? false,
      publicProfileEnabled: result.publicProfileEnabled === true,
      profileIdentity: result.profileIdentity ?? null,
      conflict: null,
      resolving: false,
    });
    return { ok: true, progress: selected, notice: result.notice ?? "" };
  }
  useEffect(() => {
    function synchronize(event) {
      if (event.key !== PROGRESS_KEY && event.key !== null) return;
      if (!current.current.profile) return;
      try {
        const next = parseProgress(localStorage.getItem(PROGRESS_KEY));
        if (
          next.profile?.id !== current.current.profile.id ||
          next.rebirths !== current.current.rebirths ||
          next.ultraRebirths !== current.current.ultraRebirths ||
          next.rollbacks !== current.current.rollbacks ||
          next.freshStarts !== current.current.freshStarts
        )
          reset(next);
        else {
          const recovered = healthy.current
            ? next
            : recoverUnsavedRolls(next, current.current, unsaved.current);
          const merged = preservePermanentCosmetics(current.current, recovered);
          let persisted = merged === next;
          if (merged !== next) {
            try {
              const mergedRaw = JSON.stringify(merged);
              localStorage.setItem(PROGRESS_KEY, mergedRaw);
              writeVault(mergedRaw, {
                storage: localStorage,
                ownerId: readCloudOwner(),
              });
              persisted = true;
              markLocalCloudDirty();
            } catch {
              setWarning(
                "Progress could not be saved on this device. This tab is keeping its current progress.",
              );
            }
          }
          current.current = merged;
          setProgress(merged);
          healthy.current = persisted;
          if (persisted) {
            unsaved.current = new Set();
            setWarning("");
          }
        }
      } catch {
        healthy.current = false;
        setWarning(
          "Progress could not be saved on this device. This tab is keeping its current progress.",
        );
      }
    }
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);
  useEffect(() => {
    const request = ++cloudGeneration.current;
    let active = true;
    const currentRequest = () => active && cloudGeneration.current === request;
    if (
      !cloudEnabled ||
      !userId ||
      pendingCloudConflict.current?.userId !== userId
    )
      pendingCloudConflict.current = null;

    if (!cloudEnabled) {
      cloudGate.current = { userId: null, ready: true };
      updateCloud({
        status: "unconfigured",
        ready: true,
        userId: null,
        error: "",
      });
      return () => {
        active = false;
      };
    }
    if (!authReady) {
      cloudGate.current = { userId: null, ready: false };
      updateCloud({
        status: "checking-auth",
        ready: false,
        userId: null,
        error: "",
      });
      return () => {
        active = false;
      };
    }
    if (!userId) {
      cloudGate.current = { userId: null, ready: true };
      updateCloud({
        status: "signed-out",
        ready: true,
        userId: null,
        error: "",
      });
      return () => {
        active = false;
      };
    }

    if (!online) {
      const localCopyIsOwned =
        readCloudOwner() === userId &&
        Boolean(current.current.profile) &&
        healthy.current;
      cloudGate.current = { userId, ready: localCopyIsOwned };
      updateCloud({
        status: "offline",
        ready: localCopyIsOwned,
        userId,
        error: localCopyIsOwned
          ? ""
          : "Cloud progress cannot be checked offline. Reconnect before changing this account.",
        notice: localCopyIsOwned
          ? "Changes are saved on this device and will sync when you reconnect."
          : "",
      });
      return () => {
        active = false;
      };
    }

    cloudGate.current = { userId, ready: false };
    updateCloud({ status: "loading", ready: false, userId, error: "" });

    async function restoreCloudSave() {
      const localOwner = readCloudOwner();
      const localRaw = readLocalSave();
      let localProgress = current.current;
      let cachedProgress = null;
      let cacheWarning = "";

      if (localOwner && localOwner !== userId) {
        const rawToCache = accountSwitchSnapshot({
          localRaw,
          progress: localProgress,
          localSaveHealthy: healthy.current,
        });
        if (!cacheLocalSaveForUser(localOwner, rawToCache)) {
          if (localRaw || localProgress.profile)
            throw new Error(
              "A copy of the previous account’s progress could not be kept. Free up space and try again before switching accounts.",
            );
          cacheWarning =
            "This device could not keep a copy of the previous account’s progress.";
        }
        // A save marked for another auth user is never a first-sign-in import.
        // Only this account's own cached save may follow it across a switch.
        const cached = readCachedSaveForUser(userId);
        if (cached) {
          try {
            cachedProgress = parseStoredSave(cached).progress;
          } catch {
            cacheWarning = "A saved copy for this account could not be opened.";
          }
        }
      }

      const localSelection = selectLocalSaveForCloudUser({
        userId,
        localOwner,
        localProgress,
        cachedProgress,
        emptyProgress: emptyProgress(),
      });
      localProgress = localSelection.progress;

      const reconciliation = await reconcileCloudSave(userId, localProgress, {
        allowLocal: true,
        localOwner: localSelection.owner,
        storage: localStorage,
      });
      if (!currentRequest()) return;

      if (reconciliation.choiceRequired) {
        showCloudConflict(reconciliation, userId, cacheWarning);
        return;
      }
      applyCloudReconciliation(reconciliation, userId, cacheWarning);
    }

    const loadTask = enqueueSerial(cloudQueue, () => {
      if (!currentRequest()) return;
      return restoreCloudSave();
    });
    loadTask.catch(() => {
      if (!currentRequest()) return;
      cloudGate.current = { userId, ready: false };
      updateCloud({
        status: "error",
        ready: false,
        userId,
        error:
          "Your online progress could not be loaded. Try again before changing anything.",
      });
    });

    return () => {
      active = false;
    };
  }, [userId, authReady, cloudEnabled, cloudRetry, online]);

  useEffect(() => {
    if (
      !cloudEnabled ||
      !authReady ||
      !userId ||
      !progress.profile ||
      cloudGate.current.userId !== userId ||
      !cloudGate.current.ready
    )
      return undefined;

    if (readCloudOwner() !== userId) {
      cloudGate.current = { userId, ready: false };
      updateCloud({
        ...cloudRef.current,
        status: "error",
        ready: false,
        userId,
        error:
          "This device’s saved copy belongs to a different or unverified account. Reload progress before saving online.",
      });
      return undefined;
    }

    if (
      cloudWriteFailure.current.snapshot !== progress ||
      cloudWriteFailure.current.userId !== userId
    )
      cloudWriteFailure.current = { snapshot: progress, userId, attempts: 0 };
    const version = ++cloudWriteVersion.current;
    const snapshot = progress;
    markCloudDirty(userId);
    if (!online) {
      updateCloud({
        ...cloudRef.current,
        status: "offline",
        ready: true,
        userId,
        error: "",
        notice:
          "Changes are saved on this device and will sync when you reconnect.",
      });
      return undefined;
    }
    const currentCloud = cloudRef.current;
    updateCloud({
      ...currentCloud,
      status:
        currentCloud.status === "name-required" ? "name-required" : "saving",
      ready: true,
      userId,
      updatedAt: currentCloud.updatedAt ?? null,
      error: "",
      notice: currentCloud.notice ?? "",
    });

    let active = true;
    let retryTimer = null;
    const timer = setTimeout(() => {
      if (
        !active ||
        cloudWriteVersion.current !== version ||
        cloudGate.current.userId !== userId ||
        !cloudGate.current.ready
      )
        return;
      const task = enqueueSerial(cloudQueue, () => {
        if (
          !active ||
          cloudWriteVersion.current !== version ||
          cloudGate.current.userId !== userId ||
          !cloudGate.current.ready
        )
          return null;
        if (readCloudOwner() !== userId) {
          const error =
            "This device’s saved copy belongs to a different or unverified account. Reload progress before saving online.";
          cloudGate.current = { userId, ready: false };
          updateCloud({
            ...cloudRef.current,
            status: "error",
            ready: false,
            userId,
            error,
          });
          return null;
        }
        return reconcileCloudSave(userId, snapshot, {
          allowLocal: true,
          localOwner: userId,
          storage: localStorage,
        });
      });
      task
        .then((result) => {
          if (
            !active ||
            !result ||
            cloudWriteVersion.current !== version ||
            authRef.current.userId !== userId
          )
            return;
          cloudWriteFailure.current = { snapshot, userId, attempts: 0 };
          if (result.choiceRequired) {
            showCloudConflict(result, userId);
            return;
          }
          const cloudWon =
            result.winner === "cloud" &&
            result.progress?.profile &&
            JSON.stringify(result.progress) !== JSON.stringify(snapshot);
          if (cloudWon) {
            if (!writeLocalSave(result.progress, userId)) {
              updateCloud({
                status: "error",
                ready: true,
                userId,
                updatedAt:
                  result.updatedAt ?? cloudRef.current.updatedAt ?? null,
                error:
                  "Your online progress was kept, but this device could not update its copy. Your previous progress is available in Settings → Restore save.",
                notice: result.notice || cloudRef.current.notice || "",
              });
              return;
            }
            reset(result.progress);
            if (result.repairs.length)
              setWarning(repairWarning(result.repairs));
          }
          if (!ensureCloudOwner(userId)) {
            const error =
              "This device could not remember which account owns this progress. Free up space before switching accounts.";
            cloudGate.current = { userId, ready: false };
            updateCloud({
              status: "error",
              ready: false,
              userId,
              updatedAt: result.updatedAt ?? cloudRef.current.updatedAt ?? null,
              error,
              notice: result.notice || cloudRef.current.notice || "",
            });
            return;
          }
          clearCloudDirty(userId);
          updateCloud({
            status: result.needsCloudName ? "name-required" : "synced",
            ready: true,
            userId,
            updatedAt: result.updatedAt ?? cloudRef.current.updatedAt ?? null,
            error: "",
            notice: result.notice || "",
            publicProfileAvailable: result.publicProfilePublished ?? false,
            publicProfileEnabled: result.publicProfileEnabled === true,
            profileIdentity: result.profileIdentity ?? null,
          });
        })
        .catch((failure) => {
          if (
            !active ||
            cloudWriteVersion.current !== version ||
            authRef.current.userId !== userId
          )
            return;
          const code = String(failure?.code ?? "")
            .split("/")
            .at(-1);
          const message = String(failure?.message ?? "");
          const retryable =
            [
              "aborted",
              "deadline-exceeded",
              "network-request-failed",
              "resource-exhausted",
              "unavailable",
            ].includes(code) ||
            /wait a couple of seconds|temporarily unavailable/i.test(message);
          if (retryable) {
            const previous = cloudWriteFailure.current;
            const attempts =
              previous.snapshot === snapshot && previous.userId === userId
                ? previous.attempts + 1
                : 1;
            cloudWriteFailure.current = { snapshot, userId, attempts };
            if (attempts <= 3) {
              updateCloud({
                status: "error",
                ready: true,
                userId,
                updatedAt: cloudRef.current.updatedAt ?? null,
                error: "",
                notice:
                  "Your device copy is saved. Cloud sync hit a temporary connection or write limit; the game will try again automatically.",
              });
              const delay = Math.min(10_000, 2_500 * 2 ** (attempts - 1));
              retryTimer = setTimeout(() => {
                if (
                  !active ||
                  cloudWriteVersion.current !== version ||
                  authRef.current.userId !== userId ||
                  !authRef.current.authReady ||
                  !authRef.current.cloudEnabled ||
                  cloudGate.current.userId !== userId ||
                  !cloudGate.current.ready ||
                  !online
                )
                  return;
                setCloudWriteRetry((retry) => retry + 1);
              }, delay);
              return;
            }
          }
          updateCloud({
            status: "error",
            ready: true,
            userId,
            updatedAt: cloudRef.current.updatedAt ?? null,
            error:
              "Your progress could not be backed up online. The copy on this device is safe. Try again.",
            notice: "",
          });
        });
    }, 2_100);
    return () => {
      active = false;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [progress, userId, authReady, cloudEnabled, online, cloudWriteRetry]);

  function retryCloudLoad() {
    if (cloudEnabled && authReady && userId) {
      cloudWriteFailure.current = { snapshot: progress, userId, attempts: 0 };
      setCloudWriteRetry((retry) => retry + 1);
      setCloudRetry((retry) => retry + 1);
    }
  }

  async function setPublicProfileVisibility(enabled) {
    const activeUserId = authRef.current.userId;
    if (
      !activeUserId ||
      !authRef.current.authReady ||
      !cloudGate.current.ready ||
      cloudGate.current.userId !== activeUserId
    )
      return {
        ok: false,
        message:
          "Wait until your online progress has loaded before changing profile privacy.",
      };
    if (readCloudOwner() !== activeUserId)
      return {
        ok: false,
        message:
          "This device’s save belongs to a different or unverified account. Reload before changing profile privacy.",
      };

    try {
      const publication = await enqueueSerial(cloudQueue, () => {
        if (
          authRef.current.userId !== activeUserId ||
          !cloudGate.current.ready ||
          cloudGate.current.userId !== activeUserId ||
          readCloudOwner() !== activeUserId
        )
          throw new Error("The signed-in account changed. Try again.");
        return setCloudProfileVisibility(activeUserId, enabled === true);
      });
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Try again from the active account.",
        };
      const notice = publication.conflict
        ? "Your profile could not be made public because that name is reserved by another Cloud account. Your progress is safe; choose a different profile name before sharing it."
        : enabled
          ? "Your profile is public. Anyone who knows the name or link can view its summary."
          : "Your public profile was removed. Your private cloud save is unchanged.";
      updateCloud({
        ...cloudRef.current,
        publicProfileEnabled: publication.enabled,
        publicProfileAvailable: publication.published,
        profileIdentity: publication.profileIdentity ?? null,
        notice,
      });
      return publication.conflict
        ? { ok: false, message: notice, enabled: publication.enabled }
        : {
            ok: true,
            enabled: publication.enabled,
            available: publication.published,
            message: notice,
          };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Profile privacy could not be changed. Try again.",
      };
    }
  }

  async function resolveCloudConflict(decision) {
    const pending = pendingCloudConflict.current;
    const activeUserId = authRef.current.userId;
    if (
      !pending ||
      !activeUserId ||
      pending.userId !== activeUserId ||
      !["local", "cloud"].includes(decision)
    )
      return {
        ok: false,
        message:
          "That choice has expired. Review the latest copies and choose again.",
      };

    cloudWriteVersion.current++;
    cloudGate.current = { userId: activeUserId, ready: false };
    updateCloud({
      ...cloudRef.current,
      status: "needs-choice",
      ready: false,
      userId: activeUserId,
      error: "",
      resolving: true,
    });

    try {
      const task = enqueueSerial(cloudQueue, () => {
        const latestLocal =
          readLocalCandidateForCloudUser(activeUserId).progress;
        return reconcileCloudSave(activeUserId, latestLocal, {
          allowLocal: true,
          localOwner: activeUserId,
          storage: localStorage,
          decision,
          expectedCloudExists: pending.expectedCloudExists,
          expectedCloudSaveData: pending.expectedCloudSaveData,
          expectedLocalSource: pending.localCandidate,
        });
      });
      const result = await task;
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Review its progress before playing.",
        };
      if (result.choiceRequired) {
        showCloudConflict(result, activeUserId, pending.cacheWarning);
        return {
          ok: false,
          needsChoice: true,
          message: result.notice,
        };
      }
      return applyCloudReconciliation(
        result,
        activeUserId,
        pending.cacheWarning,
      );
    } catch {
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Review its progress before playing.",
        };
      const message =
        "We couldn’t apply that choice. Neither copy was removed. Please try again.";
      updateCloud({
        ...cloudRef.current,
        status: "needs-choice",
        ready: false,
        userId: activeUserId,
        error: message,
        resolving: false,
      });
      return { ok: false, message };
    }
  }

  function dispatch(input) {
    const token = epoch;
    const action = {
      ...input,
      at: input.at ?? Math.ceil(gameNow()),
      eventId: input.eventId ?? crypto.randomUUID(),
    };
    const execute = async () => {
      try {
        if (token !== generation.current)
          return {
            ok: false,
            message: "This game was reset. The previous action was cancelled.",
          };
        const auth = authRef.current;
        const deletingCloudAccount =
          action.type === "delete" && action.deleteCloudAccount === true;
        const accountAccess = cloudGameAccess({
          required: auth.requireCloudAccount,
          configured: auth.cloudEnabled,
          authReady: auth.authReady,
          userId: auth.userId,
          passwordRequired: auth.passwordRequired,
          localPlay: auth.localPlay,
          localProfileRequired:
            auth.localProfileRequired &&
            !current.current.profile &&
            action.type !== "register",
        });
        if (!deletingCloudAccount && !accountAccess.allowed)
          return { ok: false, message: accountAccess.message };
        if (
          !deletingCloudAccount &&
          auth.cloudEnabled &&
          auth.userId &&
          (!cloudGate.current.ready ||
            cloudGate.current.userId !== auth.userId ||
            readCloudOwner() !== auth.userId)
        )
          return {
            ok: false,
            message:
              cloudRef.current.error ||
              "Your online progress is still loading. Try again before changing anything.",
          };
        let previous = current.current;
        let readable = true;
        if (previous.profile) {
          try {
            const stored = parseProgress(localStorage.getItem(PROGRESS_KEY));
            // Always check identity, even after a failed write: a stale tab must
            // never resurrect a deleted account or spend another profile's EP.
            if (
              stored.profile?.id !== previous.profile.id ||
              stored.rebirths !== previous.rebirths ||
              stored.ultraRebirths !== previous.ultraRebirths ||
              stored.rollbacks !== previous.rollbacks ||
              stored.freshStarts !== previous.freshStarts
            ) {
              reset(stored);
              return {
                ok: false,
                message:
                  "Your profile or progress changed in another tab. This action was cancelled.",
              };
            }
            previous = healthy.current
              ? stored
              : recoverUnsavedRolls(stored, previous, unsaved.current);
          } catch {
            readable = false;
            healthy.current = false;
          }
        }
        const cloudProfileMutation = ["rename-profile", "avatar"].includes(
          action.type,
        );
        if (
          cloudProfileMutation &&
          previous.profile &&
          (!readable || !navigator.locks?.request)
        )
          throw new Error(
            "This browser can’t safely change the Cloud profile right now. Update it or try another browser.",
          );
        let renameUserId = null;
        let avatarUserId = null;
        let cloudRegistration = false;
        let renameNotice = "";
        if (cloudProfileMutation && auth.cloudEnabled && auth.userId) {
          const activeUserId = auth.userId;
          const mutationLabel =
            action.type === "rename-profile" ? "profile name" : "profile logo";
          if (
            !cloudGate.current.ready ||
            cloudGate.current.userId !== activeUserId ||
            readCloudOwner() !== activeUserId
          )
            return {
              ok: false,
              message: `Wait until this account’s online progress has loaded before changing the ${mutationLabel}.`,
            };

          // Drain or invalidate the ordinary debounced backup before changing
          // identity data. A cosmetic change must never hide a save conflict.
          cloudWriteVersion.current++;
          let reconciliation;
          try {
            reconciliation = await enqueueSerial(cloudQueue, () => {
              if (
                authRef.current.userId !== activeUserId ||
                !cloudGate.current.ready ||
                cloudGate.current.userId !== activeUserId ||
                readCloudOwner() !== activeUserId
              )
                throw new Error("The signed-in account changed. Try again.");
              return reconcileCloudSave(activeUserId, previous, {
                allowLocal: true,
                localOwner: activeUserId,
                storage: localStorage,
              });
            });
          } catch {
            return {
              ok: false,
              message: `Online progress could not be checked. No ${mutationLabel} was changed; try again.`,
            };
          }
          if (
            authRef.current.userId !== activeUserId ||
            token !== generation.current
          )
            return {
              ok: false,
              message: `The signed-in account or active profile changed. No ${mutationLabel} was changed.`,
            };
          if (reconciliation?.choiceRequired) {
            showCloudConflict(reconciliation, activeUserId);
            return {
              ok: false,
              needsChoice: true,
              message: reconciliation.notice,
            };
          }
          previous = reconciliation?.progress ?? previous;
          if (!previous.profile)
            return {
              ok: false,
              message: "Create a profile before changing its name or logo.",
            };
          if (readCloudOwner() !== activeUserId)
            return {
              ok: false,
              message:
                "This device’s save belongs to another or unverified account. No profile change was made.",
            };
          if (action.type === "rename-profile") renameUserId = activeUserId;
          else avatarUserId = activeUserId;
        }
        const actionHead = previous;
        if (
          ["rebirth", "ultra-rebirth", "rollback", "fresh-start"].includes(
            action.type,
          ) &&
          previous.profile &&
          (!readable || !navigator.locks?.request)
        )
          throw new Error(
            action.type === "fresh-start"
              ? "This browser can’t safely save a fresh start right now. Update it or try another browser."
              : action.type === "rollback"
                ? "This browser can’t safely save a Rollback right now. Update it or try another browser."
                : action.type === "ultra-rebirth"
                  ? "This browser can’t safely save a Prestige right now. Update it or try another browser."
                  : "This browser can’t safely save a Rebirth right now. Update it or try another browser.",
          );
        if (action.type === "delete") {
          if (
            !deletingCloudAccount &&
            (!previous.profile || previous.profile.id !== action.profileId)
          )
            return { ok: false, message: "This profile is no longer active." };
          const localOwner = readCloudOwner();
          const cloudUser = deletingCloudAccount
            ? auth.cloudEnabled && auth.userId
              ? auth.userId
              : null
            : auth.cloudEnabled &&
                auth.userId &&
                cloudGate.current.ready &&
                cloudGate.current.userId === auth.userId
              ? auth.userId
              : null;
          if (deletingCloudAccount && (!cloudUser || !auth.deleteAuthUser))
            return {
              ok: false,
              message: "Sign in to the cloud account before deleting it.",
            };
          const deleteLocal =
            !deletingCloudAccount ||
            cloudAccountOwnsLocalSave(cloudUser, localOwner);
          if (!readable && !deletingCloudAccount)
            return { ok: false, message: "Your progress could not be opened." };
          if (cloudUser) {
            // Invalidate an initial cloud load as well as debounced writes; it is
            // serialized on this queue so deletion can wait for its transaction.
            if (deletingCloudAccount) cloudGeneration.current += 1;
            cloudWriteVersion.current += 1;
            cloudGate.current = { userId: cloudUser, ready: false };
            updateCloud({
              ...cloudRef.current,
              status: "loading",
              ready: false,
              userId: cloudUser,
              error: "",
              notice: "",
            });
            await drainSerialQueue(cloudQueue);
            if (authRef.current.userId !== cloudUser)
              return {
                ok: false,
                message:
                  "The signed-in account changed. Nothing was deleted; review the active account and try again.",
              };
          }

          let cloudSnapshot = null;
          let cloudDeleted = false;
          let authDeleted = false;
          let localSaveRemoved = !deleteLocal;
          let localCleanupFailed = false;
          try {
            if (cloudUser) {
              cloudSnapshot = await deleteCloudSave(
                cloudUser,
                deleteLocal ? previous : null,
                { deleteAccount: deletingCloudAccount },
              );
              cloudDeleted = true;
            }
            if (deletingCloudAccount) {
              const result = await auth.deleteAuthUser(cloudUser);
              if (!result?.ok)
                throw new Error(
                  result?.message || "The cloud account could not be deleted.",
                );
              authDeleted = true;
              if (!markCloudUserDeleted(cloudUser, localStorage))
                localCleanupFailed = true;
            }
            if (deleteLocal) {
              try {
                sessionStorage.removeItem(GUEST_ROLL_KEY);
              } catch {}
              try {
                localStorage.removeItem(PROGRESS_KEY);
                localSaveRemoved = true;
              } catch (error) {
                if (deletingCloudAccount && authDeleted)
                  localCleanupFailed = true;
                else throw error;
              }
            }
          } catch (error) {
            let recoveryFailed = false;
            if (
              cloudDeleted &&
              cloudUser &&
              !authDeleted &&
              cloudSnapshot?.envelope?.save_data
            )
              try {
                const restored = await restoreCloudSaveSnapshot(
                  cloudUser,
                  cloudSnapshot,
                );
                recoveryFailed = !restored.restored;
              } catch {
                recoveryFailed = true;
              }
            if (
              cloudUser &&
              !authDeleted &&
              authRef.current.userId === cloudUser
            )
              setCloudRetry((retry) => retry + 1);
            const detail = error instanceof Error ? error.message : "";
            const publicProfileCleanupUnavailable =
              error?.code === "public-profile-cleanup-unavailable" ||
              error?.code === "permission-denied" ||
              error?.code === "firestore/permission-denied";
            const storageFailure = /quotaexceedederror|securityerror/i.test(
              error?.name ?? "",
            );
            const technical =
              storageFailure ||
              /firebase|firestore|permission|quota|localstorage|sessionstorage|transaction/i.test(
                detail,
              );
            return {
              ok: false,
              message: recoveryFailed
                ? "The cloud account could not be deleted and its online save could not be restored. The copy on this device is still safe; try again or contact support."
                : publicProfileCleanupUnavailable
                  ? deletingCloudAccount
                    ? "The cloud data could not be safely checked or removed, so the cloud account was kept. Please contact support before trying again."
                    : "The cloud data could not be safely checked or removed, so the game save was kept. Please contact support before trying again."
                  : technical
                    ? cloudUser
                      ? "The online save could not be safely removed, so the cloud account was not deleted. Check your connection and try again."
                      : "The save could not be removed from this device. Free up space and try again."
                    : detail ||
                      (cloudUser
                        ? "The account or its progress could not be deleted. Please try again."
                        : "Your progress could not be removed from this device. Free up space and try again."),
            };
          }

          let notice = "";
          if (
            deleteLocal &&
            !clearLocalSaveRecovery(
              localStorage,
              previous.profile?.id,
              localOwner,
            )
          )
            localCleanupFailed = true;
          if (
            cloudUser &&
            !clearLocalSaveRecovery(localStorage, null, cloudUser)
          )
            localCleanupFailed = true;
          if (!deletingCloudAccount && localCleanupFailed)
            notice =
              "The game save was deleted, but a local recovery copy could not be erased. Clear this site's data to remove it.";
          if (cloudUser) {
            removeCachedSaveForUser(cloudUser);
            clearCloudDirty(cloudUser);
            if (deletingCloudAccount) {
              let ownerCleared = true;
              if (localOwner === cloudUser)
                ownerCleared =
                  localSaveRemoved && !localCleanupFailed
                    ? writeCloudOwner(null)
                    : false;
              notice = deleteLocal
                ? "The cloud account and its online save were deleted."
                : "The cloud account and its online save were deleted. A local save not owned by this account was kept on this device.";
              if (localCleanupFailed)
                notice +=
                  " Some local save or recovery data could not be erased; its account marker was kept to prevent importing it into another account. Clear this site's data to remove it.";
              else if (!ownerCleared)
                notice +=
                  " This browser could not clear its account marker; clear this site's data if you want to remove every local trace.";
              cloudGate.current = { userId: null, ready: true };
              updateCloud({
                status: "signed-out",
                ready: true,
                userId: null,
                error: "",
                notice,
                publicProfileAvailable: false,
                publicProfileEnabled: false,
              });
            } else {
              writeCloudOwner(cloudUser);
              cloudGate.current = { userId: cloudUser, ready: true };
              notice = [
                "The game save was deleted. Your sign-in remains available.",
                localCleanupFailed
                  ? "A local recovery copy could not be erased. Clear this site's data to remove it."
                  : "",
              ]
                .filter(Boolean)
                .join(" ");
              updateCloud({
                status: "empty",
                ready: true,
                userId: cloudUser,
                error: "",
                notice,
                publicProfileAvailable: false,
                publicProfileEnabled: false,
              });
            }
          }
          if (deleteLocal && previous.profile) {
            try {
              clearPresence(previous.profile.id);
            } catch {}
            clearAutoRoll(previous.profile.id);
          }
          if (deleteLocal) {
            reset();
            if (localCleanupFailed) setWarning(notice);
          } else {
            current.current = previous;
            setProgress(previous);
          }
          return { ok: true, notice };
        }
        if (["register", "register-cloud"].includes(action.type)) {
          try {
            if (
              parseProgress(localStorage.getItem(PROGRESS_KEY)).profile &&
              !previous.profile
            )
              return {
                ok: false,
                message:
                  "A local profile was created in another tab. Reload to use it.",
              };
          } catch {
            return {
              ok: false,
              message:
                "Sign-up could not be saved. Your guest progress is still available in this tab.",
            };
          }
        }
        let next, committed, presence;
        if (action.type.startsWith("offline-")) {
          if (!previous.profile || !previous.owned.includes("offline-roller"))
            throw new Error(
              "Create a named profile before buying Offline Roller.",
            );
          if (!readable || !navigator.locks?.request)
            throw new Error(
              "This browser can’t safely save offline rewards yet. Update it or try another browser.",
            );
          const now = Math.ceil(gameNow()),
            offline = previous.offline ?? {
              lastSeenAt: now,
              batch: null,
              report: null,
            };
          if (action.type === "offline-sync") {
            if (offline.batch) {
              current.current = previous;
              setProgress(previous);
              return {
                ok: true,
                offlineRemaining:
                  offline.batch.numbers.length - offline.batch.index,
              };
            }
            const { intervalMS, cap } = offlineSettings(previous.owned);
            const plan = offlinePlan(
              offline,
              now,
              readPresence(previous.profile.id),
              action.tabId,
              action.visible === true,
              intervalMS,
              cap,
            );
            if (action.checkAbsence === false) plan.count = 0;
            const numbers = [];
            for (let i = 0; i < plan.count; i++)
              numbers.push((await generateRoll()).number);
            next = {
              ...previous,
              offline: {
                ...offline,
                lastSeenAt: Math.max(offline.lastSeenAt, now),
                batch: numbers.length
                  ? {
                      id: crypto.randomUUID(),
                      since: plan.since,
                      intervalMS,
                      numbers,
                      index: 0,
                      ep: 0,
                      newBadges: 0,
                    }
                  : null,
              },
            };
            presence = {
              tabId: action.tabId,
              at: now,
              visible: action.visible === true,
            };
          } else if (action.type === "offline-settle") {
            const batch = offline.batch;
            if (!batch) return { ok: true, offlineRemaining: 0 };
            next = previous;
            const stop = Math.min(batch.index + 10, batch.numbers.length);
            while (next.offline.batch && next.offline.batch.index < stop) {
              const currentBatch = next.offline.batch;
              const result = await restoreRoll(
                currentBatch.numbers[currentBatch.index],
              );
              next = settleOfflineRoll(next, result, now);
            }
          } else if (action.type === "offline-dismiss")
            next = { ...previous, offline: { ...offline, report: null } };
          else throw new Error("That action is not available right now.");
          if (token !== generation.current)
            throw new Error(
              "Your game was restarted. This action was cancelled.",
            );
        } else if (action.type === "draw") {
          if (previous.offline?.batch)
            throw new Error(
              "Finish restoring offline rewards before starting another roll.",
            );
          if (previous.profile && !navigator.locks?.request)
            throw new Error(
              "This browser can’t safely save progress across open tabs. Update it or try another browser.",
            );
          if (!readable)
            throw new Error(
              "Your saved progress could not be opened. No new roll was started.",
            );
          if (previous.pendingRoll) {
            const result = await restoreRoll(previous.pendingRoll.number);
            if (token !== generation.current)
              throw new Error("This game was reset. The roll was cancelled.");
            current.current = previous;
            setProgress(previous);
            return { ok: true, run: { ...previous.pendingRoll, result } };
          }
          if (gameNow() < previous.cooldownUntil) {
            current.current = previous;
            setProgress(previous);
            throw new Error(
              "Your next roll is not ready yet. The timer is the same in every open tab.",
            );
          }
          const timing = rollSettings(previous.owned);
          const flywheel = flywheelForDraw(previous);
          // Up to six genuine draws. Skills that cannot fit keep their charge;
          // only actually-fired skills enter the committed snapshot below.
          const armed = armedSkills(previous);
          const plan = drawPlanFor(armed);
          if (flywheel === "boost" || skillWaivesCooldown(armed))
            timing.cooldownMS = 0;
          // Every draw is an ordinary, independent roll scored by the verified
          // index; the plan only says how many to take and when to stop early.
          // Each draw skill spends its own draws and keeps its own number, and
          // the roll pays for every number it kept.
          let result,
            draws = null,
            picks = null,
            winnerSkill = null,
            winnerIndex = null;
          if (!plan) result = await generateRoll();
          else
            ({ draws, result, picks, winnerSkill, winnerIndex } =
              await runDrawPicks(
                drawPicksFor(armed),
                async () => (await generateRoll()).number,
                restoreRoll,
                { ordinary: true },
              ));
          // No digits reach the UI until the draw has been committed below.
          if (token !== generation.current)
            throw new Error("This game was reset. The draw was cancelled.");
          if (
            previous.profile &&
            parseProgress(localStorage.getItem(PROGRESS_KEY)).profile?.id !==
              previous.profile.id
          ) {
            reset(parseProgress(localStorage.getItem(PROGRESS_KEY)));
            throw new Error(
              "Your profile changed in another tab. The draw was cancelled.",
            );
          }
          const firedPicks = new Set((picks ?? []).map((pick) => pick.skill));
          const fired = armed.filter(
            (id) => !drawPicksFor([id]).length || firedPicks.has(id),
          );
          const pendingRoll = {
            id: crypto.randomUUID(),
            number: result.number,
            startedAt: Math.ceil(gameNow()),
            ...timing,
            ...(fired.length ? { skills: fired } : {}),
            ...(draws ? { draws, drawLimit: SKILL_MAX_DRAWS } : {}),
            // Which draw skill kept which number, and which one (or the plain
            // draw) supplied the committed result. The roll pays for every kept
            // number, even when two skills happen to keep the same number.
            ...(picks && picks.length
              ? { picks, winnerSkill, winnerIndex }
              : {}),
            ...(flywheel ? { flywheel } : {}),
          };
          next = {
            ...previous,
            pendingRoll,
            ...(flywheel === "boost" ? { flywheelCharge: 0 } : {}),
            cooldownWindow: {
              startsAt: pendingRoll.startedAt + timing.rollMS,
              endsAt: pendingRoll.startedAt + timing.rollMS + timing.cooldownMS,
            },
            cooldownUntil:
              pendingRoll.startedAt + timing.rollMS + timing.cooldownMS,
          };
          committed = { ...pendingRoll, result };
        } else if (action.type === "complete") {
          if (
            previous.receipts.includes(action.id) ||
            previous.history.some(
              (e) => e.type === "roll" && e.id === action.id,
            )
          ) {
            current.current = previous;
            setProgress(previous);
            return { ok: true };
          }
          const pending = previous.pendingRoll;
          if (!pending || pending.id !== action.id)
            throw new Error(
              "This roll is no longer available. No EP was added.",
            );
          // Scores and badges come from the verified index, never from a UI payload.
          const result = await restoreRoll(pending.number);
          if (token !== generation.current)
            throw new Error("This game was reset. The roll was cancelled.");
          // Every other number a draw skill kept is scored here, from the same
          // verified index, so the settlement can pay each of them: the roll
          // banks one number per skill, not only the one it commits.
          const extras = [];
          for (const pick of pending.picks ?? []) {
            if (pick.skill === pending.winnerSkill) continue;
            const scored = await restoreRoll(pick.number);
            if (scored)
              extras.push({
                skill: pick.skill,
                result: scored,
                spent: pick.spent,
              });
          }
          next = applyProgress(previous, {
            ...action,
            result,
            ...(extras.length ? { extras } : {}),
            cooldownUntil:
              pending.startedAt + pending.rollMS + pending.cooldownMS,
          });
        } else {
          if (
            action.type === "buy" &&
            (action.id === "offline-roller" ||
              productById.get(action.id)?.kind === "offline") &&
            !navigator.locks?.request
          )
            throw new Error(
              "This browser can’t safely save this purchase yet. Update it or try another browser.",
            );
          const progressAction =
            renameUserId && action.type === "rename-profile"
              ? {
                  ...action,
                  username: action.username
                    .trim()
                    .normalize("NFKC")
                    .toLowerCase(),
                }
              : action.type === "register-cloud" && auth.userId
                ? {
                    ...action,
                    username: action.username
                      .trim()
                      .normalize("NFKC")
                      .toLowerCase(),
                  }
                : action;
          next = applyProgress(previous, progressAction);
          if (action.type === "register-cloud" && auth.userId) {
            const activeUserId = auth.userId;
            if (
              !auth.cloudEnabled ||
              !cloudGate.current.ready ||
              cloudGate.current.userId !== activeUserId ||
              readCloudOwner() !== activeUserId
            )
              return {
                ok: false,
                message:
                  "Wait until this Cloud account is ready before creating a profile.",
              };
            cloudWriteVersion.current++;
            try {
              const registration = await enqueueSerial(cloudQueue, () => {
                if (
                  authRef.current.userId !== activeUserId ||
                  !cloudGate.current.ready ||
                  cloudGate.current.userId !== activeUserId ||
                  readCloudOwner() !== activeUserId
                )
                  throw new Error("The signed-in account changed. Try again.");
                return createCloudProfile(activeUserId, next);
              });
              if (
                authRef.current.userId !== activeUserId ||
                token !== generation.current
              )
                return {
                  ok: false,
                  message:
                    "The Cloud account changed. Reload before creating a profile.",
                };
              next = registration.progress ?? next;
              cloudRegistration = true;
              updateCloud({
                ...cloudRef.current,
                status: "synced",
                ready: true,
                userId: activeUserId,
                updatedAt: registration.updatedAt,
                error: "",
                notice: "Your Cloud profile name is reserved for this account.",
                publicProfileAvailable: false,
                publicProfileEnabled: false,
                profileIdentity: registration.profileIdentity ?? null,
              });
            } catch (error) {
              const accessDenied =
                error?.code === "permission-denied" ||
                error?.code === "firestore/permission-denied";
              return {
                ok: false,
                message: accessDenied
                  ? "That name may already be reserved by another Cloud account, or the reservation rules are unavailable. Your local and guest progress was not changed; choose another name or try again later."
                  : error instanceof Error
                    ? error.message
                    : "The Cloud profile could not be created. Your local and guest progress was not changed.",
              };
            }
          }
          if (action.type === "rename-profile" && renameUserId) {
            let publication;
            try {
              publication = await enqueueSerial(cloudQueue, () => {
                if (
                  authRef.current.userId !== renameUserId ||
                  !cloudGate.current.ready ||
                  cloudGate.current.userId !== renameUserId ||
                  readCloudOwner() !== renameUserId
                )
                  throw new Error("The signed-in account changed. Try again.");
                return renameCloudProfile(renameUserId, previous, next);
              });
            } catch (error) {
              const accessDenied =
                error?.code === "permission-denied" ||
                error?.code === "firestore/permission-denied";
              return {
                ok: false,
                message: accessDenied
                  ? "That name may be reserved by another Cloud account, the 30-day rename cooldown may still be active, or online profile rules are unavailable. Your current profile and public link were not changed."
                  : error instanceof Error
                    ? error.message
                    : "The online profile name could not be safely changed. No change was made; try again.",
              };
            }
            if (
              authRef.current.userId !== renameUserId ||
              token !== generation.current
            )
              return {
                ok: false,
                message:
                  "The signed-in account or active profile changed. Review online progress before continuing.",
              };
            if (!publication.renamed) {
              const notice =
                "That name is already reserved by another Cloud account. Your current name and public profile are unchanged; choose a different name.";
              updateCloud({
                ...cloudRef.current,
                status: "synced",
                ready: true,
                userId: renameUserId,
                error: "",
                publicProfileEnabled: publication.enabled,
                publicProfileAvailable: publication.published,
                profileIdentity: publication.profileIdentity ?? null,
                notice,
              });
              return { ok: false, message: notice };
            }
            next = publication.progress ?? next;
            renameNotice = publication.enabled
              ? "Profile name updated and public profile moved to the new name."
              : "Profile name updated. Public sharing remains off.";
            updateCloud({
              ...cloudRef.current,
              status: "synced",
              ready: true,
              userId: renameUserId,
              updatedAt: new Date().toISOString(),
              error: "",
              publicProfileEnabled: publication.enabled,
              publicProfileAvailable: publication.published,
              profileIdentity: publication.profileIdentity ?? null,
              notice: renameNotice,
            });
          }
          if (action.type === "avatar" && avatarUserId) {
            let avatarChange;
            try {
              avatarChange = await enqueueSerial(cloudQueue, () => {
                if (
                  authRef.current.userId !== avatarUserId ||
                  !cloudGate.current.ready ||
                  cloudGate.current.userId !== avatarUserId ||
                  readCloudOwner() !== avatarUserId
                )
                  throw new Error("The signed-in account changed. Try again.");
                return updateCloudProfileAvatar(avatarUserId, previous, next);
              });
            } catch (error) {
              const accessDenied =
                error?.code === "permission-denied" ||
                error?.code === "firestore/permission-denied";
              return {
                ok: false,
                message: accessDenied
                  ? "The Cloud logo update was blocked by the seven-day cooldown, a save-rate limit, or unavailable profile rules. Your current logo was not changed."
                  : error instanceof Error
                    ? error.message
                    : "The Cloud logo could not be safely changed. Your current logo was not changed.",
              };
            }
            if (
              authRef.current.userId !== avatarUserId ||
              token !== generation.current
            )
              return {
                ok: false,
                message:
                  "The signed-in account or active profile changed. Reload before continuing.",
              };
            updateCloud({
              ...cloudRef.current,
              status: "synced",
              ready: true,
              userId: avatarUserId,
              updatedAt: new Date().toISOString(),
              error: "",
              profileIdentity: avatarChange.profileIdentity ?? null,
              notice:
                "Cloud logo updated. The public summary shows it only while your profile is public.",
            });
          }
        }
        if (next !== actionHead && next.profile) {
          try {
            if (!readable)
              throw new Error("Your progress could not be opened.");
            if (previous.profile) {
              const latest = parseProgress(localStorage.getItem(PROGRESS_KEY));
              if (
                latest.profile?.id !== previous.profile.id ||
                latest.rebirths !== previous.rebirths ||
                latest.ultraRebirths !== previous.ultraRebirths ||
                latest.rollbacks !== previous.rollbacks
              ) {
                reset(latest);
                return {
                  ok: false,
                  message:
                    "Your profile changed in another tab. The previous action was cancelled.",
                };
              }
            }
            const saved = JSON.stringify(next);
            const localRegistration =
              action.type === "register" && !authRef.current.userId;
            const previousCloudOwner = readCloudOwner();
            if (localRegistration && !writeCloudOwner(null))
              throw new Error(
                "The local save owner could not be cleared safely.",
              );
            localStorage.setItem(PROGRESS_KEY, saved);
            writeVault(saved, {
              storage: localStorage,
              ownerId: localRegistration ? null : readCloudOwner(),
            });
            if (localRegistration) {
              if (typeof previousCloudOwner === "string" && previousCloudOwner)
                clearCloudDirty(previousCloudOwner);
            } else markLocalCloudDirty();
            healthy.current = true;
            unsaved.current = new Set();
            setWarning("");
          } catch {
            healthy.current = false;
            setWarning(
              "Saving on this device is unavailable or full. New draws and purchases need a saved copy. A completed roll may be credited in this tab until saving works again; saved history has not been deleted.",
            );
            if (action.type === "register-cloud" && cloudRegistration) {
              current.current = next;
              setProgress(next);
              try {
                sessionStorage.removeItem(GUEST_ROLL_KEY);
              } catch {}
              return {
                ok: true,
                message:
                  "Your Cloud profile and progress are safe online, but this device could not save a local copy. Free up space before continuing here.",
              };
            }
            if (action.type === "complete") {
              // The settled roll is kept in memory only, so remember exactly
              // which rolls those are: they are the only ones owed on recovery.
              const known = new Set(previous.history.map((e) => e.id));
              for (const event of next.history)
                if (
                  event.type === "roll" &&
                  !event.with &&
                  !known.has(event.id)
                )
                  unsaved.current.add(event.id);
            }
            if (action.type !== "complete")
              return {
                ok: false,
                message:
                  action.type === "rebirth" || action.type === "fresh-start"
                    ? "Rebirth could not be saved. Your progress was not reset. Free up space and try again."
                    : action.type === "ultra-rebirth"
                      ? "Prestige could not be saved. Your progress was not reset. Free up space and try again."
                      : action.type === "rollback"
                        ? "The Rollback could not be saved. Your progress was not reset. Free up space and try again."
                        : action.type.startsWith("offline-")
                          ? "Offline rewards could not be saved. Your completed rolls are safe. Free up space and try again."
                          : ["register", "register-cloud"].includes(action.type)
                            ? "Sign-up could not be saved. Your current progress is still available in this tab."
                            : action.type === "draw"
                              ? "The roll could not be saved. No number was revealed and no EP was awarded. Free up space and try again."
                              : action.type === "goal"
                                ? "Your goal could not be saved. Your previous goal and EP are unchanged."
                                : action.type === "rename-profile"
                                  ? renameUserId
                                    ? "The online profile name changed, but this device could not save its matching copy. The previous copy is available in Settings → Restore save; free up space and reload before continuing."
                                    : "The profile name could not be saved. Your previous name and progress are unchanged."
                                  : "Your purchase or equipment change could not be saved. No EP was spent.",
              };
          }
        }
        if (
          next !== previous &&
          !next.profile &&
          [
            "draw",
            "complete",
            "rebirth",
            "ultra-rebirth",
            "rollback",
            "fresh-start",
          ].includes(action.type)
        ) {
          try {
            sessionStorage.setItem(
              GUEST_ROLL_KEY,
              JSON.stringify({
                pendingRoll: next.pendingRoll,
                cooldownUntil: next.cooldownUntil,
                cooldownWindow: next.cooldownWindow,
              }),
            );
          } catch {
            if (action.type === "draw" || action.type === "rebirth")
              return {
                ok: false,
                message:
                  action.type === "rebirth"
                    ? "Rebirth could not be saved for this session. Your progress was not reset. Please try again."
                    : "The game could not remember this roll. No number was revealed. Free up space and try again.",
              };
            setWarning(
              "The game could not remember this roll across a refresh. Keep this tab open until the countdown ends.",
            );
          }
        }
        if (["register", "register-cloud"].includes(action.type)) {
          try {
            sessionStorage.removeItem(GUEST_ROLL_KEY);
          } catch {}
        }
        if (
          action.type === "rebirth" ||
          action.type === "ultra-rebirth" ||
          action.type === "rollback" ||
          action.type === "fresh-start"
        ) {
          try {
            if (previous.profile && action.type === "rebirth")
              clearPresence(previous.profile.id);
          } catch {}
          reset(next);
          return { ok: true, granted: next.history.at(-1)?.skill ?? null };
        }
        current.current = next;
        setProgress(next);
        if (presence)
          try {
            writePresence(
              next.profile.id,
              presence.tabId,
              presence.at,
              presence.visible,
            );
          } catch {}
        return {
          ok: true,
          ...(renameNotice ? { message: renameNotice } : {}),
          offlineRemaining: next.offline?.batch
            ? next.offline.batch.numbers.length - next.offline.batch.index
            : 0,
          ...(committed ? { run: committed } : {}),
          // Bulk delete reports how many entries it actually removed.
          ...(action.type === "history-prune"
            ? { removed: previous.history.length - next.history.length }
            : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const technical =
          /firebase|firestore|web locks|localstorage|sessionstorage|permission-denied|decompress|snapshot|transaction|quotaexceeded|typeerror/i.test(
            message,
          );
        return {
          ok: false,
          message:
            message && !technical
              ? message
              : "This action could not be completed. Please try again.",
        };
      }
    };
    const task = queue.current.then(() =>
      navigator.locks?.request
        ? navigator.locks.request(PROGRESS_KEY, execute)
        : execute(),
    );
    queue.current = task.catch(() => {});
    return task.catch(() => ({
      ok: false,
      message: "Progress could not be updated. Please try again.",
    }));
  }
  function restoreLocalCopy(copy) {
    if (!copy?.raw)
      return { ok: false, message: "There is no saved copy to restore yet." };
    const auth = authRef.current;
    const owner = restoredSaveOwner({
      copyOwner: copy.ownerId,
      userId: auth.userId,
      authReady: auth.authReady,
      cloudReady: cloudGate.current.ready,
      cloudUserId: cloudGate.current.userId,
      cloudStatus: cloudRef.current.status,
    });
    if (!owner.ok)
      return {
        ok: false,
        message:
          owner.reason === "different-account"
            ? "This recovery copy belongs to a different or unverified account. Sign out to restore it locally; it will not be imported into this account."
            : "Wait until the active account’s progress has loaded before restoring a copy.",
      };
    if (
      (typeof copy.ownerId === "string" && isCloudUserDeleted(copy.ownerId)) ||
      (typeof owner.ownerId === "string" && isCloudUserDeleted(owner.ownerId))
    )
      return {
        ok: false,
        message:
          "This copy belongs to a cloud account that was deleted and cannot be restored.",
      };

    let restored;
    try {
      restored = parseAndRepairProgress(copy.raw).progress;
    } catch {
      return {
        ok: false,
        message: "This saved copy could not be opened and was not restored.",
      };
    }
    let activeRaw = null;
    try {
      activeRaw = localStorage.getItem(PROGRESS_KEY);
    } catch {}
    if (
      isReadableSave(activeRaw) &&
      !archiveSavedCopy(activeRaw, {
        ownerId: readCloudOwner(),
        reason: "Progress saved before manual restore",
        source: "manual-restore",
      })
    )
      return {
        ok: false,
        message:
          "The current save could not be preserved safely, so the selected copy was not restored. Free some device storage and try again.",
      };
    if (!writeCloudOwner(owner.ownerId))
      return {
        ok: false,
        message:
          "The copy could not be safely associated with its account on this device. Free up space and try again.",
      };
    try {
      localStorage.setItem(PROGRESS_KEY, copy.raw);
    } catch {
      // Fail closed if the primary write failed after the marker changed.
      writeCloudOwner(UNKNOWN_CLOUD_OWNER);
      return {
        ok: false,
        message:
          "The saved copy could not be restored. Free up space on this device and try again.",
      };
    }
    // Do not replace the rolling vault: it still protects the progress that was
    // active before this explicit restore. The next normal save refreshes it.
    reset(restored);
    return { ok: true, at: copy.at };
  }

  const vault = {
    get: () => readVault(),
    getRecovery: () => readCloudRecovery(),
    getCopies: () => getRecoveryCopies(),
    restoreCopy: (id) => {
      const copy = getRecoveryCopies().find((candidate) => candidate.id === id);
      if (!copy)
        return {
          ok: false,
          message: "That saved copy is no longer available.",
        };
      if (!copy.valid || !copy.raw)
        return {
          ok: false,
          message: "This saved copy is damaged and cannot be restored.",
        };
      const result = restoreLocalCopy(copy);
      return result.ok
        ? { ...result, source: copy.label, reason: copy.reason }
        : result;
    },
    restore: () => {
      const copy = readVault();
      if (!copy)
        return { ok: false, message: "There is no backup to restore yet." };
      return restoreLocalCopy(copy);
    },
    restoreRecovery: () => {
      const copy = readCloudRecovery();
      if (!copy)
        return {
          ok: false,
          message: "There is no other saved copy to restore yet.",
        };
      const result = restoreLocalCopy(copy);
      return result.ok ? { ...result, reason: copy.reason } : result;
    },
  };
  return {
    progress,
    warning,
    dispatch,
    epoch,
    cloud,
    retryCloudLoad,
    resolveCloudConflict,
    setPublicProfileVisibility,
    vault,
  };
}
