import React, { useEffect, useRef } from "react";
import { gameNow } from "../game-clock.js";
import { cooldownFraction } from "../cooldown.js";
export default function CooldownFill({ window: window, reducedMotion }) {
  const ref = useRef(null),
    start = window?.startsAt,
    end = window?.endsAt;
  useEffect(() => {
    if (start == null || end <= start) return;
    const node = ref.current,
      duration = end - start;
    // Let the compositor interpolate, rather than rendering React or writing the
    // DOM every frame. Resynchronise against the authoritative local deadline.
    const animation = reducedMotion
      ? null
      : node.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration,
          fill: "both",
          easing: "linear",
        });
    let interval;
    const update = () => {
      const elapsed = gameNow() - start;
      node.style.transform = `scaleX(${cooldownFraction({ startsAt: start, endsAt: end }, gameNow())})`;
      if (animation) {
        animation.currentTime = Math.max(0, Math.min(duration, elapsed));
        if (elapsed < 0 || elapsed >= duration) animation.pause();
        else if (!document.hidden) animation.play();
      }
      if (elapsed >= duration) clearInterval(interval);
    };
    interval = setInterval(update, reducedMotion ? 1000 : 250);
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      animation?.cancel();
      document.removeEventListener("visibilitychange", update);
    };
  }, [start, end, reducedMotion]);
  if (start == null || end <= start) return null;
  return (
    <span
      className="cooldown-fill"
      ref={ref}
      aria-hidden="true"
      style={{ transform: `scaleX(${cooldownFraction(window, gameNow())})` }}
    />
  );
}
