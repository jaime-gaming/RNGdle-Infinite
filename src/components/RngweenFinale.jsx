// CLEANUP Nov 4, 2026: delete with the rest of the event. Halloween night is
// one day long, and this is the only thing that says so.
import React, { useEffect, useState } from "react";
import { Flame, Gift, PartyPopper, Timer } from "lucide-react";
import { RNGWEEN_FINALE_SKIN, rngweenCalendar } from "../rngween.js";
import { seasonNow } from "../season-clock.js";
import { PumpkinMark } from "./game-icons.jsx";
import "../rngween-finale.css";

function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

// The night of October 31 speaks for itself: a strip above the page that says
// what is double, how long is left, and how to keep the lantern.
export default function RngweenFinale({ progress, now, onAction, notify }) {
  const calendar = rngweenCalendar(now);
  // `now` is the verified date the page render started with, and it is only
  // renewed every half minute. The countdown reads the live clock on each tick
  // instead, so seconds move at the same pace as every other event timer.
  const [state, setState] = useState(() => ({
    left: Number.isFinite(now) ? calendar.endsAt - now : 0,
    live: calendar.finaleActive,
    multiplier: calendar.pumpkoinMultiplier,
  }));
  const { left, live, multiplier } = state;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const read = () => seasonNow() ?? now;
    const tick = () => {
      const at = read();
      const next = rngweenCalendar(at);
      setState({
        left: Number.isFinite(at) ? next.endsAt - at : 0,
        live: next.finaleActive,
        multiplier: next.pumpkoinMultiplier,
      });
    };
    tick();
    if (!rngweenCalendar(read()).finaleActive) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [now]);
  if (!live || left <= 0) return null;
  const limited = progress.rngweenLimited;
  const taken =
    limited?.finaleEarned === true ||
    progress.owned?.includes(RNGWEEN_FINALE_SKIN.id);
  const canClaim =
    !!progress.profile && !taken && (limited?.finaleCount ?? 0) > 0;

  async function claim() {
    setPending(true);
    const outcome = await onAction?.({ type: "claim-rngween-finale" });
    setPending(false);
    notify?.(
      outcome?.ok
        ? {
            kind: "milestone",
            title: `${RNGWEEN_FINALE_SKIN.name} is yours`,
            text: "Halloween night keepsakes never return. Wear it from the wardrobe.",
            icon: <PumpkinMark size={18} />,
          }
        : {
            kind: "error",
            text: outcome?.message ?? "The lantern could not be collected yet.",
          },
    );
  }

  return (
    <aside
      className={`rngween-finale${left < 3600000 ? " is-ending" : ""}`}
      aria-label="Halloween event"
      data-finale="rngween-2026"
    >
      <span className="rngween-finale-mark" aria-hidden="true">
        <PartyPopper size={16} />
      </span>
      <span className="rngween-finale-title">Halloween Event</span>
      <span className="rngween-finale-badge" data-finale-double>
        <PumpkinMark size={13} /> Pumpkoins ×{multiplier}
      </span>
      <span className="rngween-finale-clock" aria-label="Time left tonight">
        <Timer size={12} aria-hidden="true" /> {clock(left)}
      </span>
      {taken ? (
        <span className="rngween-finale-kept">
          <Flame size={13} aria-hidden="true" /> Lantern kept
        </span>
      ) : canClaim ? (
        <button
          type="button"
          className="rngween-finale-claim"
          disabled={pending}
          onClick={claim}
          aria-label={`Collect ${RNGWEEN_FINALE_SKIN.name}`}
        >
          <Gift size={13} aria-hidden="true" />
          {pending ? "Collecting…" : "Collect the lantern"}
        </button>
      ) : (
        <span className="rngween-finale-hint">
          Take part tonight for the {RNGWEEN_FINALE_SKIN.name}
        </span>
      )}
    </aside>
  );
}
