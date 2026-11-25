import { unpackVaultSave } from "./save-codec.js";
import { packDeviceSave } from "./local-save.js";
import { gameNow } from "./game-clock";
import { useCallback, useEffect, useRef, useState } from "react";
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
  writeCloudSyncMark,
  renameCloudProfile,
  removeCachedSaveForUser,
  reserveCloudProfileName,
  restoreCloudSaveSnapshot,
  restoredSaveOwner,
  selectLocalSaveForCloudUser,
  setCloudProfileVisibility,
  updateCloudProfileAvatar,
  writeCloudOwner,
} from "./cloud-save.js";
import { firebaseConfigured } from "./firebase.js";
import {
  acknowledgeServerRoll,
  describeCloudVerificationFailure,
  requestGameStatus,
  requestServerRoll,
} from "./game-authority-client.js";
import {
  CLOUD_RECOVERY_MAX_ATTEMPTS,
  beginCloudOutage,
  canProbeCloudOutage,
  endCloudOutage,
  nextProbeDelay,
  outageForAccount,
  readCloudOutage,
  rememberCloudOutage,
} from "./cloud-fallback.js";
import {
  allowsLocalFallback,
  errorReference,
  isErrorReference,
} from "./error-codes.js";
import {
  clearCloudQuotaPause,
  cloudQuotaNotice,
  cloudQuotaPauseRemaining,
  pauseCloudForQuota,
} from "./cloud-quota.js";
import { cloudGameAccess } from "./auth-gate.js";
import { reportIncident } from "./incident-report.js";
import { localSaveUsableForCloudFallback } from "./local-fallback.js";
import { getStatusIssue, maintenanceActiveFor } from "./use-status-issue.js";
import {
  archiveSavedCopy,
  clearLocalSaveRecovery,
  getRecoveryCopies,
  isReadableSave,
  readCloudRecovery,
  readVault,
  writePreRepairOwner,
  writeDeviceSaveWithRecovery,
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
import {
  generateRoll,
  generateRollNumbers,
  restoreRoll,
  restoreRolls,
} from "./roll-client.js";
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

const CLOUD_INITIAL_LOAD_TIMEOUT_MS = 5_000;
const OFFLINE_SETTLE_CHUNK = 48;

function repairWarning(repairs) {
  if (!repairs.length) return "";
  return "Some saved details needed fixing. Your readable progress was kept.";
}
function readLocalSave() {
  try {
    return unpackVaultSave(localStorage.getItem(PROGRESS_KEY)) || null;
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
    // The string was just built here, so packing does not need to decompress it
    // first, and verification would decompress the save a second time per write.
    const { packed } = packDeviceSave(raw, { verify: false });
    writeDeviceSaveWithRecovery(localStorage, PROGRESS_KEY, raw, packed);
    writeVault(raw, {
      storage: localStorage,
      ownerId,
      packed,
    });
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
        localStorage.setItem(PRE_REPAIR_BACKUP_KEY, stored);
        const saveOwner = readCloudOwner();
        writePreRepairOwner(saveOwner, localStorage);
        const repairedRaw = JSON.stringify(progress);
        writeDeviceSaveWithRecovery(localStorage, PROGRESS_KEY, repairedRaw);
        writeVault(repairedRaw, {
          storage: localStorage,
          ownerId: saveOwner,
        });
      } catch {}
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
  tabActive = true,
  deleteAuthUser = null,
} = {}) {
  const [initial] = useState(load),
    [progress, setProgress] = useState(initial.progress),
    [warning, setWarning] = useState(initial.warning),
    [epoch, setEpoch] = useState(0),
    [cloudRetry, setCloudRetry] = useState(0),
    [cloudWriteRetry, setCloudWriteRetry] = useState(0),
    [gameSecurity, setGameSecurityState] = useState(null);
  const gameSecurityRef = useRef(null);
  const setGameSecurity = useCallback((security) => {
    gameSecurityRef.current = security;
    setGameSecurityState(security);
  }, []);
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
    unsaved = useRef(new Set()),
    generation = useRef(0),
    queue = useRef(Promise.resolve()),
    cloudGeneration = useRef(0),
    cloudQueue = useRef(Promise.resolve()),
    cloudWriteVersion = useRef(0),
    cloudWriteFailure = useRef({ snapshot: null, userId: null, attempts: 0 }),
    outageSession = useRef(null),
    outageBlocked = useRef(false),
    cloudBlocked = useRef(false),
    pendingCloudConflict = useRef(null),
    cloudLocalOnly = useRef(false);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const quotaResumeTimer = useRef(null);

  const applyQuotaPause = useCallback((targetUserId, remainingMs) => {
    if (pendingCloudConflict.current?.userId === targetUserId) return;
    const owner = readCloudOwner();
    const localCopyIsOwned = localSaveUsableForCloudFallback({
      owner,
      userId: targetUserId,
      profile: current.current.profile,
      healthy: healthy.current,
    });
    cloudLocalOnly.current = localCopyIsOwned && owner !== targetUserId;
    if (localCopyIsOwned && !cloudLocalOnly.current)
      ensureCloudOwner(targetUserId);
    cloudGate.current = { userId: targetUserId, ready: localCopyIsOwned };
    if (localCopyIsOwned && !cloudLocalOnly.current)
      markCloudDirty(targetUserId);
    updateCloud({
      ...cloudRef.current,
      status: "offline",
      ready: localCopyIsOwned,
      userId: targetUserId,
      error: "",
      notice: cloudQuotaNotice(remainingMs),
      conflict: null,
      resolving: false,
    });
  }, []);

  const pauseForQuota = useCallback((error) => {
    const remaining = pauseCloudForQuota(error);
    if (!remaining) return 0;
    if (quotaResumeTimer.current) clearTimeout(quotaResumeTimer.current);
    quotaResumeTimer.current = setTimeout(() => {
      quotaResumeTimer.current = null;
      clearCloudQuotaPause();
      setCloudRetry((retry) => retry + 1);
    }, remaining + 1000);
    return remaining;
  }, []);

  useEffect(
    () => () => {
      if (quotaResumeTimer.current) clearTimeout(quotaResumeTimer.current);
    },
    [],
  );
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
  const [gameSecurityAttempt, setGameSecurityAttempt] = useState(0);
  // Bumped whenever an outage starts or resumes so the probe below re-runs in
  // the tab that hit it, not only after a reload.
  const [outageEpoch, setOutageEpoch] = useState(0);
  useEffect(() => {
    let active = true;
    setGameSecurity(null);
    if (!(cloudEnabled && authReady && userId && !localPlay && online))
      return () => {
        active = false;
      };
    void requestGameStatus(userId, (security) => {
      if (active && !recoverCloudStatus(userId, security))
        setGameSecurity(security);
    });
    return () => {
      active = false;
    };
  }, [authReady, cloudEnabled, gameSecurityAttempt, localPlay, online, userId]);
  // A reload must not bring the player back to a dead Cloud button: the mark
  // remembers which account hit the outage, so the probe (and local play)
  // resume without a click.
  useEffect(() => {
    if (!userId || localPlay) return;
    const mark = outageForAccount(userId, localStorage);
    if (!mark) return;
    if (mark.profileId && mark.profileId !== current.current.profile?.id) {
      endCloudOutage(userId, localStorage);
      return;
    }
    outageSession.current = mark.sessionId;
    cloudBlocked.current = false;
    setOutageEpoch((epoch) => epoch + 1);
  }, [localPlay, userId]);

  // While an outage mark exists for this account, a short probe asks the Worker
  // whether it can verify rolls again. When it can, the paused Cloud write
  // resumes, which reconciles this device's progress with the online copy using
  // the normal precedence rules. A tab left in the background is not woken for
  // this; coming back to the tab is what resumes it.
  useEffect(() => {
    if (!(cloudEnabled && authReady && userId && !localPlay && online)) return;
    if (outageBlocked.current) return;
    const sessionId = outageSession.current;
    if (!sessionId) return;
    const mark = outageForAccount(userId, localStorage);
    if (!mark) return;
    let cancelled = false;
    let timer = null;
    const schedule = () => {
      const current = outageForAccount(userId, localStorage);
      if (
        cancelled ||
        !canProbeCloudOutage(current) ||
        current.sessionId !== sessionId
      )
        return;
      timer = setTimeout(
        () => void probe(),
        nextProbeDelay(current.attempts ?? 0),
      );
    };
    const record = (attempts) =>
      rememberCloudOutage({
        userId,
        sessionId,
        attempts,
        profileId: mark.profileId,
      });
    async function probe() {
      const mark = outageForAccount(userId, localStorage);
      if (
        cancelled ||
        !canProbeCloudOutage(mark) ||
        mark.sessionId !== sessionId
      )
        return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      const security = await requestGameStatus(userId, () => {});
      if (
        cancelled ||
        authRef.current.userId !== userId ||
        outageForAccount(userId, localStorage)?.sessionId !== sessionId
      )
        return;
      // A security answer only exists after every binding was checked, so it is
      // the signal that Cloud can verify rolls again. A paused account is
      // Cloud's decision, not an outage: stop probing and show the notice.
      if (security) {
        recoverCloudStatus(userId, security);
        return;
      }
      const attempts =
        (outageForAccount(userId, localStorage)?.attempts ?? 0) + 1;
      if (attempts >= CLOUD_RECOVERY_MAX_ATTEMPTS) outageBlocked.current = true;
      record(attempts);
      schedule();
    }
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authReady, cloudEnabled, localPlay, online, outageEpoch, userId]);

  // The first status check is not retried on its own. This asks again on
  // demand, for example after the player presses Try again.
  const refreshGameSecurity = useCallback(async () => {
    const current = authRef.current;
    if (!(current.cloudEnabled && current.authReady && current.userId))
      return null;
    if (current.localPlay) return null;
    return requestGameStatus(current.userId, (security) => {
      if (
        authRef.current.userId === current.userId &&
        !recoverCloudStatus(current.userId, security)
      )
        setGameSecurity(security);
    });
  }, []);
  const cloudGate = useRef({
    userId: null,
    ready: !cloudEnabled || (authReady && !userId),
  });
  function updateCloud(next) {
    if (next.status === "error" && next.error)
      reportIncident({
        code: errorReference(next.error, "CL302"),
        source: "ui-notice",
      });
    cloudRef.current = next;
    setCloudState(next);
  }
  // While Cloud cannot verify rolls, play continues on this device. The mark
  // keeps the player on local play across tabs and reloads, and lets the probe
  // resume after a reload without being asked anything.
  function beginOutage(activeUserId, profileId) {
    const mark = beginCloudOutage(
      activeUserId,
      { active: true, profileId },
      localStorage,
    );
    if (mark) {
      outageSession.current = mark.sessionId;
      setOutageEpoch((epoch) => epoch + 1);
      // Local play is automatic, so the only thing the player is told is that it
      // happened and that it will undo itself. No button, no choice.
      setGameSecurity({
        status: "warning",
        warningStage: 1,
        message:
          "Cloud rolls are unavailable right now, so this device is keeping score on its own. Your progress is safe: the game reconnects and syncs by itself as soon as Cloud answers again.",
      });
    }
    return mark;
  }
  function endOutage(activeUserId) {
    endCloudOutage(activeUserId, localStorage);
    outageSession.current = null;
    outageBlocked.current = false;
  }
  function recoverCloudStatus(activeUserId, security) {
    if (authRef.current.userId !== activeUserId) return false;
    const mark = outageForAccount(activeUserId, localStorage);
    if (
      !mark ||
      (mark.profileId && mark.profileId !== current.current.profile?.id)
    )
      return false;
    endOutage(activeUserId);
    cloudBlocked.current = ["restricted", "pending"].includes(security.status);
    if (cloudBlocked.current) setGameSecurity(security);
    else {
      setGameSecurity({
        status: "warning",
        warningStage: 1,
        message:
          "Cloud is answering again. This device’s progress is syncing with your online save; nothing was lost while Cloud was unavailable.",
      });
      setCloudWriteRetry((retry) => retry + 1);
      setCloudRetry((retry) => retry + 1);
    }
    return true;
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
              const mergedSave = packDeviceSave(mergedRaw);
              writeDeviceSaveWithRecovery(
                localStorage,
                PROGRESS_KEY,
                mergedRaw,
                mergedSave.packed,
              );
              writeVault(mergedRaw, {
                storage: localStorage,
                ownerId: readCloudOwner(),
                packed: mergedSave.packed,
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
    cloudLocalOnly.current = false;
    // An outage mark belongs to the account that hit it. Signing out or
    // switching accounts must not inherit the fallback.
    const outageMark = readCloudOutage();
    if (outageMark && outageMark.userId !== userId) {
      endCloudOutage(null, localStorage);
      outageSession.current = null;
      outageBlocked.current = false;
    }
    cloudBlocked.current = false;

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
      const localOwner = readCloudOwner();
      const localCopyIsOwned = localSaveUsableForCloudFallback({
        owner: localOwner,
        userId,
        profile: current.current.profile,
        healthy: healthy.current,
      });
      cloudLocalOnly.current = localCopyIsOwned && localOwner !== userId;
      cloudGate.current = { userId, ready: localCopyIsOwned };
      updateCloud({
        status: "offline",
        ready: localCopyIsOwned,
        userId,
        error: localCopyIsOwned
          ? ""
          : "Cloud progress cannot be checked offline. Reconnect before changing this account.",
        notice: localCopyIsOwned
          ? cloudLocalOnly.current
            ? "Playing from this unlinked device save. It stays local until you choose to link it."
            : "Changes are saved on this device and will sync when you reconnect."
          : "",
      });
      return () => {
        active = false;
      };
    }

    if (maintenanceActiveFor(getStatusIssue())) {
      const localOwner = readCloudOwner();
      const localCopyIsOwned = localSaveUsableForCloudFallback({
        owner: localOwner,
        userId,
        profile: current.current.profile,
        healthy: healthy.current,
      });
      cloudLocalOnly.current = localCopyIsOwned && localOwner !== userId;
      cloudGate.current = { userId, ready: localCopyIsOwned };
      updateCloud({
        status: "maintenance",
        ready: localCopyIsOwned,
        userId,
        error: "",
        notice:
          "Online backup is paused during scheduled maintenance. Changes stay on this device until it ends.",
      });
      return () => {
        active = false;
      };
    }

    const quotaRemaining = cloudQuotaPauseRemaining();
    if (quotaRemaining > 0) {
      applyQuotaPause(userId, quotaRemaining);
      return () => {
        active = false;
      };
    }

    const ownedLocalSaveIsReady =
      readCloudOwner() === userId &&
      Boolean(current.current.profile) &&
      healthy.current;
    cloudGate.current = { userId, ready: ownedLocalSaveIsReady };
    updateCloud({
      status: "loading",
      ready: ownedLocalSaveIsReady,
      userId,
      error: "",
      notice: ownedLocalSaveIsReady
        ? "Using this device’s saved progress while Cloud loads."
        : "",
    });
    const cloudLoadTimer = setTimeout(() => {
      if (
        !currentRequest() ||
        cloudRef.current.userId !== userId ||
        cloudRef.current.status !== "loading"
      )
        return;
      const owner = readCloudOwner();
      const localCopyIsOwned = localSaveUsableForCloudFallback({
        owner,
        userId,
        profile: current.current.profile,
        healthy: healthy.current,
      });
      cloudGate.current = { userId, ready: localCopyIsOwned };
      updateCloud({
        ...cloudRef.current,
        status: "error",
        ready: localCopyIsOwned,
        userId,
        error: localCopyIsOwned
          ? ""
          : "Cloud progress could not be loaded yet. Try again, or sign out to start playing locally; your online save is safe.",
        notice: localCopyIsOwned
          ? "Your device progress is ready. Cloud is taking longer than expected; try again from Cloud Account."
          : "",
      });
    }, CLOUD_INITIAL_LOAD_TIMEOUT_MS);

    async function restoreCloudSave() {
      const localOwner = readCloudOwner();
      const trustedLocalSave =
        localOwner === userId &&
        Boolean(current.current.profile) &&
        healthy.current;
      const localRaw = readLocalSave();
      let localProgress = current.current;
      let cachedProgress = null;
      let cacheWarning = "";

      if (localRaw && (!localOwner || localOwner === userId))
        writeLocalSave(localProgress);

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

      let candidate = localProgress;
      let reconciliation;
      while (true) {
        const candidateSnapshot = current.current;
        reconciliation = await reconcileCloudSave(userId, candidate, {
          allowLocal: true,
          localOwner: localSelection.owner,
          storage: localStorage,
        });
        if (!currentRequest()) return;
        if (!trustedLocalSave || current.current === candidateSnapshot) break;
        candidate = current.current;
      }

      clearTimeout(cloudLoadTimer);
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
    loadTask.catch((loadError) => {
      clearTimeout(cloudLoadTimer);
      if (!currentRequest()) return;

      const ownerOnFailure = readCloudOwner();
      if (!ownerOnFailure || ownerOnFailure === userId) {
        writeLocalSave(current.current);
        if (ownerOnFailure === userId) markCloudDirty(userId);
      }
      const quotaRemaining = pauseForQuota(loadError);
      if (quotaRemaining > 0) {
        applyQuotaPause(userId, quotaRemaining);
        return;
      }
      const localCopyIsOwned = localSaveUsableForCloudFallback({
        owner: ownerOnFailure,
        userId,
        profile: current.current.profile,
        healthy: healthy.current,
      });
      cloudLocalOnly.current = localCopyIsOwned && ownerOnFailure !== userId;
      cloudGate.current = { userId, ready: localCopyIsOwned };

      const detail =
        typeof loadError?.code === "string" && loadError.code
          ? ` (${loadError.code})`
          : "";
      updateCloud({
        status: "error",
        ready: localCopyIsOwned,
        userId,
        error: localCopyIsOwned
          ? ""
          : "Your online progress could not be loaded. Try again before changing anything." +
            detail,
        notice: localCopyIsOwned
          ? cloudLocalOnly.current
            ? "Using this device’s local progress. It is not linked to the signed-in account and will not overwrite another cloud save."
            : "Your device progress is ready to play. Cloud will try again when available."
          : "",
      });
    });

    return () => {
      active = false;
      clearTimeout(cloudLoadTimer);
    };
  }, [userId, authReady, cloudEnabled, cloudRetry, online]);

  useEffect(() => {
    if (cloudLocalOnly.current) return undefined;
    if (
      !cloudEnabled ||
      !authReady ||
      !userId ||
      !progress.profile ||
      cloudGate.current.userId !== userId ||
      !cloudGate.current.ready
    )
      return undefined;

    if (maintenanceActiveFor(getStatusIssue())) {
      updateCloud({
        ...cloudRef.current,
        status: "maintenance",
        ready: true,
        userId,
        error: "",
        notice:
          "Cloud sync is paused during scheduled maintenance; changes stay on this device.",
      });
      return undefined;
    }

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

    const quotaRemaining = cloudQuotaPauseRemaining();
    if (quotaRemaining > 0) {
      applyQuotaPause(userId, quotaRemaining);
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
    const flush = () => {
      globalThis.removeEventListener?.("focus", flush);
      document.removeEventListener?.("visibilitychange", onFlushVisibility);
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
          const quotaRemaining = pauseForQuota(failure);
          if (quotaRemaining > 0) {
            applyQuotaPause(userId, quotaRemaining);
            return;
          }
          const code = String(failure?.code ?? "")
            .split("/")
            .at(-1);
          const message = String(failure?.message ?? "");
          const retryable =
            [
              "aborted",
              "deadline-exceeded",
              "network-request-failed",
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
              "Your progress could not be backed up online. The copy on this device is safe. Try again." +
              (code ? ` (${code})` : ""),
            notice: "",
          });
        });
    };
    const onFlushVisibility = () => {
      if (document.visibilityState === "visible") flush();
    };
    const timer = tabActive ? setTimeout(flush, 10_000) : undefined;
    globalThis.addEventListener?.("focus", flush);
    document.addEventListener?.("visibilitychange", onFlushVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      globalThis.removeEventListener?.("focus", flush);
      document.removeEventListener?.("visibilitychange", onFlushVisibility);
    };
  }, [
    progress,
    userId,
    authReady,
    cloudEnabled,
    online,
    tabActive,
    cloudWriteRetry,
  ]);

  function retryCloudLoad() {
    clearCloudQuotaPause();
    if (quotaResumeTimer.current) {
      clearTimeout(quotaResumeTimer.current);
      quotaResumeTimer.current = null;
    }
    if (cloudEnabled && authReady && userId) {
      cloudWriteFailure.current = { snapshot: progress, userId, attempts: 0 };
      setCloudWriteRetry((retry) => retry + 1);
      setCloudRetry((retry) => retry + 1);
    }
  }

  // Failures here used to be indistinguishable (or silent); each one now says
  // what happened.
  function publicationOutcome(publication, enabled) {
    if (!publication) {
      return {
        ok: false,
        enabled: false,
        message:
          "Profile privacy could not be changed because the online profile did not answer. Reload and try again.",
      };
    }
    if (publication.conflict) {
      const blocked = publication.identityConflict
        ? "Your profile name is not reserved for this Cloud account, so it cannot be published."
        : "That profile name is already used by another Cloud account.";
      return {
        ok: false,
        enabled: publication.enabled === true,
        available: false,
        message: `${blocked} Choose a different profile name, then turn public sharing on again.`,
      };
    }
    if (enabled === true && publication.published !== true) {
      return {
        ok: false,
        enabled: publication.enabled === true,
        available: false,
        message:
          "Public sharing was turned on, but your profile summary could not be published. Try again in a moment.",
      };
    }
    return {
      ok: true,
      enabled: publication.enabled === true,
      available: publication.published === true,
      message: enabled
        ? "Your profile is public. Anyone who knows the name or link can view its summary."
        : "Your public profile was removed. Your private cloud save is unchanged.",
    };
  }

  function publicProfileErrorNotice(error) {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "");
    if (/wait a couple of seconds/i.test(message))
      return "Cloud saves have a two-second write limit. Wait a moment, then try changing profile privacy again.";
    if (/account changed|signed-in account changed/i.test(message))
      return "The signed-in account changed before the change finished. Reload and try again.";
    if (
      code.endsWith("permission-denied") ||
      /missing or insufficient permissions/i.test(message)
    )
      return "Public sharing is blocked by this Firebase project’s Firestore rules. Publish the updated firestore.rules, then turn public sharing on again; your private save is safe.";
    if (code.endsWith("unavailable") || /network|offline/i.test(message))
      return "The online profile could not be reached. Check your connection and try again; your private save is safe.";
    if (code.endsWith("deadline-exceeded") || /timed? ?out/i.test(message))
      return "Changing profile privacy took too long. Try again; your private save is safe.";
    return message
      ? `Profile privacy could not be changed: ${message}`
      : "Profile privacy could not be changed. Reload and try again.";
  }

  async function setPublicProfileVisibility(enabled) {
    const activeUserId = authRef.current.userId;
    if (maintenanceActiveFor(getStatusIssue()))
      return {
        ok: false,
        message:
          "Online profile publishing is paused during maintenance. Your local progress remains available.",
      };
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
      let publication = await enqueueSerial(cloudQueue, () => {
        if (
          authRef.current.userId !== activeUserId ||
          !cloudGate.current.ready ||
          cloudGate.current.userId !== activeUserId ||
          readCloudOwner() !== activeUserId
        )
          throw new Error("The signed-in account changed. Try again.");
        return setCloudProfileVisibility(activeUserId, enabled === true);
      });
      // A missing name reservation used to make this a no-op; claim it and retry.
      if (enabled === true && publication?.conflict && !publication.enabled) {
        const claimed = await enqueueSerial(cloudQueue, () =>
          reserveCloudProfileName(activeUserId, current.current),
        );
        if (claimed?.reserved)
          publication = await enqueueSerial(cloudQueue, () =>
            setCloudProfileVisibility(activeUserId, true),
          );
      }
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Try again from the active account.",
        };
      const outcome = publicationOutcome(publication, enabled);
      updateCloud({
        ...cloudRef.current,
        publicProfileEnabled: publication.enabled,
        publicProfileAvailable: publication.published,
        profileIdentity: publication.profileIdentity ?? null,
        notice: outcome.ok
          ? outcome.message
          : `${outcome.message} Your private cloud save is unchanged.`,
      });
      return outcome;
    } catch (error) {
      const notice = publicProfileErrorNotice(error);
      updateCloud({ ...cloudRef.current, notice });
      return {
        ok: false,
        message: notice,
        enabled: cloudRef.current.publicProfileEnabled === true,
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
        const deletingCloudSave =
          action.type === "delete" && Boolean(auth.userId);
        const maintenance = maintenanceActiveFor(getStatusIssue());
        if (maintenance && deletingCloudSave)
          return {
            ok: false,
            message:
              "Cloud save and account deletion are unavailable during maintenance. Your local progress remains available.",
          };
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
          maintenance,
        });
        if (!deletingCloudAccount && !accountAccess.allowed)
          return { ok: false, message: accountAccess.message };
        if (
          !maintenance &&
          !deletingCloudAccount &&
          auth.cloudEnabled &&
          auth.userId &&
          (!cloudGate.current.ready ||
            cloudGate.current.userId !== auth.userId ||
            (!cloudLocalOnly.current && readCloudOwner() !== auth.userId))
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
          if (maintenance)
            return {
              ok: false,
              message:
                "Online profile changes are paused during maintenance. You can keep playing locally.",
            };
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
        let next,
          committed,
          presence,
          serverRollRequestKey = null,
          fallbackAccount = null;
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
            const numbers = plan.count
              ? await generateRollNumbers(plan.count)
              : [];
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
            const stop = Math.min(
              batch.index + OFFLINE_SETTLE_CHUNK,
              batch.numbers.length,
            );
            const pendingNumbers = batch.numbers.slice(batch.index, stop);
            if (!pendingNumbers.length)
              return { ok: true, offlineRemaining: 0 };
            const results = await restoreRolls(pendingNumbers);
            for (const result of results)
              if (next.offline.batch)
                next = settleOfflineRoll(next, result, now);
          } else if (action.type === "offline-dismiss")
            next = { ...previous, offline: { ...offline, report: null } };
          else throw new Error("That action is not available right now.");
          if (token !== generation.current)
            throw new Error(
              "Your game was restarted. This action was cancelled.",
            );
        } else if (action.type === "draw") {
          const security = gameSecurityRef.current;
          if (
            auth.cloudEnabled &&
            auth.userId &&
            !auth.localPlay &&
            ["pending", "restricted"].includes(security?.status)
          )
            throw new Error(
              security.message ||
                "Cloud rolls are paused for this account. Choose local play explicitly to continue.",
            );
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
            acknowledgeServerRoll();
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
          let timing = rollSettings(previous.owned);
          let flywheel = flywheelForDraw(previous);
          const armed = armedSkills(previous);
          const localPlan = drawPlanFor(armed);
          if (flywheel === "boost" || skillWaivesCooldown(armed))
            timing.cooldownMS = 0;

          let result,
            draws = null,
            picks = null,
            winnerSkill = null,
            winnerIndex = null,
            serverRoll = null,
            drawArmed = armed;
          // A device that already fell back to local play keeps playing locally
          // until the probe confirms Cloud can verify rolls again.
          const outageActive = Boolean(
            auth.userId &&
            (() => {
              const mark = outageForAccount(auth.userId, localStorage);
              return (
                mark &&
                (!mark.profileId || mark.profileId === previous.profile?.id)
              );
            })(),
          );
          const serverAuthoritative = Boolean(
            previous.profile &&
            auth.cloudEnabled &&
            auth.userId &&
            !auth.localPlay &&
            !outageActive,
          );
          if (serverAuthoritative) {
            try {
              serverRoll = await requestServerRoll(
                auth.userId,
                previous.profile.id,
                (security) => {
                  if (authRef.current.userId === auth.userId)
                    setGameSecurity(security);
                },
              );
            } catch (error) {
              const details = describeCloudVerificationFailure(error);
              if (details)
                console.warn(
                  `[RNGdle] Cloud roll verification unavailable: ${details.reference || details.code || "no reference"}; ${details.where}; reason ${details.reason || "unknown"}${details.hint ? `; ${details.hint}` : ""}.`,
                );
              if (!allowsLocalFallback(error)) throw error;
              serverRoll = null;
            }
            if (serverRoll) {
              serverRollRequestKey = serverRoll.requestKey;
              timing = { ...serverRoll.timing };
              flywheel = serverRoll.flywheel;
              drawArmed = serverRoll.armedSkills;
              let index = 0;
              const nextServerNumber = async () => {
                const number = serverRoll.numbers[index++];
                if (!Number.isSafeInteger(number))
                  throw new Error("The server roll response was incomplete.");
                return number;
              };
              if (!drawPlanFor(drawArmed))
                result = await restoreRoll(await nextServerNumber());
              else
                ({ draws, result, picks, winnerSkill, winnerIndex } =
                  await runDrawPicks(
                    drawPicksFor(drawArmed),
                    nextServerNumber,
                    restoreRoll,
                    { ordinary: true },
                  ));
            } else {
              // Same draws, odds, skills and timing as an ordinary local roll,
              // so the fallback cannot pay more than the Cloud path.
              if (!localPlan) result = await generateRoll();
              else
                ({ draws, result, picks, winnerSkill, winnerIndex } =
                  await runDrawPicks(
                    drawPicksFor(armed),
                    async () => (await generateRoll()).number,
                    restoreRoll,
                    { ordinary: true },
                  ));
            }
          } else if (!localPlan) result = await generateRoll();
          else
            ({ draws, result, picks, winnerSkill, winnerIndex } =
              await runDrawPicks(
                drawPicksFor(armed),
                async () => (await generateRoll()).number,
                restoreRoll,
                { ordinary: true },
              ));

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
          if (
            authRef.current.userId !== auth.userId ||
            authRef.current.localPlay !== auth.localPlay
          )
            throw new Error(
              "The signed-in account changed. The draw was cancelled.",
            );
          if (serverAuthoritative && !serverRoll)
            fallbackAccount = {
              userId: auth.userId,
              profileId: previous.profile?.id,
            };
          const firedPicks = new Set((picks ?? []).map((pick) => pick.skill));
          const fired = serverRoll
            ? serverRoll.firedSkills
            : armed.filter(
                (id) => !drawPicksFor([id]).length || firedPicks.has(id),
              );
          const pendingRoll = {
            id: serverRoll?.rollId ?? crypto.randomUUID(),
            number: result.number,
            startedAt: Math.ceil(gameNow()),
            ...timing,
            ...(fired.length ? { skills: fired } : {}),
            ...(draws ? { draws, drawLimit: SKILL_MAX_DRAWS } : {}),

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

          const result = await restoreRoll(pending.number);
          if (token !== generation.current)
            throw new Error("This game was reset. The roll was cancelled.");

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
            if (maintenance)
              return {
                ok: false,
                message:
                  "Creating an online profile is paused during maintenance. You can continue with local play.",
              };
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
            const packedSave = packDeviceSave(saved);
            writeDeviceSaveWithRecovery(
              localStorage,
              PROGRESS_KEY,
              saved,
              packedSave.packed,
            );
            writeVault(saved, {
              storage: localStorage,
              ownerId: localRegistration ? null : readCloudOwner(),
              packed: packedSave.packed,
            });
            if (serverRollRequestKey)
              acknowledgeServerRoll(serverRollRequestKey);
            if (localRegistration) {
              if (typeof previousCloudOwner === "string" && previousCloudOwner)
                clearCloudDirty(previousCloudOwner);
            } else markLocalCloudDirty();
            if (fallbackAccount) {
              acknowledgeServerRoll();
              beginOutage(fallbackAccount.userId, fallbackAccount.profileId);
            }
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
                                  : action.type === "claim-pass-mission"
                                    ? "Your pass mission could not be saved. No BPEP was claimed."
                                    : action.type === "claim-pass-reward"
                                      ? "Your pass reward could not be saved. No EP or reward was claimed."
                                      : action.type === "buy-pass-premium"
                                        ? "The premium track could not be saved. No EP was spent."
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
          ...(isErrorReference(error?.reference)
            ? { reference: error.reference }
            : {}),
          ...(action.type === "draw" &&
          Number.isSafeInteger(error?.retryAfterMs) &&
          error.retryAfterMs >= 0
            ? { retryAfterMs: error.retryAfterMs }
            : {}),
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
      writeDeviceSaveWithRecovery(localStorage, PROGRESS_KEY, copy.raw);
    } catch {
      writeCloudOwner(UNKNOWN_CLOUD_OWNER);
      return {
        ok: false,
        message:
          "The saved copy could not be restored. Free up space on this device and try again.",
      };
    }

    if (typeof owner.ownerId === "string" && owner.ownerId)
      writeCloudSyncMark(
        owner.ownerId,
        { profileId: restored.profile?.id ?? null, authoritative: true },
        localStorage,
      );

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
    gameSecurity,
    cloudOutageActive: Boolean(
      userId && outageForAccount(userId, localStorage),
    ),
    refreshGameSecurity,
    retryGameSecurity: () => setGameSecurityAttempt((attempt) => attempt + 1),
    dispatch,
    epoch,
    cloud,
    retryCloudLoad,
    resolveCloudConflict,
    setPublicProfileVisibility,
    vault,
  };
}
