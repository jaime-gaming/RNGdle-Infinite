import React from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { RNGWEEN_AURAS, rngweenState } from "../rngween.js";
import NumberBox from "./NumberBox.jsx";

// A themed preview is not equipped or awarded. The original mission owns
// collection, coin payment and its October 25–31 claim window.
export default function WorldAuraTrial({
  phase,
  progress,
  now,
  onTasks,
  onEquip,
  busy,
}) {
  const aura = RNGWEEN_AURAS.find((item) => item.id === phase.auraId);
  const trial = rngweenState(progress.tasks, now).missions.find(
    (item) => item.auraId === phase.auraId,
  );
  const owned = progress.owned.includes(aura.id);
  const equipped = progress.equipped === aura.id;
  return (
    <section
      className="world-phase-aura"
      data-phase-aura={aura.id}
      aria-label={`${aura.name} phase atmosphere`}
    >
      <div className="world-aura-preview">
        <NumberBox
          value={"6".repeat(phase.digits)}
          aura={aura.id}
          auraLayout="contained"
          tier="neutral"
          aria-label={`${aura.name} aura preview`}
        />
        <small>Atmosphere preview</small>
      </div>
      <div className="world-aura-trial-copy">
        <span className="world-eyebrow">
          <Sparkles size={13} />
          Phase 0{phase.phase} aura
        </span>
        <h3>
          {aura.name}
          {owned && (
            <span>
              <Check size={12} />
              Owned
            </span>
          )}
        </h3>
        <p>{aura.description}</p>
        <div className="world-aura-mission">
          <strong>{trial.title}</strong>
          <span>{trial.detail}</span>
          <small>
            {trial.count.toLocaleString("en-US")} /{" "}
            {trial.goal.toLocaleString("en-US")} · Oct 25–31 UTC
          </small>
        </div>
        <p className="world-aura-source-note">
          Earn this aura from its original mission in Tasks. World rolls do not
          count towards aura missions.
        </p>
        <div className="world-aura-actions">
          {owned && (
            <button
              className="secondary-button"
              disabled={busy || equipped}
              onClick={() => onEquip(aura.id)}
            >
              {equipped ? "Equipped" : `Equip ${aura.name}`}
            </button>
          )}
          <button className="secondary-button" onClick={onTasks}>
            View aura mission <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}
