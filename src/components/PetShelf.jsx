import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Lock,
  Shirt,
  Target,
} from "lucide-react";
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
import "../pet-skin-picker.css";

function PetSkinPicker({
  pet,
  isOwned,
  unlocked,
  selectedSkin,
  pending,
  onSelect,
}) {
  const hasPrismSkin = pet.id === "axolotl";
  const [preview, setPreview] = useState(selectedSkin);
  useEffect(() => setPreview(selectedSkin), [selectedSkin]);
  const options = [
    {
      id: "original",
      label: "Original",
      owned: isOwned,
      description: `The original ${pet.name.toLowerCase()} look, just as it appears in the wild.`,
    },
    ...(hasPrismSkin
      ? [
          {
            id: "prism",
            label: "Prism",
            owned: isOwned && unlocked,
            description:
              "A luminous spectrum finish, unlocked from the First Light season pass.",
          },
        ]
      : []),
    {
      id: "mystery",
      label: "???",
      owned: false,
      description: "A hidden appearance that has not been discovered yet.",
    },
  ];
  const previewOption =
    options.find((option) => option.id === preview) ?? options[0];
  return (
    <div
      className="pet-skin-picker"
      role="group"
      aria-label={`${pet.name} skins`}
    >
      <div className="pet-skin-preview">
        <PetIcon
          pet={pet.id}
          name={
            preview === "mystery"
              ? "Unknown companion skin preview"
              : `${pet.name} ${preview}`
          }
          multiplier={pet.multiplier}
          size={96}
          prism={preview === "prism"}
          className={preview === "mystery" ? "is-mystery-silhouette" : ""}
        />
      </div>
      <div className="pet-skin-description" aria-live="polite">
        <strong>{previewOption.label} skin</strong>
        <p>{previewOption.description}</p>
      </div>
      <div className="pet-skin-options">
        {options.map((option) => {
          const isSelected = selectedSkin === option.id;
          const isPreview = preview === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`pet-skin-option ${isSelected ? "is-selected" : ""} ${isPreview ? "is-preview" : ""} ${!option.owned ? "is-locked" : ""}`}
              aria-label={`${option.label} ${pet.name} skin${isSelected ? ", equipped" : option.owned ? "" : ", preview only"}`}
              aria-pressed={isPreview}
              data-equipped={isSelected || undefined}
              title={
                option.owned
                  ? option.label
                  : "Preview only — this skin is not unlocked"
              }
              disabled={
                !!pending ||
                option.id === "mystery" ||
                (isSelected && option.owned)
              }
              onClick={() => {
                if (option.id === "mystery") return;
                setPreview(option.id);
                if (option.owned && option.id !== selectedSkin)
                  onSelect(option.id);
              }}
            >
              <PetIcon
                pet={pet.id}
                name=""
                multiplier={pet.multiplier}
                size={48}
                prism={option.id === "prism"}
                className={
                  option.id === "mystery" ? "is-mystery-silhouette" : ""
                }
              />
              <span>{option.label}</span>
              {!option.owned && option.id !== "mystery" && (
                <Lock size={11} aria-hidden="true" />
              )}
              {option.id === "mystery" && <small>unknown</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [skinView, setSkinView] = useState(null);
  const busy = useRef(false);
  const uncageTimer = useRef(null);
  const slideshow = useRef(null);
  const owned = (progress.pets ?? []).filter((id) =>
    PETS.some((pet) => pet.id === id),
  );
  const active = progress.activePet ?? "none";
  const prismAxolotl = (progress.owned ?? []).includes("pass-axolotl");
  const activeAxolotlSkin = progress.petSkins?.axolotl ?? "original";

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

  async function run(action, id, message, extra = {}) {
    if (busy.current) return false;
    busy.current = true;
    setPending(id ?? action);
    try {
      const result = await onAction({ type: action, id, ...extra });
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
                const hasPrismSkin = pet.id === "axolotl";
                const selectedSkin =
                  hasPrismSkin && activeAxolotlSkin === "prism"
                    ? "prism"
                    : "original";

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
                    } ${pickable ? "is-pickable" : ""} ${
                      skinView === pet.id ? "has-skin-view" : ""
                    }`}
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
                    <div
                      className={`pet-cage ${skinView === pet.id ? "is-skin-view" : ""}`}
                    >
                      {skinView === pet.id ? (
                        <>
                          <PetSkinPicker
                            pet={pet}
                            isOwned={isOwned}
                            unlocked={prismAxolotl}
                            selectedSkin={selectedSkin}
                            pending={pending}
                            onSelect={(skinId) =>
                              run(
                                "equip-pet-skin",
                                pet.id,
                                `${skinId === "prism" ? "Prism" : "Original"} ${pet.name} skin equipped.`,
                                { petId: pet.id, skinId },
                              )
                            }
                          />
                        </>
                      ) : (
                        <>
                          <span
                            className="pet-cage-hanger"
                            aria-hidden="true"
                          />
                          <PetIcon
                            pet={pet.id}
                            name={pet.name}
                            multiplier={pet.multiplier}
                            size={124}
                            active={isActive}
                            prism={
                              hasPrismSkin &&
                              prismAxolotl &&
                              selectedSkin === "prism"
                            }
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
                        </>
                      )}
                    </div>
                    <div
                      className={`pet-body ${skinView === pet.id ? "is-skin-view" : ""}`}
                    >
                      <div className="pet-title">
                        <strong>{pet.name}</strong>
                        <button
                          type="button"
                          className={`pet-skin-toggle icon-button ${skinView === pet.id ? "is-active" : ""}`}
                          aria-label={`${skinView === pet.id ? "Close" : "Preview"} ${pet.name} skins`}
                          aria-expanded={skinView === pet.id}
                          title={
                            skinView === pet.id
                              ? "Close skin preview"
                              : "Preview skins"
                          }
                          onClick={() =>
                            setSkinView((value) =>
                              value === pet.id ? null : pet.id,
                            )
                          }
                        >
                          <Shirt size={16} />
                        </button>
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
                    prism={prismAxolotl}
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
    </section>
  );
}
