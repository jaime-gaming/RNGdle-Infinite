import { gameNow } from "./game-clock.js";
import { useEffect, useState } from "react";
import { rngmasStatus, nextRngmasBoundary } from "./rngmas.js";

export function useRngmasStatus() {
  const [status, setStatus] = useState(() => rngmasStatus());
  useEffect(() => {
    const tick = () => setStatus(rngmasStatus());
    const next = nextRngmasBoundary(gameNow());
    const delay = status.over
      ? 60000
      : Math.max(1, Math.min(30000, next - gameNow()));
    const timer = setTimeout(tick, delay);
    window.addEventListener("focus", tick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", tick);
    };
  }, [status]);
  return status;
}
