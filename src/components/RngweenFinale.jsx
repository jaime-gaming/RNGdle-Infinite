// CLEANUP Nov 4, 2026: delete with the rest of the event. Halloween night is
// one day long, and this is the only thing that says so.
import React, { useState } from "react";
import { Flame, Gift, PartyPopper, Timer } from "lucide-react";
import { RNGWEEN_FINALE_SKIN, rngweenCalendar } from "../rngween.js";
import { useLiveEventClock } from "../use-live-clock.js";
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
  // `now` is the date the page rendered with, renewed only every half minute.
  // The strip is a clock, so it ticks off the live verified date instead and
  // its seconds match every other event timer.
  const live = useLiveEventClock(now);
  const calendar = rngweenCalendar(live);
  const left = Number.isFinite(live) ? calendar.endsAt - live : 0;
  const multiplier = calendar.pumpkoinMultiplier;
  const [pending, setPending] = useState(false);
  if (!calendar.finaleActive || left <= 0) return null;
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
