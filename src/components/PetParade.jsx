import React from "react";
import { PETS, petById } from "../pets.js";
import Emoji from "./Emoji";
import "../pet-parade.css";

// Companions live on the roll screen: they wander across the stage while you
// roll, so a collection is something you see rather than a list you own. The
// layer is decorative and inert — it never sits between you and a click, and
// reduced motion lines them up in a still row instead.
const MAX_VISIBLE = 8;

export default function PetParade({
  pets = [],
  active = "none",
  reducedMotion,
}) {
  if (!pets.length) return null;
  const ordered = [...pets].sort((a, b) =>
    a === active ? -1 : b === active ? 1 : 0,
  );
  const visible = ordered.slice(0, MAX_VISIBLE);
  return (
    <div
      className={`pet-parade ${reducedMotion ? "is-still" : ""}`}
      aria-hidden="true"
    >
      {visible.map((id, index) => {
        const pet = petById.get(id);
        if (!pet) return null;
        const seed = PETS.findIndex((entry) => entry.id === id);
        const row = ((seed % 5) + 1) * 14;
        return (
          <span
            key={id}
            className={`pet-drift ${id === active ? "is-active" : ""}`}
            data-pet={id}
            style={{
              "--row": `${row}%`,
              "--delay": `${-(seed % 7) * 2.4}s`,
              "--duration": `${34 + (seed % 5) * 6}s`,
              "--bob": `${3 + (seed % 4)}px`,
            }}
          >
            <span className="pet-drift-body">
              <Emoji text={pet.emoji} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
