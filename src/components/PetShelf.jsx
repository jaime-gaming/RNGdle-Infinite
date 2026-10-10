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
import { useFormatEP } from "../use-settings.jsx";
import PetIcon from "./PetIcon.jsx";
import { CompanionMark, SkillIcon } from "./game-icons.jsx";
import "../pets.css";

// Companions are a slideshow of cages: one companion stands in the middle of
// the stage and the arrows slide to the next one, so thirteen friends read as
// a shelf you walk along instead of a wall of rows. A rail of small cages
// under the stage jumps straight to any of them.
//
// Buy one, or be very lucky. Equipping is free and the bonus applies to
// banked EP only — never to the number, its tier or its score.
export default function PetShelf({
  progress,
  onAction,
  notify,
  // A goal link (the banner, the spotlight, a recap) names the companion it
  // points at: the stage turns to it.
  focus = null,
  // Pick mode is armed from the goal banner; while it is, any unfound
  // companion on the stage becomes the goal when tapped.
  pickingGoal = false,
  onPickingGoal = () => {},
}) {
  const formatEP = useFormatEP();
  const [pending, setPending] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [index, setIndex] = useState(0);
  const [uncaged, setUncaged] = useState(null);
  const busy = useRef(false);
  const uncageTimer = useRef(null);
  const slideshow = useRef(null);
  const owned = progress.pets ?? [];
  const active = progress.activePet ?? "none";
  // The tracked goal, when it is a companion still unfound. A product goal is
  // the shop's own banner's business, so it reads as no goal here.
  const tracked = validGoal(progress.goalId, progress.owned, owned)
    ? progress.goalId
    : null;
  useEffect(() => () => clearTimeout(uncageTimer.current), []);

  useEffect(() => {
    const at = PETS.findIndex((pet) => pet.id === focus);
    if (at < 0) return;
    // A goal can only be an unfound companion, so "Only mine" steps aside.
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

  // Resolves to whether the action landed, so a pick can end once it has.
  async function run(action, id, message) {
    if (busy.current) return false;
    busy.current = true;
    setPending(id ?? action);
    try {
      const result = await onAction({ type: action, id });
      if (result.ok) {
        notify?.({ kind: "done", text: message });
        // Equipping — or buying, which equips — opens the cage: the door
        // swings and the friend hops out. Putting one away cages it again,
        // so that one stays quiet.
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

  // A companion goal is a choice like a product goal: no EP is spent, and the
  // pick is done the moment the goal lands. Clearing it hands back the shop's
  // own recommendation.
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

  // The stage points inside the visible list: "Only mine" can shrink the list
  // under it, and the position clamps rather than falling off the end.
  const at = visible.length ? Math.min(index, visible.length - 1) : 0;
  const slide = (delta) =>
    setIndex((at + delta + visible.length) % visible.length);

  // Left and right arrows slide the stage while the shelf has focus.
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
                const affordable = progress.balance >= pet.price;
                const signature = skillForPet(pet.id);
                const current = i === at;
                // Pick mode: an unfound companion is the goal when tapped, and
                // tapping the tracked one again untracks it, as on the shelves.
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
                            <Coins size={13} /> {formatEP(pet.price)} EP
                          </button>
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
                              : `${formatEP(pet.price - progress.balance)} more EP needed`}
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
          {/* One quiet announcement for screen readers: the stage's label
              changes with the slides, and this is what changed. */}
          <span className="sr-only" aria-live="polite">
            {visible[at].name}, {petBonusLabel(visible[at].multiplier)}
          </span>
          <div className="pet-slideshow-foot">
            <span className="pet-counter" aria-hidden="true">
              {String(at + 1).padStart(2, "0")} /{" "}
              {String(visible.length).padStart(2, "0")}
            </span>
            {/* Every cage is one jump: the rail is the shelf seen from above. */}
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

export { petById };
