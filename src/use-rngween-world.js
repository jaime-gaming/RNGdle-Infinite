// CLEANUP Nov 4, 2026: delete this file with the World.
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSeasonClock, seasonNow } from "./season-clock.js";
import { rngweenCalendar } from "./rngween.js";
import { RNGWEEN_WORLD_MAX, rngweenWorldUnlocked } from "./rngween-limited.js";
import {
  WORLD_VALLEY_TARGET,
  rngweenValleyUnlocked,
  worldState,
} from "./rngween-world-zones.js";

// Persistent switch for background Valley chaining, scoped per account like Auto-Roll.
export const WORLD_KEEP_ROLLING_KEY = "rng-infinite-world-keep-rolling-v1";
const WORLD_KEEP_ROLLING_EVENT = "rngdle-world-keep-rolling-changed";
const scopedKey = (profileId) =>
  profileId ? `${WORLD_KEEP_ROLLING_KEY}:${profileId}` : null;

export function readWorldKeepRolling(profileId) {
  const key = scopedKey(profileId);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

export function writeWorldKeepRolling(profileId, enabled) {
  const key = scopedKey(profileId);
  if (!key) return false;
  try {
    if (enabled) localStorage.setItem(key, "on");
    else localStorage.removeItem(key);
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(WORLD_KEEP_ROLLING_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearWorldKeepRolling(profileId) {
  const key = scopedKey(profileId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(WORLD_KEEP_ROLLING_EVENT));
  } catch {}
}

export function useWorldKeepRolling(profileId) {
  const [enabled, setEnabled] = useState(() => readWorldKeepRolling(profileId));
  useEffect(() => {
    const sync = () => setEnabled(readWorldKeepRolling(profileId));
    sync();
    window.addEventListener(WORLD_KEEP_ROLLING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WORLD_KEEP_ROLLING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profileId]);
  const update = useCallback(
    (next) => {
      const value =
        typeof next === "function"
          ? Boolean(next(readWorldKeepRolling(profileId)))
          : Boolean(next);
      writeWorldKeepRolling(profileId, value);
      setEnabled(readWorldKeepRolling(profileId));
    },
    [profileId],
  );
  return [Boolean(profileId) && enabled, update];
}

// Browsers throttle main-thread timers heavily in hidden tabs after a few
// minutes. A tiny inline Worker wakes hidden tabs on time while keeping
// window.setTimeout attached so fake-clock tests remain deterministic.
let timerWorker = null;
let timerSeq = 0;
const timerCallbacks = new Map();

function ensureTimerWorker() {
  if (timerWorker !== null) return timerWorker || null;
  try {
    const blob = new Blob(
      [
        "const m=new Map();self.onmessage=({data:d})=>{if(d.cancel){clearTimeout(m.get(d.cancel));m.delete(d.cancel);return;}const t=setTimeout(()=>{m.delete(d.id);self.postMessage(d.id);},d.ms);m.set(d.id,t);};",
      ],
      { type: "text/javascript" },
    );
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data: id }) => {
      const fn = timerCallbacks.get(id);
      if (fn) {
        timerCallbacks.delete(id);
        fn();
      }
    };
    worker.onerror = () => {
      timerWorker = false;
      timerCallbacks.clear();
    };
    timerWorker = worker;
    return worker;
  } catch {
    timerWorker = false;
    return null;
  }
}

function setBackgroundTimeout(fn, ms, { allowWorker = true } = {}) {
  const delay = Math.max(0, Math.ceil(ms));
  let done = false;
  let workerId = 0;
  const fire = () => {
    if (done) return;
    done = true;
    window.clearTimeout(domTimer);
    if (workerId && timerWorker) {
      timerCallbacks.delete(workerId);
      try {
        timerWorker.postMessage({ cancel: workerId });
      } catch {}
    }
    fn();
  };
  const domTimer = window.setTimeout(fire, delay);
  if (
    allowWorker &&
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    const worker = ensureTimerWorker();
    if (worker) {
      workerId = ++timerSeq;
      timerCallbacks.set(workerId, fire);
      try {
        worker.postMessage({ id: workerId, ms: delay });
      } catch {
        timerCallbacks.delete(workerId);
        workerId = 0;
      }
    }
  }
  return () => {
    if (done) return;
    done = true;
    window.clearTimeout(domTimer);
    if (workerId && timerWorker) {
      timerCallbacks.delete(workerId);
      try {
        timerWorker.postMessage({ cancel: workerId });
      } catch {}
    }
  };
}

function latestValleyRoll(limited) {
  const world = worldState(limited);
  const miniLast = world.mini?.valley?.last ?? null;
  const globalLast = world.last?.zone === "valley" ? world.last : null;
  if (globalLast && (!miniLast || globalLast.serial >= miniLast.serial))
    return globalLast;
  return miniLast;
}

// Event-only maintenance; remove after RNGween closes on November 4, 2026 UTC.
// Settles committed World reveals and chains free Valley rolls in the
// background across tabs, hidden windows and non-World pages.
export function useRngweenWorldMaintenance(
  progress,
  now,
  onAction,
  callbacks = {},
) {
  const profileId = progress.profile?.id ?? null;
  const limited = progress.rngweenLimited;
  const pending = worldState(limited).pending;
  const drawnCount = limited?.drawn?.length ?? 0;
  const [keepRolling] = useWorldKeepRolling(profileId);
  const actionRef = useRef(onAction);
  const callbacksRef = useRef(callbacks);
  const [error, setError] = useState("");
  actionRef.current = onAction;
  callbacksRef.current = callbacks;

  const latestValley = latestValleyRoll(limited);
  const seenValleyRef = useRef({
    profileId,
    serial: latestValley?.serial ?? 0,
  });

  useEffect(() => {
    const serial = latestValley?.serial ?? 0;
    if (seenValleyRef.current.profileId !== profileId) {
      seenValleyRef.current = { profileId, serial };
      return;
    }
    if (serial > seenValleyRef.current.serial) {
      seenValleyRef.current.serial = serial;
      if (latestValley?.number === WORLD_VALLEY_TARGET) {
        if (profileId && readWorldKeepRolling(profileId))
          writeWorldKeepRolling(profileId, false);
        callbacksRef.current?.onHexboundFound?.();
      }
    }
  }, [profileId, latestValley?.serial, latestValley?.number]);

  const worldOpen = rngweenWorldUnlocked(progress.tasks, limited);
  const valleyOpen = rngweenValleyUnlocked(limited);
  const exhausted = drawnCount >= RNGWEEN_WORLD_MAX;
  const ended =
    Boolean(limited?.retired) ||
    (now !== null && rngweenCalendar(now).limitedPhase === "ended");

  useEffect(() => {
    if (!keepRolling || !profileId) return;
    if (ended || exhausted || !worldOpen || !valleyOpen)
      writeWorldKeepRolling(profileId, false);
  }, [keepRolling, profileId, ended, exhausted, worldOpen, valleyOpen]);

  useEffect(() => {
    if (!profileId || !pending || limited?.retired) return;
    let cancelled = false;
    let cancelTimer = () => {};
    let lastVerified = null;
    async function settle() {
      if (cancelled) return;
      const verified = seasonNow() ?? (await refreshSeasonClock());
      if (cancelled) return;
      if (verified === null) {
        cancelTimer = setBackgroundTimeout(settle, 3000);
        return;
      }
      if (verified < pending.revealsAt) {
        const progressed = lastVerified === null || verified > lastVerified;
        lastVerified = verified;
        cancelTimer = setBackgroundTimeout(
          settle,
          Math.max(20, pending.revealsAt - verified + 20),
          { allowWorker: progressed },
        );
        return;
      }
      const isTarget =
        pending.zone === "valley" && pending.number === WORLD_VALLEY_TARGET;
      if (isTarget && readWorldKeepRolling(profileId))
        writeWorldKeepRolling(profileId, false);
      const result = await actionRef.current({
        type: "rngween-world-reveal",
        id: pending.id,
      });
      if (cancelled) return;
      if (result.ok) setError("");
      else {
        setError(result.message || "World result not saved. Retrying…");
        cancelTimer = setBackgroundTimeout(settle, 3000);
      }
    }
    const currentClock = seasonNow() ?? (Number.isFinite(now) ? now : null);
    const initialDelay =
      currentClock === null
        ? 20
        : Math.max(20, pending.revealsAt - currentClock + 20);
    cancelTimer = setBackgroundTimeout(settle, initialDelay);
    return () => {
      cancelled = true;
      cancelTimer();
    };
  }, [profileId, limited?.retired, pending?.id, pending?.revealsAt, now]);

  useEffect(() => {
    if (
      !keepRolling ||
      !profileId ||
      pending ||
      ended ||
      exhausted ||
      !worldOpen ||
      !valleyOpen ||
      (now !== null && rngweenCalendar(now).limitedPhase !== "active")
    )
      return;
    let cancelled = false;
    let cancelTimer = () => {};
    async function startNext() {
      if (cancelled || !readWorldKeepRolling(profileId)) return;
      const result = await actionRef.current({
        type: "rngween-world-keep-rolling",
        zone: "valley",
      });
      if (cancelled) return;
      if (result?.ok) {
        setError("");
        return;
      }
      const message = result?.message || "";
      if (message.includes("Connect to the website")) {
        setError(message);
        cancelTimer = setBackgroundTimeout(startNext, 3000);
        return;
      }
      if (
        message.includes("pool changed") ||
        message.includes("rebirth cycle changed") ||
        message.includes("previous action was cancelled")
      ) {
        cancelTimer = setBackgroundTimeout(startNext, 200);
        return;
      }
      writeWorldKeepRolling(profileId, false);
      if (message) setError(message);
      callbacksRef.current?.onChainStopped?.(message);
    }
    cancelTimer = setBackgroundTimeout(startNext, 40);
    return () => {
      cancelled = true;
      cancelTimer();
    };
  }, [
    keepRolling,
    profileId,
    pending?.id,
    ended,
    exhausted,
    worldOpen,
    valleyOpen,
    drawnCount,
    now,
  ]);

  useEffect(() => {
    if (!pending && !keepRolling) setError("");
  }, [pending?.id, keepRolling]);

  return error;
}
