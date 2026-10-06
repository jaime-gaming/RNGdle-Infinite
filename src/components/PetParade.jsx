import React from "react";
import { PETS, petById, petBonusLabel } from "../pets.js";
import PetIcon from "./PetIcon.jsx";
import { Sparkles } from "lucide-react";
import "../pet-parade.css";

// Companions live on the roll screen: the equipped one walks the stage while you
// roll, so a collection is something you see rather than a list you own, and a
// companion you just found walks in with its own moment. The layer is decorative
// and inert — it never sits between you and a click — and reduced motion lines
// it up as a still row with the same name plate.
const MAX_VISIBLE = 8;

function Walker({ pet, active, reducedMotion, phase, docked = false }) {
  const definition = petById.get(pet);
  if (!definition) return null;
  const seed = PETS.findIndex((entry) => entry.id === pet);
  const row = 34 + (seed % 5) * 9;
  return (
    <span
      className={`pet-walker ${active ? "is-active" : ""} ${docked ? "is-docked" : ""} phase-${phase}`}
      data-pet={pet}
      style={{
        "--row": `${row}%`,
        "--delay": `${-(seed % 7) * 3.1}s`,
        "--duration": `${26 + (seed % 5) * 5}s`,
        "--bob": `${3 + (seed % 4)}px`,
      }}
    >
      <span className="pet-walker-body">
        <PetIcon
          pet={pet}
          name={definition.name}
          multiplier={definition.multiplier}
          size={active ? 52 : 40}
          active={active}
        />
        <span className="pet-walker-trail" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      {active && !reducedMotion && (
        <span className="pet-nameplate">
          <strong>{definition.name}</strong>
          <span>{petBonusLabel(definition.multiplier)}</span>
        </span>
      )}
      <span className="pet-walker-ground" aria-hidden="true" />
    </span>
  );
}

function Arrival({ pet }) {
  const definition = petById.get(pet);
  if (!definition) return null;
  return (
    <div
      className="pet-arrival"
      data-arrival={pet}
      style={{ "--pet-accent": definition.accent }}
    >
      <span className="pet-arrival-rings" aria-hidden="true" />
      <span className="pet-arrival-cage" aria-hidden="true" />
      <PetIcon
        pet={pet}
        name={definition.name}
        multiplier={definition.multiplier}
        size={74}
        className="pet-arrival-figure"
      />
      <span className="pet-arrival-copy">
        <span className="pet-arrival-eyebrow">
          <Sparkles size={12} /> NEW COMPANION
        </span>
        <strong>{definition.name}</strong>
        <span>
          {petBonusLabel(definition.multiplier)} on every roll you bank
        </span>
      </span>
    </div>
  );
}

export default function PetParade({
  pets = [],
  active = "none",
  reducedMotion,
  arrival = null,
  phase = "idle",
  // True while the active companion's signature skill is firing on the roll
  // in flight: it leaves the stage (the number box carries its mark instead)
  // and resumes its walk untouched once the roll settles.
  docked = false,
}) {
  if (!pets.length && !arrival) return null;
  const ordered = [...pets].sort((a, b) =>
    a === active ? -1 : b === active ? 1 : 0,
  );
  const visible = ordered.slice(0, MAX_VISIBLE);
  return (
    <div
      className={`pet-parade ${reducedMotion ? "is-still" : ""}`}
      aria-hidden="true"
    >
      {visible.map((id) => (
        <Walker
          key={id}
          pet={id}
          active={id === active}
          reducedMotion={reducedMotion}
          phase={phase}
          docked={docked && id === active}
        />
      ))}
      {arrival && <Arrival pet={arrival} />}
    </div>
  );
}
