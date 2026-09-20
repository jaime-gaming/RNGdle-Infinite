import React from "react";
import {
  Zap,
  PawPrint,
  Wind,
  Layers,
  Mountain,
  Gauge,
  Target,
  Cog,
} from "lucide-react";
import {
  skillById,
  skillEffectSummary,
  skillSourceLabel,
  skillChargeOf,
} from "../skills.js";
import { flywheelRequired } from "../flywheel.js";
import { petById } from "../pets.js";
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

// A ring that fills with charge. No numbers, no copy: the tooltip carries the
// whole explanation, and screen readers get the same text from aria-label.
function ChargeRing({ fraction, tint, size = 42, children }) {
  const radius = (size - 5) / 2,
    circumference = 2 * Math.PI * radius;
  return (
    <span
      className={`skill-ring tint-${tint}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
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

export default function SkillBar({ progress, firing = [], className = "" }) {
  if (!progress) return null;
  const required = flywheelRequired(progress.owned);
  const flywheelCharge = progress.flywheelCharge ?? 0;
  const flywheelOwned = progress.owned.includes("flywheel");
  const equipped = (progress.equippedSkills ?? [])
    .map((id) => skillById.get(id))
    .filter(Boolean);
  const rack = flywheelOwned ? [...equipped, "flywheel"] : equipped;
  if (!rack.length) return null;
  const firingSet = new Set(firing);
  return (
    <div className={`skill-bar ${className}`} role="group" aria-label="Skills">
      {rack.map((skill) => {
        if (skill === "flywheel") {
          const ready = flywheelCharge >= required;
          const active = firingSet.has("flywheel");
          const label = `Flywheel, ${flywheelCharge} of ${required} rolls charged. ${
            ready
              ? "The next roll has no cooldown; the full reveal still plays."
              : "Completed online rolls charge it. Offline rolls do not count."
          }`;
          return (
            <div
              className={`skill-slot skill-flywheel ${ready ? "is-armed" : ""} ${active ? "is-firing" : ""}`}
              key="flywheel"
              data-skill="flywheel"
              tabIndex={0}
              aria-label={label}
            >
              <ChargeRing
                fraction={required ? flywheelCharge / required : 0}
                tint="steel"
              >
                <Cog size={18} aria-hidden="true" />
              </ChargeRing>
              <span className="skill-tooltip" role="tooltip">
                <strong>Flywheel</strong>
                <span className="skill-tooltip-effect">
                  {ready
                    ? "Next roll has no cooldown"
                    : "Charge it to make a roll free"}
                </span>
                <span className="skill-tooltip-meta">
                  {flywheelCharge} / {required} online rolls
                </span>
                <span className="skill-tooltip-state">
                  {ready ? "Ready — fires on your next roll" : "Charging"}
                </span>
              </span>
              <progress
                className="sr-only"
                aria-label="Flywheel charge"
                value={flywheelCharge}
                max={required}
              />
            </div>
          );
        }
        const Icon = SKILL_ICONS[skill.icon] ?? Zap;
        const charge = skillChargeOf(progress, skill.id);
        const armed = charge >= skill.charges;
        const active = firingSet.has(skill.id);
        const petName = skill.petId ? petById.get(skill.petId)?.name : "";
        return (
          <div
            className={`skill-slot tint-${skill.tint} ${armed ? "is-armed" : ""} ${active ? "is-firing" : ""}`}
            key={skill.id}
            data-skill={skill.id}
            tabIndex={0}
            aria-label={`${skill.name}: ${skillEffectSummary(skill)}. ${charge} of ${skill.charges} rolls charged. ${
              armed ? "Ready — fires on your next roll." : "Charging."
            }`}
          >
            <ChargeRing fraction={charge / skill.charges} tint={skill.tint}>
              <Icon size={17} aria-hidden="true" />
            </ChargeRing>
            <span className="skill-tooltip" role="tooltip">
              <strong>{skill.name}</strong>
              <span className="skill-tooltip-effect">
                {skillEffectSummary(skill)}
              </span>
              <span className="skill-tooltip-meta">
                {charge} / {skill.charges} rolls ·{" "}
                {skillSourceLabel(skill, petName)}
              </span>
              <span className="skill-tooltip-state">
                {active
                  ? "Firing on this roll"
                  : armed
                    ? "Ready — fires on your next roll"
                    : "Charging"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
