import { gameNow } from "./game-clock";
import { useEffect, useRef, useState } from "react";
import {
  PROGRESS_KEY,
  GUEST_ROLL_KEY,
  PRE_REPAIR_BACKUP_KEY,
  emptyProgress,
  parseProgress,
  parseAndRepairProgress,
  applyProgress,
  parsePending,
  recoverUnsavedRolls,
} from "./progress.js";
import { generateRoll, restoreRoll } from "./roll-client.js";
import { runDrawPicks } from "./draw-plan.js";
import { clearAutoRoll } from "./auto-roll.js";
import { flywheelForDraw } from "./flywheel.js";
import {
  armedSkills,
  drawPicksFor,
  drawPlanFor,
  skillWaivesCooldown,
} from "./skills.js";
import { parseCooldownWindow } from "./cooldown.js";
import { rollSettings, offlineSettings, productById } from "./shop-data.js";
import { AURA_EVENT_MISSIONS } from "./tasks.js";
import {
  offlinePlan,
  readPresence,
  writePresence,
  clearPresence,
  OFFLINE_INTERVAL,
} from "./offline.js";
import { broadcastSync, SYNC_EVENT } from "./sync.js";
// Re-exported for the modules that grew up reading it from here.
export { GUEST_ROLL_KEY };
// A repaired save says what was fixed, briefly: the first three notes inline,
// the rest counted. The full list also goes to the console for support.
function repairWarning(repairs) {
  const shown = repairs.slice(0, 3).join(" ");
  const suffix =
    repairs.length > 3 ? ` Plus ${repairs.length - 3} more fixes.` : "";
  return `Your save was repaired — nothing was reset. ${shown}${suffix}`;
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
    if (repairs.length) {
      console.info("[RNGdle] save repaired:", repairs);
      try {
        // Heal the file itself, keeping the exact pre-repair bytes aside so
        // a bad repair can always be undone by hand.
        localStorage.setItem(PRE_REPAIR_BACKUP_KEY, stored);
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
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
export function useProgress() {
  const [initial] = useState(load),
    [progress, setProgress] = useState(initial.progress),
    [warning, setWarning] = useState(initial.warning),
    [epoch, setEpoch] = useState(0);
  const current = useRef(initial.progress),
    healthy = useRef(!initial.warning),
    // The rolls this tab settled while saving was failing, by id. Only these
    // are owed again when the save recovers (see recoverUnsavedRolls).
    unsaved = useRef(new Set()),
    generation = useRef(0),
    queue = useRef(Promise.resolve());
  function reset(next = emptyProgress()) {
    generation.current++;
    setEpoch(generation.current);
    current.current = next;
    setProgress(next);
    healthy.current = true;
    unsaved.current = new Set();
    setWarning("");
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
          next.rollbacks !== current.current.rollbacks
        )
          reset(next);
        else {
          const merged = healthy.current
            ? next
            : recoverUnsavedRolls(next, current.current, unsaved.current);
          current.current = merged;
          setProgress(merged);
          healthy.current = merged === next;
          if (healthy.current) {
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
  // A linked device sent a newer save. Same rules as the cross-tab path, plus
  // one step the storage event never needs: the winning state is written to
  // this device's own storage first, so the link survives a reload, and a
  // foreign account is adopted whole — that is exactly what a device link is.
  useEffect(() => {
    function receiveLinked(event) {
      try {
        const next = parseProgress(event.detail);
        if (!next.profile) return;
        try {
          localStorage.setItem(PROGRESS_KEY, event.detail);
          healthy.current = true;
          // The linked save replaces this tab's storage, unsaved rolls included.
          unsaved.current = new Set();
        } catch {
          healthy.current = false;
        }
        if (
          !current.current.profile ||
          current.current.profile.id !== next.profile.id ||
          current.current.rebirths !== next.rebirths ||
          current.current.ultraRebirths !== next.ultraRebirths ||
          current.current.rollbacks !== next.rollbacks
        ) {
          reset(next);
          return;
        }
        const merged = healthy.current
          ? next
          : recoverUnsavedRolls(next, current.current, unsaved.current);
        current.current = merged;
        setProgress(merged);
        healthy.current = merged === next;
        if (healthy.current) {
          unsaved.current = new Set();
          setWarning("");
        }
      } catch {
        healthy.current = false;
        setWarning(
          "A save from the linked device could not be read. This device is keeping its current progress.",
        );
      }
    }
    window.addEventListener(SYNC_EVENT, receiveLinked);
    return () => window.removeEventListener(SYNC_EVENT, receiveLinked);
  }, []);
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
              stored.rollbacks !== previous.rollbacks
            ) {
              reset(stored);
              return {
                ok: false,
                message:
                  "The account or rebirth cycle changed. The previous action was cancelled.",
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
        if (
          ["rebirth", "ultra-rebirth", "rollback"].includes(action.type) &&
          previous.profile &&
          (!readable || !navigator.locks?.request)
        )
          throw new Error(
            action.type === "rollback"
              ? "The Rollback requires working local storage and Web Locks support."
              : action.type === "ultra-rebirth"
                ? "Prestige requires working local storage and Web Locks support."
                : "Rebirth requires working local storage and Web Locks support.",
          );
        if (action.type === "delete") {
          if (!previous.profile || previous.profile.id !== action.profileId)
            return { ok: false, message: "This account is no longer active." };
          try {
            if (!readable) throw new Error("Unreadable storage");
            sessionStorage.removeItem(GUEST_ROLL_KEY);
            localStorage.removeItem(PROGRESS_KEY);
          } catch {
            return {
              ok: false,
              message:
                "Deletion failed. Your account and progress have not been removed. Allow browser storage and try again.",
            };
          }
          try {
            clearPresence(previous.profile.id);
          } catch {}
          clearAutoRoll(previous.profile.id);
          reset();
          return { ok: true };
        }
        if (action.type === "register") {
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
          eventRewards = [];
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
            let index = batch.index,
              ep = batch.ep,
              newBadges = batch.newBadges;
            const stop = Math.min(index + 10, batch.numbers.length);
            while (index < stop) {
              const result = await restoreRoll(batch.numbers[index]);
              const before = next;
              next = applyProgress(next, {
                type: "complete",
                id: `${batch.id}:${index}`,
                result,
                source: "offline",
                at:
                  batch.since +
                  (index + 1) * (batch.intervalMS ?? OFFLINE_INTERVAL),
                cooldownUntil: previous.cooldownUntil,
              });
              ep += next.balance - before.balance;
              newBadges += next.discovered.length - before.discovered.length;
              index++;
            }
            next = {
              ...next,
              pendingRoll: previous.pendingRoll,
              offline: {
                ...offline,
                batch:
                  index === batch.numbers.length
                    ? null
                    : { ...batch, index, ep, newBadges },
                report:
                  index === batch.numbers.length
                    ? {
                        id: batch.id,
                        at: now,
                        rolls:
                          (offline.report?.rolls ?? 0) + batch.numbers.length,
                        ep: (offline.report?.ep ?? 0) + ep,
                        newBadges: (offline.report?.newBadges ?? 0) + newBadges,
                      }
                    : offline.report,
              },
            };
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
          // Every circle that is full fires on this roll. The plan only says
          // how many ordinary draws to take and when to stop early; each draw
          // is still an independent, uniform crypto roll scored by the
          // verified index, and the number that is committed is one of them.
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
            picks = null;
          if (!plan) result = await generateRoll();
          else
            ({ draws, result, picks } = await runDrawPicks(
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
          const pendingRoll = {
            id: crypto.randomUUID(),
            number: result.number,
            startedAt: Math.ceil(gameNow()),
            ...timing,
            ...(armed.length ? { skills: armed } : {}),
            ...(draws ? { draws } : {}),
            // Which draw skill kept which number. The roll pays for every one
            // of them, so the settlement has to be able to name them again.
            ...(picks && picks.length ? { picks } : {}),
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
            if (pick.number === pending.number) continue;
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
        if (next !== previous) {
          const earnedBefore = new Set(previous.tasks?.event?.earned ?? []);
          const earnedAfter = new Set(next.tasks?.event?.earned ?? []);
          eventRewards = AURA_EVENT_MISSIONS.filter(
            (mission) =>
              !earnedBefore.has(mission.id) &&
              earnedAfter.has(mission.id) &&
              !(previous.owned ?? []).includes(mission.auraId) &&
              (next.owned ?? []).includes(mission.auraId),
          ).map((mission) => mission.auraId);
        }
        if (next !== previous && next.profile) {
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
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
            healthy.current = true;
            unsaved.current = new Set();
            setWarning("");
            // Live to the other device the moment this one saves.
            broadcastSync(next);
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
                if (event.type === "roll" && !known.has(event.id))
                  unsaved.current.add(event.id);
            }
            if (action.type !== "complete")
              return {
                ok: false,
                message:
                  action.type === "rebirth"
                    ? "Rebirth could not be saved. Your progress has not been reset."
                    : action.type === "ultra-rebirth"
                      ? "Prestige could not be saved. Your progress has not been reset."
                      : action.type === "rollback"
                        ? "The Rollback could not be saved. Your progress has not been reset."
                        : action.type.startsWith("offline-")
                          ? "Offline rewards could not be saved. Committed rolls are retained; allow storage and retry."
                          : action.type === "register"
                            ? "Sign-up could not be saved. Your guest progress is still available in this tab."
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
          ["draw", "complete", "rebirth", "ultra-rebirth", "rollback"].includes(
            action.type,
          )
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
        if (action.type === "register") {
          try {
            sessionStorage.removeItem(GUEST_ROLL_KEY);
          } catch {}
        }
        if (
          action.type === "rebirth" ||
          action.type === "ultra-rebirth" ||
          action.type === "rollback"
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
          ...(eventRewards.length ? { eventRewards } : {}),
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
  return { progress, warning, dispatch, epoch };
}
