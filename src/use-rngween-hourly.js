import { useEffect } from "react";
import { rngweenCalendar } from "./rngween.js";
import { hourlyNeedsRefresh } from "./rngween-hourly.js";
import { useLiveEventClock } from "./use-live-clock.js";

// CLEANUP Nov 4, 2026: remove the board timers. Never use the device's Date
// for assignment or expiry; timers only ask the saved-account writer to check.
export function useRngweenHourlyMaintenance(progress, now, onAction) {
  const board = progress.rngweenLimited?.hourly;
  const window = rngweenCalendar(now).hourlyWindow;
  useEffect(() => {
    if (!progress.profile || progress.rngweenLimited?.retired || !window)
      return;
    const refresh = () => onAction({ type: "refresh-rngween-hourly" });
    if (hourlyNeedsRefresh(progress, now)) {
      refresh();
      return;
    }
    const deadline = Math.min(
      ...board.slots.map((slot) => slot.expiresAt),
      rngweenCalendar(now).hourlyEndsAt,
    );
    const timer = setTimeout(refresh, Math.max(1, Math.ceil(deadline - now)));
    return () => clearTimeout(timer);
  }, [
    progress.profile?.id,
    progress.rngweenLimited?.retired,
    board,
    window,
    now,
    onAction,
  ]);
}
export function useHourlyDisplayClock(now) {
  // The board counts seconds, so it reads the same live event clock as the
  // Halloween strip: verified date first, and a ticking fallback if the
  // website has not answered yet, never a frozen half-minute render.
  const live = useLiveEventClock(now);
  const active = rngweenCalendar(live ?? now).hourlyPhase === "active";
  return active ? live : now;
}
