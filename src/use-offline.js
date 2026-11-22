import { useEffect, useRef, useState } from "react";
import { markPresenceHidden, writePresence } from "./offline.js";
import { watchTabActivity } from "./tab-activity.js";

export function useOffline(progress, dispatch, enabled = true) {
  const action = useRef(dispatch);
  action.current = dispatch;
  const runner = useRef(() => {});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const profileId = progress.profile?.id,
    owned = progress.owned.includes("offline-roller");
  useEffect(() => {
    if (!enabled || !profileId || !owned) {
      setBusy(false);
      setError("");
      return;
    }
    const tabId = crypto.randomUUID();
    let cancelled = false,
      running = false,
      again = false,
      checkNext = true,
      active = true;
    const presence = (visible) => {
      try {
        if (visible) writePresence(profileId, tabId, Date.now(), true);
        else markPresenceHidden(profileId, tabId);
      } catch {}
    };
    const sync = async (visible = true) => {
      if (cancelled) return;
      if (running) {
        if (visible) again = true;
        return;
      }
      running = true;
      if (visible) {
        setBusy(true);
        setError("");
      }
      try {
        let result = await action.current({
          type: "offline-sync",
          tabId,
          visible,
          checkAbsence: checkNext,
        });
        if (!result.ok) throw new Error(result.message);
        if (!visible) {
          checkNext = true;
          return;
        }
        checkNext = false;
        while (!cancelled && result.offlineRemaining > 0 && active) {
          result = await action.current({ type: "offline-settle" });
          if (!result.ok) throw new Error(result.message);

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
        if (!cancelled && visible) setError(e.message);
      } finally {
        running = false;
        if (!cancelled) {
          setBusy(false);
          if (again) {
            again = false;
            queueMicrotask(() => sync());
          }
        }
      }
    };
    const onLeave = () => {
      presence(false);
      sync(false);
    };
    const stop = watchTabActivity((isActive) => {
      if (isActive === active) return;
      active = isActive;
      presence(isActive);
      if (isActive) {
        checkNext = true;
        sync(true);
      } else sync(false);
    });
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    presence(active);
    if (active) {
      checkNext = true;
      sync(true);
    }
    const heartbeat = setInterval(() => {
      if (!active) return;
      presence(true);
      sync(true);
    }, 15000);
    runner.current = () => {
      if (active) {
        checkNext = true;
        sync(true);
      } else presence(false);
    };
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      stop();
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      presence(false);
    };
  }, [profileId, owned, enabled]);
  return { busy, error, retry: () => runner.current() };
}
