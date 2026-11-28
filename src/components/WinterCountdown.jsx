import React, { useEffect, useState } from "react";
import { gameNow } from "../game-clock.js";

export function winterCountdownParts(until, now) {
  const seconds =
    Number.isFinite(until) && Number.isFinite(now)
      ? Math.max(0, Math.ceil((until - now) / 1000))
      : 0;
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}
// Only this small leaf ticks each second; the game and its boards do not.
export default function WinterCountdown({
  until,
  label = "Closes in",
  className = "",
}) {
  const [now, setNow] = useState(gameNow);
  const valid = Number.isFinite(until) && Math.abs(until) <= 8640000000000000;
  useEffect(() => {
    if (!valid) return undefined;
    const tick = () => setNow(gameNow());
    const timer =
      now < until
        ? setTimeout(tick, Math.max(1, Math.min(1000, until - now)))
        : null;
    window.addEventListener("focus", tick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", tick);
    };
  }, [now, until, valid]);
  const parts = winterCountdownParts(until, now);
  if (!valid)
    return (
      <span className={`winter-countdown ${className}`}>
        Schedule unavailable
      </span>
    );
  return (
    <span className={`winter-countdown ${className}`}>
      <span>{now >= until ? "Window ended" : label}</span>
      <time
        dateTime={new Date(until).toISOString()}
        aria-label={`${parts.days} days ${parts.hours} hours ${parts.minutes} minutes ${parts.seconds} seconds until ${new Date(until).toISOString()}`}
      >
        {Object.entries(parts).map(([key, value]) => (
          <span key={key}>
            <b>{String(value).padStart(2, "0")}</b>
            <small>
              {{ days: "d", hours: "h", minutes: "m", seconds: "s" }[key]}
            </small>
          </span>
        ))}
      </time>
    </span>
  );
}
