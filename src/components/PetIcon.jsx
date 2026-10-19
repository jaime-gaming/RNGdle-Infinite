// CLEANUP Nov 4, 2026: drop the `is-rngween-familiar` class below; the pumpkin
// familiar is removed from every save at retirement (`retireRngweenLimited`).
import React from "react";
import { useMotionPreference } from "../use-settings.jsx";
import { CreatureIcon } from "./game-icons.jsx";
import { petBonusLabel, petById } from "../pets.js";
import "../pet-figure.css";

// A companion's face: its own creature glyph inside a token tinted with its own
// colour. The token steps through five grades with the wallet bonus, so the shelf
// reads at a glance and the stage keeps the same look the shop shows.
export function petGrade(multiplier) {
  const bonus = multiplier - 1;
  if (bonus >= 0.7) return 5;
  if (bonus >= 0.5) return 4;
  if (bonus >= 0.35) return 3;
  if (bonus >= 0.2) return 2;
  return 1;
}

export default function PetIcon({
  pet,
  name = "",
  multiplier = 1,
  size = 42,
  active = false,
  className = "",
  ...rest
}) {
  const grade = petGrade(multiplier);
  const reduced = useMotionPreference();
  // The ring is the companion's own colour; the grade of its bonus stays in
  // the ink, so the shelf reads "who" at a glance and "how strong" up close.
  const accent = petById.get(pet)?.accent;
  return (
    <span
      className={`pet-figure grade-${grade} ${active ? "is-active" : ""} ${pet === "pumpkin-familiar" ? "is-rngween-familiar" : ""} ${reduced ? "is-reduced-motion" : ""} ${className}`}
      style={{
        "--pet-size": `${size}px`,
        ...(accent ? { "--pet-accent": accent } : {}),
      }}
      aria-hidden="true"
      {...rest}
    >
      <span className="pet-figure-halo" />
      {pet === "pumpkin-familiar" && (
        <span className="familiar-soul-orbit">
          <i />
          <i />
          <i />
        </span>
      )}
      <CreatureIcon pet={pet} size={Math.round(size * 0.52)} />
      {name && (
        <span className="sr-only">{`${name} ${petBonusLabel(multiplier)}`}</span>
      )}
    </span>
  );
}
