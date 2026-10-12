import { useEffect, useState } from "react";
import { gameNow } from "./game-clock.js";
import { refreshSeasonClock, seasonNow } from "./season-clock.js";
import { rngweenCalendar } from "./rngween.js";

// Regular tasks retain their existing game clock. Halloween has a separate
// verified UTC calendar; neither one changes a saved presentation preference.
// CLEANUP Nov 4, 2026: remove seasonalNow, website verification and UTC boundary
// scheduling. Keep the regular now/gameNow ticks and task-midnight refresh.
export function useSeasonClock() {
  const read = () => ({ now: gameNow(), seasonalNow: seasonNow() });
  const [clock, setClock] = useState(read);
  useEffect(() => {
    let alive = true;
    const refresh = () => alive && setClock(read());
    const verify = () => refreshSeasonClock().then(refresh);
    const resume = () => {
      refresh();
      verify();
    };
    verify();
    const ticks = setInterval(refresh, 30000);
    const checks = setInterval(verify, 60000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      clearInterval(ticks);
      clearInterval(checks);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  useEffect(() => {
    const date = new Date(clock.now);
    const midnight = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
    ).getTime();
    const calendar = rngweenCalendar(clock.seasonalNow);
    const delays = [midnight - clock.now];
    if (Number.isFinite(clock.seasonalNow))
      for (const boundary of [
        calendar.decoratesAt,
        calendar.limitedStartsAt,
        calendar.startsAt,
        calendar.endsAt,
        calendar.decorationsEndAt,
        calendar.limitedEndsAt,
      ])
        if (boundary > clock.seasonalNow)
          delays.push(boundary - clock.seasonalNow);
    const timer = setTimeout(
      () => setClock(read()),
      Math.max(1, Math.ceil(Math.min(...delays))),
    );
    return () => clearTimeout(timer);
  }, [clock]);
  return clock;
}
