import React from "react";
import { Sparkles, Infinity as InfinityIcon } from "lucide-react";
import {
  REBIRTH_TOTAL,
  cycleEarnedEp,
  discoveredCount,
  rebirthRequirement,
  rebirthUnlocked,
  ultraRebirthAvailable,
  ultraRebirthRequirement,
} from "../rebirth.js";
import { formatEPCompact } from "../roll-data.js";
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
  // A step asks for badges and for EP the cycle has earned; the ring follows
  // whichever of the two is furthest from done, so it always shows the real
  // distance to the next rung.
  const requirement = rebirthRequirement(rebirths);
  // Nothing at all before the unlock: no icon, no ring, no hint that rebirth
  // exists. The ladder announces itself once the collection is far enough.
  if (!rebirthUnlocked(progress)) return null;
  const step = requirement ?? ultraRebirthRequirement();
  const target = step.badges;
  const earned = cycleEarnedEp(progress);
  const badgeFraction = Math.min(1, count / Math.max(1, target));
  const epFraction = Math.min(1, earned / Math.max(1, step.ep));
  const short = badgeFraction <= epFraction ? "badges" : "EP";
  const fraction = Math.min(badgeFraction, epFraction);
  const percent = Math.round(fraction * 100);
  const ready = requirement
    ? count >= requirement.badges && earned >= requirement.ep
    : ultraRebirthAvailable(progress, gameNow());
  const rung = requirement ? requirement.rebirth : "Ultra";
  return (
    <button
      className={`rebirth-nav ${ready ? "is-ready" : ""} ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={
        ready
          ? `Rebirth, step ${rung} ready`
          : short === "badges"
            ? `Rebirth, ${count} of ${target} badges towards step ${rung}`
            : `Rebirth, ${formatEPCompact(earned)} of ${formatEPCompact(step.ep)} EP towards step ${rung}`
      }
      title={
        ready
          ? "Ready to rebirth"
          : short === "badges"
            ? `${target - count} badges left for step ${rung} (${step.percent}%)`
            : `${formatEPCompact(step.ep - earned)} EP left for step ${rung}`
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
              ? short === "badges"
                ? `${count}/${target} · ${rung}/${REBIRTH_TOTAL}`
                : `${formatEPCompact(earned)}/${formatEPCompact(step.ep)} EP`
              : short === "badges"
                ? `${count}/${target} · Ultra`
                : `${formatEPCompact(earned)}/${formatEPCompact(step.ep)} EP`}
          {ultras > 0 && !ready ? ` · U×${ultras}` : ""}
        </span>
      </span>
    </button>
  );
}
