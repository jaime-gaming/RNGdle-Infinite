import { winterCompanionSkin } from "../winter-companions.js";
import React from "react";
import { CreatureIcon } from "./game-icons.jsx";
import { petBonusLabel, petById } from "../pets.js";
import "../pet-figure.css";

function petGrade(multiplier) {
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
  prism = false,
  skin = "original",
  ...rest
}) {
  const grade = petGrade(multiplier);

  const variant = pet === "axolotl" && prism;
  const winter = winterCompanionSkin(pet, skin);
  const accent =
    winter?.accent ?? (variant ? "#c084fc" : petById.get(pet)?.accent);
  return (
    <span
      className={`pet-figure pet-species-${pet} grade-${grade} ${active ? "is-active" : ""} ${className}`}
      style={{
        "--pet-size": `${size}px`,
        ...(accent ? { "--pet-accent": accent } : {}),
      }}
      aria-hidden="true"
      data-winter-skin={winter?.skinId}
      {...rest}
    >
      <span className="pet-figure-halo" />
      <span className="pet-figure-orbit" aria-hidden="true" />
      <span className="pet-figure-spark" aria-hidden="true" />
      <CreatureIcon
        pet={variant ? "axolotl-prism" : pet}
        size={Math.round(size * 0.68)}
      />
      {winter && (
        <svg
          className="winter-pet-accessory"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          {skin === "lantern" ? (
            <g stroke="currentColor" strokeWidth="3">
              <path d="M70 45v22m-9 0h18l3 22H58Zm2-1v-7h12v7" />
              <path d="m70 73 4 8-4 6-4-6Z" fill="currentColor" />
              <path d="m18 20 3-6 3 6 6 3-6 3-3 6-3-6-6-3Z" />
            </g>
          ) : skin === "parcel" ? (
            <g>
              <path d="m26 58 42-2-2 9-39 3Z" fill="currentColor" />
              <path d="m57 61 13 5-6 23-12-6Z" fill="currentColor" />
              <path
                d="m15 76 17-4 5 18-17 4Zm8-2 5 18m-11-10 18-4"
                stroke="#fbbf24"
                strokeWidth="2"
              />
            </g>
          ) : (
            <g stroke="currentColor" strokeWidth="3">
              <path
                d="m29 29-3-16 13 9 11-15 11 15 13-9-3 16Z"
                fill="#083344"
              />
              <path d="m35 30 30 0M17 49l-8-4m74 4 8-4M50 12v13" />
            </g>
          )}
        </svg>
      )}
      {name && (
        <span className="sr-only">{`${name} ${petBonusLabel(multiplier)}`}</span>
      )}
    </span>
  );
}
