import { useEffect, useState } from "react";
import { rngweenCalendar } from "./rngween.js";
import { hourlyNeedsRefresh } from "./rngween-hourly.js";
import { seasonNow } from "./season-clock.js";

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
  const [, tick] = useState(0);
  const active = rngweenCalendar(now).hourlyPhase === "active";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  // The verified date while the board runs, so its seconds agree with every
  // other event timer; the render's own date is the fallback when the website
  // clock has not answered yet.
  return (active ? seasonNow() : null) ?? now;
}
