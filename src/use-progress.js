import { gameNow } from "./game-clock";
import { refreshSeasonClock, seasonNow } from "./season-clock.js";
import { useEffect, useRef, useState } from "react";
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
import { drawRngweenWorld } from "./rngween-world-client.js";
import {
  RNGWEEN_PET,
  RNGWEEN_TEMP_SKILL_IDS,
  requireRngweenWorld,
  requireRngweenValley,
  retireRngweenLimited,
} from "./rngween-limited.js";
import {
  requireWorldZone,
  worldState,
  worldRevealMS,
} from "./rngween-world-zones.js";
import { rngweenCalendar } from "./rngween.js";
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
  return `Your save was repaired — valid progress was kept. ${shown}${suffix}`;
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
          const recovered = healthy.current
            ? next
            : recoverUnsavedRolls(next, current.current, unsaved.current);
          const merged = preservePermanentCosmetics(current.current, recovered);
          let persisted = merged === next;
          if (merged !== next) {
            try {
              localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
              persisted = true;
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
            if (merged !== next) broadcastSync(merged);
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
        if (!next.profile) {
          event.preventDefault();
          return;
        }
        const previous = current.current;
        const sameCycle =
          previous.profile?.id === next.profile.id &&
          previous.rebirths === next.rebirths &&
          previous.ultraRebirths === next.ultraRebirths &&
          previous.rollbacks === next.rollbacks;
        // A link can arrive while this tab is holding a result that local
        // storage could not save. Merge that receipt into the linked head before
        // replacing this tab; otherwise a perfectly readable remote save would
        // erase the only copy of the credited roll.
        const recovered = sameCycle
          ? recoverUnsavedRolls(next, previous, unsaved.current)
          : next;
        const merged = preservePermanentCosmetics(previous, recovered);
        let persisted = false;
        try {
          // Persist the validated canonical save, not the unparsed wire bytes.
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
          event.progressSaved = true;
          persisted = true;
        } catch {
          healthy.current = false;
          setWarning(
            "A save from the linked device could not be saved. This tab is keeping its current progress.",
          );
          event.preventDefault();
          // No incoming World rewards or equipment become live without a
          // durable save. A subsequent link update can retry the same head.
          return;
        }
        if (!sameCycle) {
          reset(merged);
          return;
        }
        current.current = merged;
        setProgress(merged);
        healthy.current = persisted;
        if (persisted) {
          unsaved.current = new Set();
          setWarning("");
          // A recovered receipt is now durable locally, so publish the merged
          // head back to the link instead of leaving the other device behind.
          if (merged !== next) broadcastSync(merged);
        }
      } catch {
        event.preventDefault();
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
        // The writer stamps calendar eligibility itself. Never accept a device
        // date (or a linked client's supplied calendar timestamp) for RNGween.
        const limitedAction = [
          "exchange-pumpkoins",
          "buy-rngween-limited",
          "claim-rngween-coins",
          "claim-rngween-hourly",
          "refresh-rngween-hourly",
          "rngween-world-roll",
          "rngween-world-reveal",
          "buy-rngween-world",
          "forge-rngween-key",
          "retire-rngween-limited",
        ].includes(action.type);
        const limitedEquipment =
          (action.type === "equip-pet" && action.id === RNGWEEN_PET.id) ||
          (action.type === "equip-skill" &&
            RNGWEEN_TEMP_SKILL_IDS.includes(action.id));
        const limitedDraw =
          action.type === "draw" &&
          (current.current.activePet === RNGWEEN_PET.id ||
            (current.current.equippedSkills ?? []).some((id) =>
              RNGWEEN_TEMP_SKILL_IDS.includes(id),
            ));
        if (
          action.type === "claim-rngween-aura" ||
          (limitedAction && action.type !== "retire-rngween-limited") ||
          limitedEquipment ||
          limitedDraw
        ) {
          const verified = await refreshSeasonClock();
          if (token !== generation.current)
            throw new Error(
              "This game was reset. The previous action was cancelled.",
            );
          if (verified === null)
            throw new Error(
              "Connect to the website to verify RNGween availability.",
            );
        }
        const calendarTime = seasonNow();
        action.rngweenAt =
          calendarTime === null ? null : Math.floor(calendarTime);
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
        if ((limitedAction || limitedEquipment) && !navigator.locks?.request)
          throw new Error(
            "Limited purchases and world rolls require Web Locks support.",
          );
        if (
          limitedEquipment &&
          rngweenCalendar(action.rngweenAt).limitedPhase !== "active"
        )
          throw new Error(
            "This temporary item has expired or is not available yet.",
          );
        const actionHead = previous;
        previous = retireRngweenLimited(previous, action.rngweenAt);
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
              next = settleOfflineRoll(next, result, now, action.rngweenAt);
            }
          } else if (action.type === "offline-dismiss")
            next = { ...previous, offline: { ...offline, report: null } };
          else throw new Error("Unknown offline action");
          if (token !== generation.current)
            throw new Error(
              "This account was reset. Offline action cancelled.",
            );
        } else if (action.type === "rngween-world-roll") {
          if (!readable || !previous.profile)
            throw new Error("World rolls require a readable saved profile.");
          requireRngweenWorld(previous, action.rngweenAt);
          if (worldState(previous.rngweenLimited).pending) {
            // Every tab/device resumes the same committed result and deadline.
            // Never consume a second sample while an animation is in flight.
            next = previous;
          } else {
            const zone = requireWorldZone(action.zone ?? "valley");
            if (zone.id === "valley")
              requireRngweenValley(previous, action.rngweenAt);
            if (
              action.rngweenAt + worldRevealMS(previous.rngweenLimited) >=
              rngweenCalendar(action.rngweenAt).limitedEndsAt
            )
              throw new Error(
                "The World closes before this reveal can finish. No roll was started.",
              );
            const drawn = previous.rngweenLimited?.drawn ?? [];
            const number = await drawRngweenWorld(drawn, zone.id);
            if (token !== generation.current)
              throw new Error(
                "This account changed. The world roll was cancelled.",
              );
            const verified = seasonNow();
            action.rngweenAt = verified === null ? null : Math.floor(verified);
            // Only the writer supplies number, count, time and duration.
            next = applyProgress(previous, {
              ...action,
              zone: zone.id,
              number,
              expectedCount: drawn.length,
            });
          }
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
                          : action.type === "register"
                            ? "Sign-up could not be saved. Your guest progress is still available in this tab."
                            : action.type === "draw"
                              ? "The roll could not be committed. No number was revealed or EP awarded. Allow browser storage and retry."
                              : [
                                    "rngween-world-roll",
                                    "rngween-world-reveal",
                                  ].includes(action.type)
                                ? "World result not saved. Your run, fragments and number pool are unchanged. Allow storage and retry."
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
        if (action.type === "register") {
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
          ...((next.rngweenLimited?.hourly?.completed ?? 0) >
          (previous.rngweenLimited?.hourly?.completed ?? 0)
            ? {
                hourlyRewards: next.history
                  .slice(-4)
                  .filter(
                    (entry) =>
                      entry.type === "rngween-hourly" &&
                      !previous.history.some((old) => old.id === entry.id),
                  ),
              }
            : {}),
          ...(["rngween-world-roll", "rngween-world-reveal"].includes(
            action.type,
          )
            ? {
                worldPending: next.rngweenLimited?.world?.pending ?? null,
                worldNumber: next.rngweenLimited?.world?.last?.number ?? null,
                skinEarned: next.rngweenLimited?.skinEarned === true,
              }
            : {}),
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
