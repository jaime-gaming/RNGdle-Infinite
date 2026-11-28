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
              <path
                d="m28 35-10-9-4 13 14 10m44-14 10-9 4 13-14 10"
                fill="#92400e"
              />
              <path d="m31 57 27-1 2 8-31 1Z" fill="#fef3c7" stroke="#d97706" />
              <path d="M70 45v22m-9 0h18l3 22H58Zm2-1v-7h12v7" />
              <path d="m70 73 4 8-4 6-4-6Z" fill="currentColor" />
              <path d="m18 20 3-6 3 6 6 3-6 3-3 6-3-6-6-3Z" />
            </g>
          ) : skin === "parcel" ? (
            <g>
              <path
                d="m29 53-9 31 22-7 18 8 11-29Z"
                fill="#9f1239"
                stroke="#fda4af"
                strokeWidth="2"
              />
              <path d="m26 58 42-2-2 9-39 3Z" fill="currentColor" />
              <path d="m57 61 13 5-6 23-12-6Z" fill="currentColor" />
              <path
                d="m15 76 17-4 5 18-17 4Zm8-2 5 18m-11-10 18-4"
                stroke="#fbbf24"
                strokeWidth="2"
              />
            </g>
          ) : skin === "holly" ? (
            <g strokeWidth="2">
              <path
                d="m29 58 37-1-4 10-35-1Z"
                fill="#b91c1c"
                stroke="#fecaca"
              />
              <path d="m61 62 10 5-8 22-9-5Z" fill="#b91c1c" />
              <path
                d="m26 30 6-14 7 10 9-13 7 13 12-8 4 15"
                fill="#166534"
                stroke="#4ade80"
              />
              <circle cx="48" cy="27" r="4" fill="#ef4444" />
              <circle cx="56" cy="29" r="3" fill="#f87171" />
            </g>
          ) : skin === "snow" ? (
            <g strokeWidth="2">
              <path
                d="M27 29q2-22 23-22 20 0 23 22Z"
                fill="#1d4ed8"
                stroke="#bfdbfe"
              />
              <path d="M25 27h50v9H25Z" fill="#eff6ff" stroke="#93c5fd" />
              <circle cx="50" cy="7" r="6" fill="#eff6ff" />
              <path
                d="m24 53 11 7-5 13m46-20-11 7 5 13"
                fill="#eff6ff"
                stroke="#bfdbfe"
              />
              <path
                d="M51 62v17m-8-13 16 9m-16 0 16-9"
                stroke="#93c5fd"
                strokeWidth="3"
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
