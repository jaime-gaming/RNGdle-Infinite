// CLEANUP Nov 4, 2026: delete this file with the World.
import { useEffect, useRef, useState } from "react";
import { seasonNow } from "./season-clock.js";
import { worldState } from "./rngween-world-zones.js";

// Event-only maintenance; remove after RNGween closes on November 4, 2026 UTC.
// The pending number/deadline is already saved. Only settlement acquires the
// short writer lock: no tab holds a Web Lock throughout the reveal animation.
export function useRngweenWorldMaintenance(progress, now, onAction) {
  const pending = worldState(progress.rngweenLimited).pending;
  const actionRef = useRef(onAction);
  const [error, setError] = useState("");
  actionRef.current = onAction;
  useEffect(() => {
    if (
      !progress.profile ||
      !pending ||
      progress.rngweenLimited?.retired ||
      now === null
    )
      return;
    let cancelled = false;
    let timer;
    async function settle() {
      if (cancelled) return;
      const verified = seasonNow();
      if (verified === null) {
        timer = window.setTimeout(settle, 3000);
        return;
      }
      if (verified < pending.revealsAt) {
        timer = window.setTimeout(
          settle,
          Math.max(20, pending.revealsAt - verified + 20),
        );
        return;
      }
      const result = await actionRef.current({
        type: "rngween-world-reveal",
        id: pending.id,
      });
      if (cancelled) return;
      if (result.ok) setError("");
      else {
        setError(result.message || "World result not saved. Retrying…");
        timer = window.setTimeout(settle, 3000);
      }
    }
    timer = window.setTimeout(
      settle,
      Math.max(20, pending.revealsAt - (seasonNow() ?? now) + 20),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    progress.profile?.id,
    progress.rngweenLimited?.retired,
    pending?.id,
    pending?.revealsAt,
    now,
  ]);
  useEffect(() => {
    if (!pending) setError("");
  }, [pending?.id]);
  return error;
}
