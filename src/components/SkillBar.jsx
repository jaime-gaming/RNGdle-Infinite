import React, { useState } from "react";
import {
  Zap,
  PawPrint,
  Wind,
  Layers,
  Mountain,
  Gauge,
  Target,
} from "lucide-react";
import { skillById, skillEffectSummary, skillSourceLabel } from "../skills.js";
import { rackReport } from "../rack.js";
import { petById } from "../pets.js";
import { AutomationMark, CoreMark } from "./game-icons.jsx";
import "../skills.css";

export const SKILL_ICONS = {
  surge: Zap,
  trail: PawPrint,
  bounce: Wind,
  twice: Layers,
  bedrock: Mountain,
  turbo: Gauge,
  quarry: Target,
};

// A ring that fills with charge. No running commentary on the ring itself: the
// contribution is a small chip next to it, and the tooltip carries the whole
// explanation for anyone who wants the sentence.
function ChargeRing({ fraction, tint, size = 42, children }) {
  const radius = (size - 5) / 2,
    circumference = 2 * Math.PI * radius;
  return (
    <span
      className={`skill-ring tint-${tint}`}
      style={{ width: size, height: size }}
    >
      <svg
        className="skill-ring-svg"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          className="skill-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="skill-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset:
              circumference * (1 - Math.min(1, Math.max(0, fraction))),
          }}
        />
      </svg>
      <span className="skill-ring-icon">{children}</span>
    </span>
  );
}

const AUTO_ROLL_COPY = {
  off: "Off. Click to roll automatically at your current pace.",
  running: "On. Starts your next roll when it’s ready.",
  paused: "Paused while you browse. Your current roll will finish.",
};

