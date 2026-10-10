import React from "react";
import { Sparkles, Infinity as InfinityIcon, RefreshCw } from "lucide-react";
import {
  REBIRTH_TOTAL,
  rebirthProgress,
  rebirthUnlocked,
  rollbackAvailable,
  ultraRebirthAvailable,
} from "../rebirth.js";
import { formatEPCompact } from "../roll-data.js";
import { gameNow } from "../game-clock.js";
import "../rebirth-nav.css";

// Rebirth in the top bar, styled apart from the ordinary page buttons: a ring
// that fills with the same mixed percentage the Rebirth page shows (half the
// collection, half the cycle's EP). It stays put after a rebirth empties the
// collection, so the ladder always has a visible next step.
export default function RebirthNav({ progress, active, onClick }) {
  const ultras = progress.ultraRebirths ?? 0;
  const rollbacks = progress.rollbacks ?? 0;
  // Nothing at all before the unlock: no icon, no ring, no hint that rebirth
  // exists. The ladder announces itself once the collection is far enough.
  if (!rebirthUnlocked(progress)) return null;
  // The Rollback is the last stage: once it is taken the ladder is complete and
  // the ring stays full, with nothing left to reach.
  if (rollbacks > 0)
    return (
      <button
        className={`rebirth-nav ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        aria-label="Rebirth, the Rollback is taken: the ladder is complete"
        title="The Rollback is taken: the ladder is complete"
        onClick={onClick}
      >
        <span
          className="rebirth-ring"
          style={{ "--fill": "100%" }}
          aria-hidden="true"
        >
          <InfinityIcon size={13} />
        </span>
        <span className="rebirth-nav-text">
          <span className="rebirth-nav-label">Rebirth</span>
          <span className="rebirth-nav-count">Rollback</span>
        </span>
      </button>
    );
  const view = rebirthProgress(progress);
  const { step, count, earned, percent } = view;
  const target = step.badges;
  // The shorter bar names what the next step is waiting for.
  const short = view.badgeFraction <= view.epFraction ? "badges" : "EP";
  const now = gameNow();
  const ready =
    step.kind === "rung"
      ? count >= step.badges && earned >= step.ep
      : step.kind === "prestige"
        ? ultraRebirthAvailable(progress, now)
        : rollbackAvailable(progress, now);
  const rung =
    step.kind === "rung"
      ? step.rebirth
      : step.kind === "prestige"
        ? "Prestige"
        : "Rollback";
  const stepLabel =
    step.kind === "rung" ? `${rung}/${REBIRTH_TOTAL}` : `${rung}`;
  return (
    <button
      className={`rebirth-nav ${ready ? "is-ready" : ""} ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={
        ready
          ? `Rebirth, step ${rung} ready`
          : short === "badges"
            ? `Rebirth, ${count} of ${target} badges towards step ${rung}, ${percent}% overall`
            : `Rebirth, ${formatEPCompact(earned)} of ${formatEPCompact(step.ep)} EP towards step ${rung}, ${percent}% overall`
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
        {ultras > 0 ? <InfinityIcon size={13} /> : <RefreshCw size={13} />}
      </span>
      <span className="rebirth-nav-text">
        <span className="rebirth-nav-label">Rebirth</span>
        <span className="rebirth-nav-count">
          {ready
            ? "Ready"
            : short === "badges"
              ? `${count}/${target} · ${stepLabel}`
              : `${formatEPCompact(earned)}/${formatEPCompact(step.ep)} EP`}
          {ultras > 0 && !ready ? ` · U×${ultras}` : ""}
        </span>
      </span>
    </button>
  );
}
