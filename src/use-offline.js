import { useEffect, useRef, useState } from "react";
export function useOffline(progress, dispatch) {
  const action = useRef(dispatch);
  action.current = dispatch;
  const runner = useRef(() => {});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const profileId = progress.profile?.id,
    owned = progress.owned.includes("offline-roller");
  useEffect(() => {
    if (!profileId || !owned) {
      setBusy(false);
      setError("");
      return;
    }
    const tabId = crypto.randomUUID();
    let cancelled = false,
      running = false,
      again = false,
      checkNext = true;
    async function sync() {
      if (cancelled) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      setBusy(true);
      setError("");
      try {
        let result = await action.current({
          type: "offline-sync",
          tabId,
          visible: document.visibilityState === "visible",
          checkAbsence: checkNext,
        });
        if (!result.ok) throw new Error(result.message);
        checkNext = false;
        while (
          !cancelled &&
          result.offlineRemaining > 0 &&
          document.visibilityState === "visible"
        ) {
          result = await action.current({ type: "offline-settle" });
          if (!result.ok) throw new Error(result.message);
          // Record presence only after persisted commitments are fully settled;
          // a reload interrupted during catch-up must not discard another absence.
          if (result.offlineRemaining === 0) {
            result = await action.current({
              type: "offline-sync",
              tabId,
              visible: true,
              checkAbsence: true,
            });
            if (!result.ok) throw new Error(result.message);
          }
        }
      } catch (e) {
        checkNext = true;
        if (!cancelled) setError(e.message);
      } finally {
        running = false;
        if (!cancelled) {
          setBusy(false);
          if (again) {
            again = false;
            queueMicrotask(sync);
          }
        }
      }
    }
    const returned = () => {
      checkNext = true;
      sync();
    };
    runner.current = returned;
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 15000);
    document.addEventListener("visibilitychange", returned);
    window.addEventListener("pagehide", returned);
    if (document.visibilityState === "visible") sync();
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", returned);
      window.removeEventListener("pagehide", returned);
    };
  }, [profileId, owned]);
  return { busy, error, retry: () => runner.current() };
}
