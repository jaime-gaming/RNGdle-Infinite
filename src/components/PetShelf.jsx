import React, { useRef, useState } from "react";
import { Check, Coins, Sparkles } from "lucide-react";
import {
  PETS,
  petById,
  petBonusLabel,
  formatMultiplier,
  PET_DROP_CHANCE,
} from "../pets.js";
import { skillForPet, skillEffectSummary, skillSlots } from "../skills.js";
import { useFormatEP } from "../use-settings.jsx";
import PetIcon from "./PetIcon.jsx";
import { CompanionMark } from "./game-icons.jsx";
import "../pets.css";

// Companions: buy one, or be very lucky. Equipping is free and the bonus
// applies to banked EP only — never to the number, its tier or its score.
// Rows rather than a wall of cards: thirteen companions, one line each.
export default function PetShelf({
  progress,
  onAction,
  notify,
  query = "",
  filter = "all",
}) {
  const formatEP = useFormatEP();
  const [pending, setPending] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
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
  const text = query.trim().toLowerCase();
  const visible = PETS.filter((pet) => {
    const isOwned = owned.includes(pet.id);
    if (onlyMine && !isOwned) return false;
    if (filter === "owned" && !isOwned) return false;
    if (filter === "available" && isOwned) return false;
    if (filter === "affordable" && (isOwned || progress.balance < pet.price))
      return false;
    if (!text) return true;
    return `${pet.name} ${pet.description} ${skillForPet(pet.id)?.name ?? ""}`
      .toLowerCase()
      .includes(text);
  });
  return (
    <section
      className="shop-category pet-shelf"
      id="shop-companions"
      tabIndex={-1}
    >
      <div className="shop-section-heading">
        <div>
          <h2>
            <CompanionMark size={16} /> Companions
          </h2>
          <p>
            A bonus to the EP you bank and one exclusive skill of their own.
            Only one companion is equipped at a time, and the equipped one walks
            the roll screen with you; swapping is free. Find one free at roughly
            1 in {oneIn} rolls, and each signature skill takes a slot in your{" "}
            {slots}-slot rack.
          </p>
        </div>
        <div className="shop-section-actions">
          <span className="shop-section-stat">
            {owned.length} of {PETS.length} found
          </span>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={onlyMine}
            onClick={() => setOnlyMine((value) => !value)}
          >
            {onlyMine ? "Show all" : "Only mine"}
          </button>
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
      </div>
      <p className="pet-disclaimer">
        A companion multiplies only the EP added to your wallet. Your rolled
        number, its tier, its badges, its score and your odds are completely
        unaffected.
      </p>
      {visible.length ? (
        <ul className="pet-grid">
          {visible.map((pet) => {
            const isOwned = owned.includes(pet.id);
            const isActive = active === pet.id;
            const affordable = progress.balance >= pet.price;
            const signature = skillForPet(pet.id);
            return (
              <li
                key={pet.id}
                className={`pet-card ${isActive ? "is-active" : ""} ${
                  isOwned ? "is-owned" : ""
                }`}
                data-pet={pet.id}
              >
                <PetIcon
                  pet={pet.id}
                  name={pet.name}
                  multiplier={pet.multiplier}
                  size={46}
                  active={isActive}
                />
                <div className="pet-body">
                  <div className="pet-title">
                    <strong>{pet.name}</strong>
                    <span className="pet-multiplier">
                      {petBonusLabel(pet.multiplier)}
                      <small>{formatMultiplier(pet.multiplier)}</small>
                    </span>
                  </div>
                  <p className="pet-description">{pet.description}</p>
                  {signature && (
                    <p className="pet-skill">
                      <span className="pet-skill-name">
                        <Sparkles size={11} /> {signature.name}
                      </span>
                      {skillEffectSummary(signature)}
                    </p>
                  )}
                </div>
                <div className="pet-actions">
                  {isOwned ? (
                    isActive ? (
                      <span className="pet-equipped">
                        <Check size={13} /> Walking with you
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
                      <Coins size={13} /> {formatEP(pet.price)} EP
                    </button>
                  )}
                  <small className="pet-note">
                    {isOwned
                      ? isActive
                        ? "Its signature skill is available in your rack."
                        : "Free to equip; charge is never lost."
                      : affordable
                        ? "Within reach of your wallet."
                        : `${formatEP(pet.price - progress.balance)} more EP needed`}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="shop-empty">No companions match this filter.</p>
      )}
      <p className="pet-footnote">
        Companions are found, not won: a lucky roll drops one you do not own
        yet, and a first companion is worn automatically.
      </p>
    </section>
  );
}

export { petById };
