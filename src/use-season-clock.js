import { useEffect, useState } from "react";
import { gameNow } from "./game-clock.js";
import {
  invalidateSeasonClock,
  refreshSeasonClock,
  seasonNow,
} from "./season-clock.js";
import { rngweenCalendar } from "./rngween.js";

// Regular tasks retain their existing game clock. Halloween has a separate
// verified UTC calendar; neither one changes a saved presentation preference.
// CLEANUP Nov 4, 2026: remove seasonalNow, website verification and UTC boundary
// scheduling. Keep the regular now/gameNow ticks and task-midnight refresh.
// Until then the 60 s website check also runs outside the event window; it is
// one HEAD request and goes away with the rest of the seasonal code.
export function useSeasonClock() {
  const read = () => ({ now: gameNow(), seasonalNow: seasonNow() });
  const [clock, setClock] = useState(read);
  useEffect(() => {
    let alive = true;
    const refresh = () => alive && setClock(read());
    const verify = () => refreshSeasonClock().then(refresh);
    // A suspended tab may have a paused monotonic clock. On resume, stop
    // displaying/awarding seasonal powers until the website answers again.
    const resume = () => {
      invalidateSeasonClock();
      refresh();
      if (document.visibilityState !== "hidden") verify();
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
    // Tasks reset at 00:00 UTC, the same moment for every player.
    const midnight = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );
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
