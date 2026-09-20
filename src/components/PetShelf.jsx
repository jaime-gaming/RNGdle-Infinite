import React, { useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  PETS,
  petById,
  petBonusLabel,
  formatMultiplier,
  PET_DROP_CHANCE,
} from "../pets.js";
import { skillForPet, skillEffectSummary, skillSlots } from "../skills.js";
import { useFormatEP } from "../use-settings.jsx";
import Emoji from "./Emoji";
import "../pets.css";

// Companions: buy one, or be very lucky. Equipping is free and the bonus
// applies to banked EP only — never to the number, its tier or its score.
export default function PetShelf({ progress, onAction, notify }) {
  const formatEP = useFormatEP();
  const [pending, setPending] = useState("");
  const busy = useRef(false);
  const owned = progress.pets ?? [];
  const active = progress.activePet ?? "none";

  async function run(action, id, message) {
    if (busy.current) return;
    busy.current = true;
    setPending(id);
    try {
      const result = await onAction({ type: action, id });
      if (result.ok) notify?.(message);
      else notify?.(result.message);
    } finally {
      busy.current = false;
      setPending("");
    }
  }

  const oneIn = Math.round(1 / PET_DROP_CHANCE);
  const slots = skillSlots(progress.owned);
  const signature = PETS.map((pet) => skillForPet(pet.id)).filter(Boolean);
  return (
    <section
      className="shop-category pet-shelf"
      id="shop-companions"
      tabIndex={-1}
    >
      <div className="shop-section-heading">
        <div>
          <h2>Companions</h2>
          <p>
            A bonus to the EP you bank and one exclusive skill of their own. Buy
            one, or find one free at roughly 1 in {oneIn} rolls. Your rack holds{" "}
            {slots} {slots === 1 ? "skill" : "skills"}.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={active === "none" || !!pending}
          onClick={() => run("equip-pet", "none", "Companion put away.")}
        >
          {active === "none" ? (
            <>
              <Check size={14} /> None equipped
            </>
          ) : (
            "Put away companion"
          )}
        </button>
      </div>
      <p className="pet-disclaimer">
        A companion multiplies only the EP added to your wallet. Its signature
        skill is only available while that companion is the active one, and it
        still needs a free slot in your rack. Your rolled number, its tier, its
        badges and its score are completely unaffected, and your odds never
        change.
      </p>
      <ul className="pet-grid">
        {PETS.map((pet) => {
          const isOwned = owned.includes(pet.id);
          const isActive = active === pet.id;
          const affordable = progress.balance >= pet.price;
          return (
            <li
              key={pet.id}
              className={`pet-card ${isActive ? "is-active" : ""} ${
                isOwned ? "is-owned" : ""
              }`}
              data-pet={pet.id}
            >
              <span
                className={`pet-avatar ${isActive ? "is-active" : ""}`}
                aria-hidden="true"
              >
                <Emoji text={pet.emoji} />
              </span>
              <div className="pet-body">
                <div className="pet-title">
                  <strong>{pet.name}</strong>
                  <span className="pet-multiplier">
                    {formatMultiplier(pet.multiplier)}
                  </span>
                </div>
                <p className="pet-description">{pet.description}</p>
                {skillForPet(pet.id) && (
                  <p className="pet-skill">
                    <span className="pet-skill-name">
                      <Sparkles size={11} /> {skillForPet(pet.id).name}
                    </span>
                    {skillEffectSummary(skillForPet(pet.id))}
                  </p>
                )}
                <div className="pet-actions">
                  <span className="pet-bonus">
                    {petBonusLabel(pet.multiplier)}
                  </span>
                  {isOwned ? (
                    isActive ? (
                      <span className="pet-equipped">
                        <Check size={13} /> Equipped
                      </span>
                    ) : (
                      <button
                        className="pet-button"
                        disabled={!!pending}
                        onClick={() =>
                          run("equip-pet", pet.id, `${pet.name} equipped.`)
                        }
                      >
                        Equip
                      </button>
                    )
                  ) : (
                    <button
                      className="pet-button is-buy"
                      disabled={!affordable || !!pending}
                      onClick={() =>
                        run(
                          "buy-pet",
                          pet.id,
                          `${pet.name} joined you and is now equipped.`,
                        )
                      }
                    >
                      {affordable ? (
                        <>
                          <Sparkles size={13} /> {formatEP(pet.price)} EP
                        </>
                      ) : (
                        `${formatEP(pet.price)} EP`
                      )}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="pet-footnote">
        {owned.length} of {PETS.length} companions found, and {signature.length}{" "}
        signature skills between them. Swapping between the ones you own is
        always free.
      </p>
    </section>
  );
}

export { petById };
