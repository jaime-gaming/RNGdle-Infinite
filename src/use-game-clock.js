import { useEffect, useState } from "react";
import { gameNow } from "./game-clock.js";

// Refresh task affordances as ordinary game time passes. Daily and weekly
// tasks share the same UTC boundaries for every player.
export function useGameClock() {
  const [now, setNow] = useState(() => gameNow());

  useEffect(() => {
    let alive = true;
    const refresh = () => alive && setNow(gameNow());
    const resume = () => refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  useEffect(() => {
    const date = new Date(now);
    const midnight = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );
    const timer = setTimeout(
      () => setNow(gameNow()),
      Math.max(1, midnight - now),
    );
    return () => clearTimeout(timer);
  }, [now]);

  return now;
}
