import { useEffect, useRef, useState } from "react";
import {
  PROGRESS_KEY,
  emptyProgress,
  parseProgress,
  applyProgress,
} from "./progress.js";
function load() {
  try {
    return {
      progress: parseProgress(localStorage.getItem(PROGRESS_KEY)),
      warning: "",
    };
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
          current.current = next;
          setProgress(next);
          healthy.current = true;
          setWarning("");
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
      at: input.at ?? Math.ceil(Date.now()),
      eventId: input.eventId ?? crypto.randomUUID(),
    };
    const execute = () => {
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
            if (healthy.current) previous = stored;
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
        const next = applyProgress(previous, action);
        if (next !== previous && next.profile) {
          try {
            if (!readable) throw new Error("Unreadable storage");
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
            healthy.current = true;
            setWarning("");
          } catch {
            healthy.current = false;
            setWarning(
              "Local saving is unavailable or full. New rolls and activity are temporary until saving works again. Purchases are paused; no saved history has been deleted.",
            );
            if (action.type !== "complete")
              return {
                ok: false,
                message:
                  action.type === "register"
                    ? "Sign-up could not be saved. Your guest progress is still available in this tab."
                    : "Purchase or equipment change not saved. Your EP has not been spent.",
              };
          }
        }
        current.current = next;
        setProgress(next);
        return { ok: true };
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
