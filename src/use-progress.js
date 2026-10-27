import { gameNow } from "./game-clock";
import { useEffect, useRef, useState } from "react";
import {
  cacheLocalSaveForUser,
  clearCloudDirty,
  deleteCloudSave,
  markCloudDirty,
  readCachedSaveForUser,
  readCloudOwner,
  reconcileCloudSave,
  removeCachedSaveForUser,
  selectLocalSaveForCloudUser,
  writeCloudOwner,
  writeCloudSave,
} from "./cloud-save.js";
import { firebaseConfigured } from "./firebase.js";
import {
  clearCloudRecovery,
  clearVault,
  readCloudRecovery,
  readVault,
  writeVault,
} from "./save-vault.js";
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
// A repaired save says what was fixed, briefly: the first three notes inline,
// the rest counted. The full list also goes to the console for support.
function repairWarning(repairs) {
  const shown = repairs.slice(0, 3).join(" ");
  const suffix =
    repairs.length > 3 ? ` Plus ${repairs.length - 3} more fixes.` : "";
  return `Your save was repaired — valid progress was kept. ${shown}${suffix}`;
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
function writeLocalSave(progress) {
  try {
    const raw = JSON.stringify(progress);
    localStorage.setItem(PROGRESS_KEY, raw);
    writeVault(raw, { storage: localStorage });
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
    if (!repairs.length) writeVault(stored, { storage: localStorage });
    if (repairs.length) {
      console.info("[RNGdle] save repaired:", repairs);
      try {
        // Heal the file itself, keeping the exact pre-repair bytes aside so
        // a bad repair can always be undone by hand.
        localStorage.setItem(PRE_REPAIR_BACKUP_KEY, stored);
        const repairedRaw = JSON.stringify(progress);
        localStorage.setItem(PROGRESS_KEY, repairedRaw);
        writeVault(repairedRaw, { storage: localStorage });
      } catch {
        // Storage unwritable: the repaired save still runs in memory.
      }
    }
    return { progress, warning: repairs.length ? repairWarning(repairs) : "" };
  } catch {
    return {
      progress: emptyProgress(),
      warning:
        "Your saved progress could not be read. Progress is temporary until this browser allows saving.",
    };
  }
}
export function useProgress({
  userId = null,
  authReady = true,
  cloudEnabled = firebaseConfigured,
} = {}) {
  const [initial] = useState(load),
    [progress, setProgress] = useState(initial.progress),
    [warning, setWarning] = useState(initial.warning),
    [epoch, setEpoch] = useState(0),
    [cloudRetry, setCloudRetry] = useState(0);
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
    pendingCloudConflict = useRef(null);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const authRef = useRef({ userId, authReady, cloudEnabled });
  authRef.current = { userId, authReady, cloudEnabled };
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
    if (owner) markCloudDirty(owner);
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

    if (!writeLocalSave(selected)) {
      const error =
        "The cloud save was reconciled, but this browser could not keep a local copy. Allow browser storage before playing.";
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
        "This browser could not record which Firebase account owns its local save. Free browser storage before playing or switching accounts.";
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
      status: selected.profile ? "synced" : "empty",
      ready: true,
      userId: activeUserId,
      updatedAt: result.updatedAt ?? null,
      error: "",
      notice: result.notice ?? "",
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
              writeVault(mergedRaw, { storage: localStorage });
              persisted = true;
              markLocalCloudDirty();
            } catch {
              setWarning(
                "Saved progress could not be synchronized. This tab is keeping its current progress.",
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
          "Saved progress could not be synchronized. This tab is keeping its current progress.",
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

    cloudGate.current = { userId, ready: false };
    updateCloud({ status: "loading", ready: false, userId, error: "" });

    async function restoreCloudSave() {
      const localOwner = readCloudOwner();
      const localRaw = readLocalSave();
      let localProgress = current.current;
      let cachedProgress = null;
      let cacheWarning = "";

      if (localOwner && localOwner !== userId) {
        const rawToCache = localRaw || JSON.stringify(localProgress);
        if (!cacheLocalSaveForUser(localOwner, rawToCache)) {
          if (localRaw || localProgress.profile)
            throw new Error(
              "The previous account’s local save could not be preserved. Free browser storage and retry before switching accounts.",
            );
          cacheWarning =
            "This browser could not keep a local copy of the previous account.";
        }
        // A save marked for another auth user is never a first-sign-in import.
        // Only this account's own cached save may follow it across a switch.
        const cached = readCachedSaveForUser(userId);
        if (cached) {
          try {
            cachedProgress = parseStoredSave(cached).progress;
          } catch {
            cacheWarning = "A cached local save could not be read.";
          }
        }
      }

      localProgress = selectLocalSaveForCloudUser({
        userId,
        localOwner,
        localProgress,
        cachedProgress,
        emptyProgress: emptyProgress(),
      }).progress;

      const reconciliation = await reconcileCloudSave(userId, localProgress, {
        allowLocal: true,
        storage: localStorage,
      });
      if (!currentRequest()) return;

      if (reconciliation.choiceRequired) {
        showCloudConflict(reconciliation, userId, cacheWarning);
        return;
      }
      applyCloudReconciliation(reconciliation, userId, cacheWarning);
    }

    restoreCloudSave().catch((error) => {
      if (!currentRequest()) return;
      cloudGate.current = { userId, ready: false };
      updateCloud({
        status: "error",
        ready: false,
        userId,
        error:
          error?.message ||
          "The cloud save could not be loaded. Retry before changing progress.",
      });
    });

    return () => {
      active = false;
    };
  }, [userId, authReady, cloudEnabled, cloudRetry]);

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

    const version = ++cloudWriteVersion.current;
    const snapshot = progress;
    markCloudDirty(userId);
    const currentCloud = cloudRef.current;
    updateCloud({
      status: "saving",
      ready: true,
      userId,
      updatedAt: currentCloud.updatedAt ?? null,
      error: "",
      notice: currentCloud.notice ?? "",
    });

    const timer = setTimeout(() => {
      if (cloudGate.current.userId !== userId || !cloudGate.current.ready)
        return;
      const task = cloudQueue.current.then(() => {
        if (cloudGate.current.userId !== userId || !cloudGate.current.ready)
          return null;
        return reconcileCloudSave(userId, snapshot, { allowLocal: true });
      });
      cloudQueue.current = task.catch(() => {});
      task
        .then((result) => {
          if (
            !result ||
            cloudWriteVersion.current !== version ||
            authRef.current.userId !== userId
          )
            return;
          if (result.choiceRequired) {
            showCloudConflict(result, userId);
            return;
          }
          const cloudWon =
            result.winner === "cloud" &&
            result.progress?.profile &&
            JSON.stringify(result.progress) !== JSON.stringify(snapshot);
          if (cloudWon) {
            if (!writeLocalSave(result.progress)) {
              updateCloud({
                status: "error",
                ready: true,
                userId,
                updatedAt:
                  result.updatedAt ?? cloudRef.current.updatedAt ?? null,
                error:
                  "The cloud save was kept, but this browser could not update its local copy. Your previous local save is in Cloud conflict recovery.",
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
              "This browser could not record which Firebase account owns its local save. Free browser storage before switching accounts.";
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
            status: "synced",
            ready: true,
            userId,
            updatedAt: result.updatedAt ?? cloudRef.current.updatedAt ?? null,
            error: "",
            notice: result.notice || cloudRef.current.notice || "",
          });
        })
        .catch((error) => {
          if (
            cloudWriteVersion.current !== version ||
            authRef.current.userId !== userId
          )
            return;
          updateCloud({
            status: "error",
            ready: true,
            userId,
            updatedAt: cloudRef.current.updatedAt ?? null,
            error:
              error?.message ||
              "The cloud save could not be updated. Your local save is still safe.",
            notice: cloudRef.current.notice ?? "",
          });
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [progress, userId, authReady, cloudEnabled]);

  function retryCloudLoad() {
    if (cloudEnabled && authReady && userId)
      setCloudRetry((retry) => retry + 1);
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
          "The save choice expired. Reload the cloud comparison and try again.",
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
      const task = cloudQueue.current.then(() => {
        const latestLocal =
          readLocalCandidateForCloudUser(activeUserId).progress;
        return reconcileCloudSave(activeUserId, latestLocal, {
          allowLocal: true,
          storage: localStorage,
          decision,
          expectedCloudExists: pending.expectedCloudExists,
          expectedCloudSaveData: pending.expectedCloudSaveData,
          expectedLocalSource: pending.localCandidate,
        });
      });
      cloudQueue.current = task.catch(() => {});
      const result = await task;
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Review its cloud save before playing.",
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
    } catch (error) {
      if (authRef.current.userId !== activeUserId)
        return {
          ok: false,
          message:
            "The signed-in account changed. Review its cloud save before playing.",
        };
      const message =
        error?.message ||
        "The selected save could not be applied. Neither copy was discarded.";
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
        if (!auth.authReady)
          return {
            ok: false,
            message: "Checking your account before changing progress.",
          };
        if (
          auth.cloudEnabled &&
          auth.userId &&
          (!cloudGate.current.ready || cloudGate.current.userId !== auth.userId)
        )
          return {
            ok: false,
            message:
              cloudRef.current.error ||
              "Your cloud save is still loading. Retry before changing progress.",
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
                  "The account or reset cycle changed. The previous action was cancelled.",
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
              ? "A fresh start requires working local storage and Web Locks support."
              : action.type === "rollback"
                ? "The Rollback requires working local storage and Web Locks support."
                : action.type === "ultra-rebirth"
                  ? "Prestige requires working local storage and Web Locks support."
                  : "Rebirth requires working local storage and Web Locks support.",
          );
        if (action.type === "delete") {
          if (!previous.profile || previous.profile.id !== action.profileId)
            return { ok: false, message: "This profile is no longer active." };
          const cloudUser =
            authRef.current.cloudEnabled &&
            authRef.current.userId &&
            cloudGate.current.ready &&
            cloudGate.current.userId === authRef.current.userId
              ? authRef.current.userId
              : null;
          let cloudDeleted = false;
          try {
            if (!readable) throw new Error("Unreadable storage");
            if (cloudUser) {
              await deleteCloudSave(cloudUser);
              cloudDeleted = true;
            }
            sessionStorage.removeItem(GUEST_ROLL_KEY);
            localStorage.removeItem(PROGRESS_KEY);
            clearVault(localStorage);
            clearCloudRecovery(localStorage);
          } catch (error) {
            if (cloudDeleted && cloudUser)
              try {
                await writeCloudSave(cloudUser, previous);
              } catch {}
            return {
              ok: false,
              message: cloudUser
                ? `Progress could not be deleted everywhere: ${error?.message || "storage is unavailable"}. Your save has not been cleared.`
                : "Progress could not be deleted. Allow browser storage and try again.",
            };
          }
          if (cloudUser) {
            removeCachedSaveForUser(cloudUser);
            writeCloudOwner(cloudUser);
            clearCloudDirty(cloudUser);
            cloudGate.current = { userId: cloudUser, ready: true };
            updateCloud({
              status: "empty",
              ready: true,
              userId: cloudUser,
              error: "",
              notice:
                "The game save was deleted. Your sign-in remains available.",
            });
          }
          try {
            clearPresence(previous.profile.id);
          } catch {}
          clearAutoRoll(previous.profile.id);
          reset();
          return { ok: true };
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
              "Offline Roller requires a saved local profile and ownership.",
            );
          if (!readable || !navigator.locks?.request)
            throw new Error(
              "Offline rewards need writable storage and Web Locks support.",
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
          else throw new Error("Unknown offline action");
          if (token !== generation.current)
            throw new Error(
              "This account was reset. Offline action cancelled.",
            );
        } else if (action.type === "draw") {
          if (previous.offline?.batch)
            throw new Error(
              "Finish restoring offline rewards before starting another roll.",
            );
          if (previous.profile && !navigator.locks?.request)
            throw new Error(
              "This browser cannot safely coordinate account rolls. Use a browser with Web Locks support.",
            );
          if (!readable)
            throw new Error(
              "Your saved game cannot be read. No new roll was started.",
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
              "Your next roll is not ready yet. The cooldown is shared across account tabs.",
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
            throw new Error("The account changed. The draw was cancelled.");
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
            throw new Error("No matching committed roll. No EP was credited.");
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
            throw new Error("Offline Roller requires Web Locks support.");
          next = applyProgress(previous, action);
        }
        if (next !== actionHead && next.profile) {
          try {
            if (!readable) throw new Error("Unreadable storage");
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
                    "The account changed. The previous action was cancelled.",
                };
              }
            }
            const saved = JSON.stringify(next);
            localStorage.setItem(PROGRESS_KEY, saved);
            writeVault(saved, { storage: localStorage });
            if (action.type === "register" && !authRef.current.userId) {
              const previousCloudOwner = readCloudOwner();
              writeCloudOwner(null);
              if (previousCloudOwner) clearCloudDirty(previousCloudOwner);
            } else markLocalCloudDirty();
            healthy.current = true;
            unsaved.current = new Set();
            setWarning("");
          } catch {
            healthy.current = false;
            setWarning(
              "Local saving is unavailable or full. New draws and purchases require saving. A committed result may be temporarily credited in this tab until saving works again; no saved history has been deleted.",
            );
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
                    ? "Rebirth could not be saved. Your progress has not been reset."
                    : action.type === "ultra-rebirth"
                      ? "Prestige could not be saved. Your progress has not been reset."
                      : action.type === "rollback"
                        ? "The Rollback could not be saved. Your progress has not been reset."
                        : action.type.startsWith("offline-")
                          ? "Offline rewards could not be saved. Committed rolls are retained; allow storage and retry."
                          : ["register", "register-cloud"].includes(action.type)
                            ? "Sign-up could not be saved. Your current progress is still available in this tab."
                            : action.type === "draw"
                              ? "The roll could not be committed. No number was revealed or EP awarded. Allow browser storage and retry."
                              : action.type === "goal"
                                ? "Your goal could not be saved. Your previous goal and EP are unchanged."
                                : "Purchase or equipment change not saved. Your EP has not been spent.",
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
                    ? "Rebirth could not update session storage. Your progress has not been reset."
                    : "Temporary roll storage is unavailable. No number was revealed. Allow browser storage to roll.",
              };
            setWarning(
              "The temporary roll guard could not be updated. Keep this tab open until the cooldown finishes.",
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
        return { ok: false, message: error.message };
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
  const vault = {
    get: () => readVault(),
    getRecovery: () => readCloudRecovery(),
    restore: () => {
      const copy = readVault();
      if (!copy)
        return { ok: false, message: "There is no backup to restore yet." };
      try {
        localStorage.setItem(PROGRESS_KEY, copy.raw);
      } catch {
        return {
          ok: false,
          message:
            "The backup could not be written. Allow browser storage and try again.",
        };
      }
      const restored = parseAndRepairProgress(copy.raw).progress;
      reset(restored);
      return { ok: true, at: copy.at };
    },
    restoreRecovery: () => {
      const copy = readCloudRecovery();
      if (!copy)
        return {
          ok: false,
          message: "There is no displaced cloud/local save to restore yet.",
        };
      let restored;
      try {
        restored = parseAndRepairProgress(copy.raw).progress;
        localStorage.setItem(PROGRESS_KEY, copy.raw);
        writeVault(copy.raw, { storage: localStorage, minGapMs: 0 });
      } catch {
        return {
          ok: false,
          message:
            "The recovery copy could not be read or written. Allow browser storage and try again.",
        };
      }
      reset(restored);
      return { ok: true, at: copy.at, reason: copy.reason };
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
    vault,
  };
}
