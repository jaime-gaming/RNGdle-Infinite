import React from "react";
import { Sparkles } from "lucide-react";
import {
  BADGE_TOTAL,
  REBIRTH_VISIBLE_AT,
  discoveredCount,
} from "../rebirth.js";
import "../rebirth-nav.css";

// Rebirth in the top bar, styled apart from the ordinary page buttons: a ring
// that fills with collection progress and only reads as "ready" once every
// badge is found. Purchases are irrelevant to it by design.
export default function RebirthNav({ progress, active, onClick }) {
  const count = discoveredCount(progress);
  const ready = count >= BADGE_TOTAL;
  // Stay hidden until rebirth is a realistic prospect, like the panel does.
  if (count < REBIRTH_VISIBLE_AT) return null;
  const fraction = Math.min(1, count / BADGE_TOTAL);
  const percent = Math.round(fraction * 100);
  return (
    <button
      className={`rebirth-nav ${ready ? "is-ready" : ""} ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={
        ready
          ? "Rebirth, collection complete and ready"
          : `Rebirth, ${count} of ${BADGE_TOTAL} badges discovered`
      }
      title={
        ready
          ? "Collection complete — rebirth is available"
          : `${BADGE_TOTAL - count} badges left before rebirth`
      }
      onClick={onClick}
    >
      <span
        className="rebirth-ring"
        style={{ "--fill": `${percent}%` }}
        aria-hidden="true"
      >
        <Sparkles size={13} />
      </span>
      <span className="rebirth-nav-text">
        <span className="rebirth-nav-label">Rebirth</span>
        <span className="rebirth-nav-count">
          {ready ? "Ready" : `${count}/${BADGE_TOTAL}`}
        </span>
      </span>
    </button>
  );
}
