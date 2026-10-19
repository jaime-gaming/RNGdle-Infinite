import React from "react";
import { PumpkinMark } from "./game-icons.jsx";
import { rngweenCalendar } from "../rngween.js";
import {
  countdownLabel,
  rngweenCountdownVisible,
} from "../rngween-countdown.js";
import "../rngween-limited.css";

// CLEANUP Oct 21, 2026: dead once the gate opens; remove with it on Nov 4.

export default function RngweenCountdown({ now, onChangelog }) {
  if (!rngweenCountdownVisible(now)) return null;
  const { limitedStartsAt } = rngweenCalendar(now);
  return (
    <aside className="rngween-countdown-line" aria-label="RNGween countdown">
      <div className="rngween-gate-inner">
        <span className="rngween-countdown-mark" aria-hidden="true">
          <PumpkinMark size={26} />
        </span>
        <div>
          <span className="rngween-limited-kicker">
            Coming soon · October 21, 00:00 UTC
          </span>
          <strong>
            RNGween starts in{" "}
            <span className="rngween-countdown-time">
              {countdownLabel(limitedStartsAt - now)}
            </span>
          </strong>
          <span>
            A Limited Shop, the Reaper's World and four Halloween auras. One
            time only.
          </span>
        </div>
        {onChangelog && (
          <button
            type="button"
            className="secondary-button"
            onClick={onChangelog}
          >
            What is coming
          </button>
        )}
      </div>
    </aside>
  );
}
