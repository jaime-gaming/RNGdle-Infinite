import React from "react";
import { Infinity as InfinityIcon, RefreshCw } from "lucide-react";
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

export default function RebirthNav({ progress, active, onClick }) {
  const ultras = progress.ultraRebirths ?? 0;
  const rollbacks = progress.rollbacks ?? 0;

  if (!rebirthUnlocked(progress)) return null;

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
