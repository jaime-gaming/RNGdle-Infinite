import { gameNow } from "./game-clock";
import { useEffect, useRef, useState } from "react";
import {
  PROGRESS_KEY,
  emptyProgress,
  parseProgress,
  applyProgress,
  parsePending,
  recoverUnsavedRolls,
} from "./progress.js";
import { generateRoll, restoreRoll } from "./roll-client.js";
import { rollSettings } from "./shop-data.js";
export const GUEST_ROLL_KEY = "rng-infinite-guest-roll-v1";
function load() {
  try {
    const progress = parseProgress(localStorage.getItem(PROGRESS_KEY));
    if (!progress.profile) {
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
      }
    }
    return { progress, warning: "" };
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
    generation = useRef(0),
    queue = useRef(Promise.resolve());
  function reset(next = emptyProgress()) {
    generation.current++;
    setEpoch(generation.current);
    current.current = next;
    setProgress(next);
    healthy.current = true;
    setWarning("");
  }
  useEffect(() => {
    function synchronize(event) {
      if (event.key !== PROGRESS_KEY && event.key !== null) return;
      if (!current.current.profile) return;
      try {
        const next = parseProgress(localStorage.getItem(PROGRESS_KEY));
        if (next.profile?.id !== current.current.profile.id) reset(next);
        else {
          const merged = healthy.current
            ? next
            : recoverUnsavedRolls(next, current.current);
          current.current = merged;
          setProgress(merged);
          healthy.current = merged === next;
          if (healthy.current) setWarning("");
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
            if (stored.profile?.id !== previous.profile.id) {
              reset(stored);
              return {
                ok: false,
                message:
                  "The local account changed. The previous action was cancelled.",
              };
            }
            previous = healthy.current
              ? stored
              : recoverUnsavedRolls(stored, previous);
          } catch {
            readable = false;
            healthy.current = false;
          }
        }
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
        let next, committed;
        if (action.type === "draw") {
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
          const result = await generateRoll();
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
          };
          next = {
            ...previous,
            pendingRoll,
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
          next = applyProgress(previous, {
            ...action,
            result,
            cooldownUntil:
              pending.startedAt + pending.rollMS + pending.cooldownMS,
          });
        } else next = applyProgress(previous, action);
        if (next !== previous && next.profile) {
          try {
            if (!readable) throw new Error("Unreadable storage");
            if (previous.profile) {
              const latest = parseProgress(localStorage.getItem(PROGRESS_KEY));
              if (latest.profile?.id !== previous.profile.id) {
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
            setWarning("");
          } catch {
            healthy.current = false;
            setWarning(
              "Local saving is unavailable or full. New draws and purchases require saving. A committed result may be temporarily credited in this tab until saving works again; no saved history has been deleted.",
            );
            if (action.type !== "complete")
              return {
                ok: false,
                message:
                  action.type === "register"
                    ? "Sign-up could not be saved. Your guest progress is still available in this tab."
                    : action.type === "draw"
                      ? "The roll could not be committed. No number was revealed or EP awarded. Allow browser storage and retry."
                      : "Purchase or equipment change not saved. Your EP has not been spent.",
              };
          }
        }
        if (
          next !== previous &&
          !next.profile &&
          ["draw", "complete"].includes(action.type)
        ) {
          try {
            sessionStorage.setItem(
              GUEST_ROLL_KEY,
              JSON.stringify({
                pendingRoll: next.pendingRoll,
                cooldownUntil: next.cooldownUntil,
              }),
            );
          } catch {
            if (action.type === "draw")
              return {
                ok: false,
                message:
                  "Temporary roll storage is unavailable. No number was revealed. Allow browser storage to roll.",
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
        current.current = next;
        setProgress(next);
        return { ok: true, ...(committed ? { run: committed } : {}) };
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
