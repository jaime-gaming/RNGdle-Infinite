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
  const [initial] = useState(load);
  const [progress, setProgress] = useState(initial.progress);
  const [warning, setWarning] = useState(initial.warning);
  const current = useRef(initial.progress),
    healthy = useRef(!initial.warning),
    queue = useRef(Promise.resolve());
  useEffect(() => {
    function synchronize(event) {
      if (event.key !== PROGRESS_KEY && event.key !== null) return;
      // A different tab signing up must not discard or auto-save this guest's game.
      if (!current.current.profile) return;
      try {
        const next = parseProgress(localStorage.getItem(PROGRESS_KEY));
        current.current = next;
        setProgress(next);
        healthy.current = true;
        setWarning("");
      } catch {
        setWarning(
          "Saved progress could not be synchronized. This tab is keeping its current progress.",
        );
        healthy.current = false;
      }
    }
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);
  function dispatch(action) {
    const execute = () => {
      try {
        let previous = current.current;
        // Re-read inside the cross-tab lock; never charge a stale balance.
        if (healthy.current && previous.profile) {
          try {
            previous = parseProgress(localStorage.getItem(PROGRESS_KEY));
          } catch {
            healthy.current = false;
          }
        }
        if (action.type === "register") {
          // Do not overwrite a profile created by another tab while signing up.
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
          } catch {}
        }
        const next = applyProgress(previous, action);
        if (next !== previous && next.profile) {
          try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
            healthy.current = true;
            setWarning("");
          } catch {
            healthy.current = false;
            setWarning(
              "Local saving is unavailable. Rolls continue temporarily, but purchases require saving to work.",
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
    // Web Locks serializes writes across tabs. The queue also prevents multiple
    // rapid actions in this tab from spending or crediting the same EP twice.
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
  return { progress, warning, dispatch };
}
