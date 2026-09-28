import React from "react";
import { Sparkles, Infinity as InfinityIcon } from "lucide-react";
import {
  BADGE_TOTAL,
  REBIRTH_TOTAL,
  discoveredCount,
  rebirthRequirement,
  rebirthUnlocked,
  ultraRebirthAvailable,
} from "../rebirth.js";
import { gameNow } from "../game-clock.js";
import "../rebirth-nav.css";

// Rebirth in the top bar, styled apart from the ordinary page buttons: a ring
// that fills towards the badges the next rung of the ladder asks for. It stays
// put after a rebirth empties the collection, so the ladder always has a
// visible next step.
export default function RebirthNav({ progress, active, onClick }) {
  const count = discoveredCount(progress);
  const rebirths = progress.rebirths ?? 0;
  const ultras = progress.ultraRebirths ?? 0;
  const requirement = rebirthRequirement(rebirths);
  // Nothing at all before the unlock: no icon, no ring, no hint that rebirth
  // exists. The ladder announces itself once the collection is far enough.
  if (!rebirthUnlocked(progress)) return null;
  const target = requirement ? requirement.badges : BADGE_TOTAL;
  const fraction = Math.min(1, count / Math.max(1, target));
  const percent = Math.round(fraction * 100);
  const ready = requirement
    ? count >= requirement.badges
    : ultraRebirthAvailable(progress, gameNow());
  const step = requirement ? requirement.rebirth : "Ultra";
  return (
    <button
      className={`rebirth-nav ${ready ? "is-ready" : ""} ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={
        ready
          ? `Rebirth, step ${step} ready`
          : `Rebirth, ${count} of ${target} badges towards step ${step}`
      }
      title={
        ready
          ? "Ready to rebirth"
          : `${target - count} badges left for step ${step} (${requirement ? `${requirement.percent}%` : "the full collection"})`
      }
      onClick={onClick}
    >
      <span
        className="rebirth-ring"
        style={{ "--fill": `${percent}%` }}
        aria-hidden="true"
      >
        {ultras > 0 ? <InfinityIcon size={13} /> : <Sparkles size={13} />}
      </span>
      <span className="rebirth-nav-text">
        <span className="rebirth-nav-label">Rebirth</span>
        <span className="rebirth-nav-count">
          {ready
            ? "Ready"
            : requirement
              ? `${count}/${target} · ${step}/${REBIRTH_TOTAL}`
              : `${count}/${target} · Ultra`}
          {ultras > 0 && !ready ? ` · U×${ultras}` : ""}
        </span>
      </span>
    </button>
  );
}
