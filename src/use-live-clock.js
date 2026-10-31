// One clock for every on-screen countdown that shows seconds. The page renders
// on `seasonalNow`, which is only renewed every half minute, so a timer that
// subtracts it looks frozen; and that date is null until the website answers.
// This hook ticks every second off the verified website date and, while there is
// none, advances the last date the render had with the monotonic game clock, so
// two countdowns on one screen always agree and neither ever stops. A gated
// show can opt into verifiedOnly: it immediately hides the show and stops
// promising powers if the verified website clock is lost.
// CLEANUP Nov 4, 2026: remove with the event countdowns that use it.
import { useEffect, useState } from "react";
import { gameNow } from "./game-clock.js";
import { SEASON_CLOCK_CHANGED, seasonNow } from "./season-clock.js";

export function useLiveEventClock(
  fallbackNow,
  { animate = true, interval = 1000, verifiedOnly = false } = {},
) {
  // All UTC: seasonNow is verified UTC, fallbackNow is gameNow (monotonic UTC-epoch).
  // Use refs so the interval always sees the latest fallback, avoiding stale closure when fallback changes mid-reveal.
  const [clock, setClock] = useState(() =>
    verifiedOnly ? seasonNow() : (seasonNow() ?? fallbackNow),
  );
  useEffect(() => {
    const anchorGame = gameNow();
    // Snapshot fallback at effect start; if it changes, effect re-runs via deps and re-anchors.
    const anchorFallback = Number.isFinite(fallbackNow) ? fallbackNow : null;
    const read = () =>
      seasonNow() ??
      (verifiedOnly || anchorFallback === null
        ? null
        : anchorFallback + (gameNow() - anchorGame));
    const refresh = () => setClock(read());
    refresh();
    if (verifiedOnly) window.addEventListener(SEASON_CLOCK_CHANGED, refresh);
    const timer = animate ? setInterval(refresh, interval) : null;
    return () => {
      if (timer !== null) clearInterval(timer);
      if (verifiedOnly)
        window.removeEventListener(SEASON_CLOCK_CHANGED, refresh);
    };
  }, [fallbackNow, animate, interval, verifiedOnly]);
  return clock;
}
