import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Coins, Target } from "lucide-react";
import {
  PETS,
  petById,
  petBonusLabel,
  formatMultiplier,
  PET_DROP_CHANCE,
} from "../pets.js";
import { skillForPet, skillEffectSummary } from "../skills.js";
import { validGoal } from "../gameplay-loop.js";
import { saleCompanionPrice, saleDiscountForId } from "../black-friday.js";
import { useSaleStatus } from "../use-black-friday.js";
import { useFormatEP } from "../use-settings.jsx";
import PetIcon from "./PetIcon.jsx";
import { CompanionMark, SkillIcon } from "./game-icons.jsx";
import "../pets.css";

export default function PetShelf({
  progress,
  onAction,
  notify,

  focus = null,

  pickingGoal = false,
  onPickingGoal = () => {},
}) {
  const formatEP = useFormatEP();

  const sale = useSaleStatus();
  const priceOf = (pet) => saleCompanionPrice(pet, sale.now);
  const [pending, setPending] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [index, setIndex] = useState(0);
  const [uncaged, setUncaged] = useState(null);
  const busy = useRef(false);
  const uncageTimer = useRef(null);
  const slideshow = useRef(null);
  const owned = (progress.pets ?? []).filter((id) =>
    PETS.some((pet) => pet.id === id),
  );
  const active = progress.activePet ?? "none";

  const tracked = validGoal(progress.goalId, progress.owned, owned)
    ? progress.goalId
    : null;
  useEffect(() => () => clearTimeout(uncageTimer.current), []);

  useEffect(() => {
    const at = PETS.findIndex((pet) => pet.id === focus);
    if (at < 0) return;

    setOnlyMine(false);
    setIndex(at);
    const frame = requestAnimationFrame(() => {
      slideshow.current?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  async function run(action, id, message) {
    if (busy.current) return false;
    busy.current = true;
    setPending(id ?? action);
    try {
      const result = await onAction({ type: action, id });
      if (result.ok) {
        notify?.({ kind: "done", text: message });

        if ((action === "equip-pet" || action === "buy-pet") && id !== "none") {
          setUncaged(id);
          clearTimeout(uncageTimer.current);
          uncageTimer.current = setTimeout(() => setUncaged(null), 1400);
        }
      } else notify?.({ kind: "error", text: result.message });
      return result.ok;
    } finally {
      busy.current = false;
      setPending("");
    }
  }

  async function setGoal(pet) {
    const done = await run(
      "goal",
      pet ? pet.id : null,
      pet
        ? `Goal updated: ${pet.name}. No EP spent.`
        : "Goal cleared. The shop recommends the next step.",
    );
    if (done) onPickingGoal(false);
  }

  const oneIn = Math.round(1 / PET_DROP_CHANCE);
  const visible = PETS.filter((pet) => {
    if (onlyMine && !owned.includes(pet.id)) return false;
    return true;
  });

  const at = visible.length ? Math.min(index, visible.length - 1) : 0;
  const slide = (delta) =>
    setIndex((at + delta + visible.length) % visible.length);

  function slideKeys(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      slide(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      slide(1);
    }
  }

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
            Only one is equipped at a time, free to swap, and it walks the roll
            screen with you. Each carries a banked-EP bonus and its own skill —
            or find one free at roughly 1 in {oneIn} rolls.
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
        Wallet-only: never your odds, number or score.
      </p>
      {visible.length ? (
        <div
          className="pet-slideshow"
          ref={slideshow}
          onKeyDown={slideKeys}
          style={{ "--pet-count": visible.length }}
        >
          <button
            type="button"
            className="pet-arrow"
            aria-label={`Previous companion, ${
              visible[(at - 1 + visible.length) % visible.length].name
            }`}
            onClick={() => slide(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div
            className="pet-stage"
            role="group"
            aria-roledescription="slideshow"
            aria-label={`Companion ${at + 1} of ${visible.length}`}
          >
            <div className="pet-stage-track" style={{ "--pet-at": at }}>
              {visible.map((pet, i) => {
                const isOwned = owned.includes(pet.id);
                const isActive = active === pet.id;
                const isGoal = tracked === pet.id;
                const price = priceOf(pet);
                const discount = sale.active ? saleDiscountForId(pet.id) : 0;
                const affordable = progress.balance >= price;
                const signature = skillForPet(pet.id);
                const current = i === at;

                const pickable = pickingGoal && !isOwned;
                return (
                  <article
                    key={pet.id}
                    data-pet={pet.id}
                    data-goal={isGoal || undefined}
                    className={`pet-slide ${current ? "is-current" : ""} ${
                      isActive ? "is-active" : ""
                    } ${isOwned ? "is-owned" : ""} ${
                      uncaged === pet.id ? "is-uncaging" : ""
                    } ${pickable ? "is-pickable" : ""}`}
                    style={{ "--pet-accent": pet.accent }}
                    aria-hidden={current ? undefined : "true"}
                    inert={current ? undefined : true}
                    onClick={(event) => {
                      if (!pickable) return;
                      if (event.target.closest("button, a, input, select"))
                        return;
                      setGoal(isGoal ? null : pet);
                    }}
                  >
                    <div className="pet-cage">
                      <span className="pet-cage-hanger" aria-hidden="true" />
                      <PetIcon
                        pet={pet.id}
                        name={pet.name}
                        multiplier={pet.multiplier}
                        size={124}
                        active={isActive}
                      />
                      <span className="pet-cage-door" aria-hidden="true" />
                      <span className="pet-cage-tray" aria-hidden="true" />
                      <span className="pet-cage-label">
                        {isActive
                          ? "walking with you"
                          : isOwned
                            ? "in your collection"
                            : isGoal
                              ? "your goal"
                              : "in the wild"}
                      </span>
                      {pickable && (
                        <span className="pet-pick" aria-hidden="true">
                          <Target size={15} />
                        </span>
                      )}
                    </div>
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
                            <SkillIcon icon={signature.icon} size={12} />{" "}
                            {signature.name}
                          </span>
                          {skillEffectSummary(signature)}
                        </p>
                      )}
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
                                run(
                                  "equip-pet",
                                  pet.id,
                                  `${pet.name} equipped.`,
                                )
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
                            <Coins size={13} /> {formatEP(price)} EP
                          </button>
                        )}
                        {discount > 0 && !isOwned && (
                          <span className="sale-tag" aria-hidden="true">
                            −{Math.round(discount * 100)}%
                          </span>
                        )}
                        {!isOwned && isGoal && (
                          <>
                            <span className="pet-goal-tag">
                              <Target size={13} /> Your goal
                            </span>
                            <button
                              className="pet-button"
                              disabled={!!pending}
                              onClick={() => setGoal(null)}
                            >
                              Clear
                            </button>
                          </>
                        )}
                        <small className="pet-note">
                          {isOwned
                            ? isActive
                              ? "Its signature skill is available in your rack."
                              : "Free to equip; charge is never lost."
                            : affordable
                              ? "Within reach of your wallet."
                              : `${formatEP(price - progress.balance)} more EP needed`}
                        </small>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="pet-arrow"
            aria-label={`Next companion, ${
              visible[(at + 1) % visible.length].name
            }`}
            onClick={() => slide(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>

          <span className="sr-only" aria-live="polite">
            {visible[at].name}, {petBonusLabel(visible[at].multiplier)}
          </span>
          <div className="pet-slideshow-foot">
            <span className="pet-counter" aria-hidden="true">
              {String(at + 1).padStart(2, "0")} /{" "}
              {String(visible.length).padStart(2, "0")}
            </span>

            <div className="pet-rail" aria-label="Companion cages">
              {visible.map((pet, i) => (
                <button
                  key={pet.id}
                  type="button"
                  data-cage={pet.id}
                  className={`pet-rail-cage ${i === at ? "is-current" : ""} ${
                    active === pet.id ? "is-active" : ""
                  } ${owned.includes(pet.id) ? "is-owned" : ""} ${
                    tracked === pet.id ? "is-goal" : ""
                  }`}
                  style={{ "--pet-accent": pet.accent }}
                  aria-label={`Show ${pet.name}`}
                  aria-current={i === at ? "true" : undefined}
                  onClick={() => setIndex(i)}
                >
                  <PetIcon
                    pet={pet.id}
                    name={pet.name}
                    multiplier={pet.multiplier}
                    size={34}
                    active={active === pet.id}
                  />
                  {owned.includes(pet.id) && (
                    <span className="pet-rail-owned" aria-hidden="true">
                      <Check size={9} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span className="pet-hint">slide with the arrows or the cages</span>
          </div>
        </div>
      ) : (
        <p className="shop-empty">You have no companions yet.</p>
      )}
      <p className="pet-footnote">
        A lucky roll drops a companion you do not own yet, already worn.
      </p>
    </section>
  );
}