// The rack that lives in the corner of the Roll page.
//
// Three kinds of circle share one column: charged skills (fill over online
// rolls, fire on the next one), Flywheel, and the Auto-Roll switch, which is
// simply an ability you click on or off. The column also carries the single
// indicator of what the rack adds up to — the totals the next roll will get,
// with every contribution named.
export default function SkillBar({
  progress,
  firing = [],
  phase = "idle",
  autoRoll = false,
  autoRollState = "off",
  onToggleAutoRoll,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  if (!progress) return null;
  const report = rackReport(progress);
  const equipped = report.equipped
    .map((entry) => ({ ...entry, definition: skillById.get(entry.id) }))
    .filter((entry) => entry.definition);
  const hasAutoRoll = (progress.owned ?? []).includes("auto-roll");
  if (!equipped.length && !report.flywheel.owned && !hasAutoRoll) return null;
  const firingSet = new Set(firing);
  const armedCount = report.armed.length;
  return (
    <div className={`skill-bar ${className}`} role="group" aria-label="Skills">
      {equipped.map((skill) => {
        const Icon = SKILL_ICONS[skill.icon] ?? Zap;
        const active = firingSet.has(skill.id);
        const petName = skill.definition.petId
          ? petById.get(skill.definition.petId)?.name
          : "";
        return (
          <div
            className={`skill-slot tint-${skill.tint} ${skill.armed ? "is-armed" : ""} ${active ? "is-firing" : ""}`}
            key={skill.id}
            data-skill={skill.id}
            data-armed={skill.armed}
            tabIndex={0}
            aria-label={`${skill.name}: ${skill.effect} ${skill.charge} of ${skill.charges} rolls charged. ${
              skill.armed ? "Ready — fires on your next roll." : "Charging."
            }`}
          >
            <ChargeRing
              fraction={skill.charge / skill.charges}
              tint={skill.tint}
            >
              <Icon size={17} aria-hidden="true" />
            </ChargeRing>
            {skill.armed && (
              <span className="skill-contribution" aria-hidden="true">
                {skill.chip}
              </span>
            )}
            <span className="skill-tooltip" role="tooltip">
              <strong>{skill.name}</strong>
              <span className="skill-tooltip-effect">
                {skillEffectSummary(skill.definition)}
              </span>
              <span className="skill-tooltip-contribution">
                Adds {skill.chip}
              </span>
              <span className="skill-tooltip-meta">
                {skill.charge} / {skill.charges} rolls ·{" "}
                {skillSourceLabel(skill.definition, petName)}
              </span>
              <span className="skill-tooltip-state">
                {active
                  ? "Firing on this roll"
                  : skill.armed
                    ? "Ready — fires on your next roll"
                    : "Charging"}
              </span>
            </span>
            <progress
              className="sr-only"
              aria-label={`${skill.name} charge`}
              value={skill.charge}
              max={skill.charges}
            />
          </div>
        );
      })}
      {report.flywheel.owned && (
        <div
          className={`skill-slot skill-flywheel ${report.flywheel.ready ? "is-armed" : ""} ${firingSet.has("flywheel") ? "is-firing" : ""}`}
          key="flywheel"
          data-skill="flywheel"
          tabIndex={0}
          aria-label={`Flywheel, ${report.flywheel.charge} of ${report.flywheel.required} rolls charged. ${
            report.flywheel.ready
              ? "The next roll has no cooldown; the full reveal still plays."
              : "Completed online rolls charge it. Offline rolls do not count."
          }`}
        >
          <ChargeRing
            fraction={
              report.flywheel.required
                ? report.flywheel.charge / report.flywheel.required
                : 0
            }
            tint="steel"
          >
            <CoreMark size={18} aria-hidden="true" />
          </ChargeRing>
          {report.flywheel.ready && (
            <span className="skill-contribution" aria-hidden="true">
              no cooldown
            </span>
          )}
          <span className="skill-tooltip" role="tooltip">
            <strong>Flywheel</strong>
            <span className="skill-tooltip-effect">
              {report.flywheel.ready
                ? "Next roll has no cooldown"
                : "Charge it to make a roll free"}
            </span>
            <span className="skill-tooltip-meta">
              {report.flywheel.charge} / {report.flywheel.required} online rolls
            </span>
            <span className="skill-tooltip-state">
              {report.flywheel.ready
                ? "Ready — fires on your next roll"
                : "Charging"}
            </span>
          </span>
          <progress
            className="sr-only"
            aria-label="Flywheel charge"
            value={report.flywheel.charge}
            max={report.flywheel.required}
          />
        </div>
      )}
      {/* Auto-Roll is an ability, not a settings toggle: one click arms it, the
          next click stands it down. It never skips a reveal or a cooldown. */}
      {hasAutoRoll && (
        <button
          type="button"
          role="switch"
          aria-checked={autoRoll}
          aria-label="Auto-Roll"
          className={`skill-slot skill-ability auto-roll-control tint-cyan is-${autoRollState}`}
          data-skill="auto-roll"
          onClick={onToggleAutoRoll}
        >
          <ChargeRing fraction={autoRoll ? 1 : 0} tint="cyan">
            <AutomationMark size={17} aria-hidden="true" />
          </ChargeRing>
          {autoRoll && (
            <span className="skill-contribution" aria-hidden="true">
              auto
            </span>
          )}
          <span className="skill-tooltip" role="tooltip">
            <strong>Auto-Roll</strong>
            <span className="skill-tooltip-effect">
              {AUTO_ROLL_COPY[autoRollState] ?? AUTO_ROLL_COPY.off}
            </span>
            <span className="skill-tooltip-meta">
              Click to {autoRoll ? "turn it off" : "turn it on"} · identical
              odds, reveal and cooldown
            </span>
            <span className="skill-tooltip-state">
              {autoRoll ? "Active" : "Standby"}
            </span>
          </span>
        </button>
      )}
      {/* One place states the total: every armed contribution, named. */}
      <button
        type="button"
        className={`skill-summary ${open ? "is-open" : ""} ${armedCount ? "is-armed" : ""}`}
        aria-expanded={open}
        aria-label={`Rack summary. ${armedCount} armed. Next roll: ${
          report.next.chips.join(", ") || "no charged effects"
        }.`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">Σ</span>
        {!!armedCount && (
          <span className="skill-summary-count" aria-hidden="true">
            {armedCount}
          </span>
        )}
        <span className="rack-panel" role="tooltip">
          <strong>Your rack, added up</strong>
          <span className="rack-panel-row">
            <span>Rack</span>
            <span>
              {report.used} / {report.slots} slots
              {report.flywheel.owned ? " · Flywheel" : ""}
              {hasAutoRoll ? " · Auto-Roll" : ""}
            </span>
          </span>
          {report.next.chips.length ? (
            <>
              <span className="rack-panel-label">Next roll gets</span>
              <span className="rack-chips">
                {report.next.chips.map((chip) => (
                  <span className="rack-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <span className="rack-panel-empty">
              Nothing charged right now. Rolling online fills these circles.
            </span>
          )}
          <span className="rack-panel-label">Banked EP multiplier</span>
          <span className="rack-panel-row">
            <span>Total</span>
            <strong>×{Number(report.next.walletMultiplier.toFixed(2))}</strong>
          </span>
          {report.next.walletParts.map((part) => (
            <span className="rack-panel-row is-part" key={part.id}>
              <span>{part.label}</span>
              <span>×{Number(part.value.toFixed(2))}</span>
            </span>
          ))}
          {!report.next.walletParts.length && (
            <span className="rack-panel-empty">
              A companion, a wallet skill or an ultra-rebirth bonus raises this.
            </span>
          )}
          <span className="rack-panel-label">Armed skills</span>
          {report.equipped.length ? (
            report.equipped.map((skill) => (
              <span className="rack-panel-row" key={skill.id}>
                <span>{skill.name}</span>
                <span>
                  {skill.chip} · {skill.charge}/{skill.charges}
                </span>
              </span>
            ))
          ) : (
            <span className="rack-panel-empty">No skills equipped.</span>
          )}
          {phase !== "idle" &&
            equipped.some((skill) => firingSet.has(skill.id)) && (
              <span className="rack-panel-firing">Firing on this roll</span>
            )}
        </span>
      </button>
    </div>
  );
}
