// One clock for every on-screen countdown that shows seconds. The page renders
// on `seasonalNow`, which is only renewed every half minute, so a timer that
// subtracts it looks frozen; and that date is null until the website answers.
// This hook ticks every second off the verified website date and, while there is
// none, advances the last date the render had with the monotonic game clock, so
// two countdowns on one screen always agree and neither ever stops.
// CLEANUP Nov 4, 2026: remove with the event countdowns that use it.
import { useEffect, useState } from "react";
import { gameNow } from "./game-clock.js";
import { seasonNow } from "./season-clock.js";

export function useLiveEventClock(
  fallbackNow,
  { animate = true, interval = 1000 } = {},
) {
  const [clock, setClock] = useState(() => seasonNow() ?? fallbackNow);
  useEffect(() => {
    const anchorGame = gameNow();
    const anchorFallback = Number.isFinite(fallbackNow) ? fallbackNow : null;
    const read = () =>
      seasonNow() ??
      (anchorFallback === null
        ? null
        : anchorFallback + (gameNow() - anchorGame));
    setClock(read());
    if (!animate) return;
    const timer = setInterval(() => setClock(read()), interval);
    return () => clearInterval(timer);
  }, [fallbackNow, animate, interval]);
  return clock;
}
