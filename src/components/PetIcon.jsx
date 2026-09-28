import React from "react";
import { CreatureIcon } from "./game-icons.jsx";
import { petBonusLabel } from "../pets.js";
import "../pet-figure.css";

// A companion's face: the custom creature glyph inside a tinted token. The
// token steps through five grades with the wallet bonus, so the shelf reads at a
// glance and the stage keeps the same look the shop shows.
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
  return (
    <span
      className={`pet-figure grade-${grade} ${active ? "is-active" : ""} ${className}`}
      style={{ "--pet-size": `${size}px` }}
      aria-hidden="true"
      {...rest}
    >
      <span className="pet-figure-halo" />
      <CreatureIcon pet={pet} size={Math.round(size * 0.52)} />
      {name && (
        <span className="sr-only">{`${name} ${petBonusLabel(multiplier)}`}</span>
      )}
    </span>
  );
}
