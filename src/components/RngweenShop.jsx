import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import { pathForSubpage } from "../router.js";
import { RNGWEEN_WORLD_SKIN, rngweenCalendar } from "../rngween.js";
import {
  EP_PER_PUMPKOIN,
  RNGWEEN_LIMITED_ITEMS,
  RNGWEEN_PET,
  RNGWEEN_SKILL,
} from "../rngween-limited.js";
import {
  rngweenValleyUnlocked,
  worldState,
  worldFragmentsComplete,
} from "../rngween-world-zones.js";
import { useFormatEP } from "../use-settings.jsx";
import { waitText } from "../tasks.js";
import NumberBox from "./NumberBox.jsx";
import PetIcon from "./PetIcon.jsx";
import {
  PhantomMark,
  PumpkinMark,
  WitchfireMark,
  SkillIcon,
  WorldKeyMark,
  HexboundMark,
} from "./game-icons.jsx";
import "../rngween-limited.css";

const count = (n) => n.toLocaleString("en-US");
export function Pumpkoin({ size = 20 }) {
  return (
    <span className="pumpkoin-mark" aria-hidden="true">
      <PumpkinMark size={size} />
    </span>
  );
}

// One large, first shelf. Not a global event banner and not a rotating EP item.
export function RngweenShopDoor({ progress, onOpen }) {
  return (
    <a
      className="rngween-shop-door"
      data-shelf="limited"
      href={pathForSubpage("shop", "limited")}
      onClick={(event) => {
        if (
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onOpen?.("limited");
      }}
    >
      <span className="rngween-door-art" aria-hidden="true">
        <PumpkinMark size={76} />
        <PhantomMark size={30} />
        <WitchfireMark size={28} />
      </span>
      <span className="rngween-door-copy">
        <span className="rngween-limited-kicker">
          One-time shelf · closes Nov 3, 23:59 UTC
        </span>
        <strong>Limited Shop: RNGween 2026</strong>
        <span>
          Pumpkin Familiar, Midnight Harvest and the Valley Challenge Key.
        </span>
        <small>
          <Pumpkoin size={15} />{" "}
          {count(progress.rngweenLimited?.pumpkoins ?? 0)} Pumpkoins · exchange
          EP inside
        </small>
      </span>
      <ArrowRight size={22} aria-hidden="true" />
    </a>
  );
}

export default function RngweenShop({
  progress,
  now,
  onAction,
  onBack,
  onWorld,
  onCollection,
  openSignup,
  notify,
}) {
  const calendar = rngweenCalendar(now);
  const limited = progress.rngweenLimited;
  const live = calendar.limitedPhase === "active" && !limited?.retired;
  const formatEP = useFormatEP();
  const [quantity, setQuantity] = useState("100");
  const [confirmation, setConfirmation] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const dialog = useRef(null);
  const restoreFocus = useRef(null);
  const heading = useRef(null);
  const wallet = limited?.pumpkoins ?? 0;
  const max = Math.floor(progress.balance / EP_PER_PUMPKOIN);
  const amount = Number(quantity);
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= max;
  const unlocked = rngweenValleyUnlocked(limited);
  const world = worldState(limited);
  const readyToForge = worldFragmentsComplete(world);
  const hexboundOwned = progress.owned.includes(RNGWEEN_WORLD_SKIN.id);
  const items = RNGWEEN_LIMITED_ITEMS.filter(
    (item) => item.kind !== "aura" || !progress.owned.includes(item.id),
  );
  useEffect(() => {
    if (confirmation) {
      restoreFocus.current = document.activeElement;
      dialog.current?.showModal();
      dialog.current?.querySelector("button")?.focus();
    } else {
      dialog.current?.close();
      if (restoreFocus.current?.isConnected) restoreFocus.current.focus();
      else if (restoreFocus.current) heading.current?.focus();
    }
  }, [confirmation]);
  async function run(action) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const outcome = await onAction(action);
      if (!outcome?.ok) {
        setError(outcome?.message ?? "Nothing was spent. Please retry.");
        return false;
      }
      return true;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirm() {
    const choice = confirmation;
    if (!choice || !live) return;
    const ok = await run(choice.action);
    if (ok) {
      setConfirmation(null);
      notify?.({
        kind: "done",
        title: choice.item
          ? `${choice.item.name} collected`
          : "Pumpkoins exchanged",
        text:
          choice.item?.kind === "world-key"
            ? "Valley challenge unlocked. Your key is never consumed."
            : choice.item?.kind === "aura"
              ? "Your Halloween aura stays yours forever."
              : choice.item
                ? "Available until November 3, 23:59 UTC."
                : "One-way exchange. Unspent Pumpkoins disappear after November 3 (UTC).",
      });
    }
  }
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={14} /> All shelves
      </button>
      <section
        className="rngween-limited-shop"
        id="shop-limited"
        aria-labelledby="limited-shop-title"
      >
        <header className="rngween-limited-heading">
          <PumpkinMark size={48} />
          <div>
            <span className="rngween-limited-kicker">
              October 21–November 3, 2026 · UTC
            </span>
            <h1 id="limited-shop-title" ref={heading} tabIndex={-1}>
              Limited Shop: RNGween 2026
            </h1>
            <p>Spend the season. Keep the treats.</p>
          </div>
          {live && (
            <span className="rngween-limited-time">
              <Clock size={13} /> {waitText(calendar.limitedEndsAt - now)} left
            </span>
          )}
        </header>
        {!live ? (
          <div className="rngween-shop-closed" role="status">
            <h2>
              {calendar.limitedPhase === "unavailable"
                ? "Checking the website calendar…"
                : calendar.limitedPhase === "upcoming"
                  ? "The shelves open October 21"
                  : "The lanterns have gone out"}
            </h2>
            <p>
              {calendar.limitedPhase === "ended" || limited?.retired
                ? "The shop, Pumpkoins, temporary companion, skill and world have retired. Your collected auras and Hexbound skin are still yours."
                : "This one-time shop uses the website's verified UTC calendar, not your device date."}
            </p>
          </div>
        ) : (
          <>
            {!progress.profile && (
              <div className="guest-save-notice">
                <p>
                  Create a profile to save purchases, Pumpkoins and your world
                  pool.
                </p>
                <button className="secondary-button" onClick={openSignup}>
                  Sign up to save
                </button>
              </div>
            )}
            <div className="rngween-economy">
              <div className="rngween-currency-wallet">
                <Pumpkoin size={32} />
                <span>Your seasonal wallet</span>
                <strong data-pumpkoins={wallet}>{count(wallet)}</strong>
                <span>Pumpkoins</span>
                <p>
                  Only for RNGween 2026. Unspent coins disappear after November
                  3. No refunds.
                </p>
              </div>
              <form
                className="rngween-exchange"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (valid && progress.profile) {
                    setError("");
                    setConfirmation({
                      action: { type: "exchange-pumpkoins", amount },
                      amount,
                    });
                  }
                }}
              >
                <h2>
                  <ArrowRightLeft size={18} /> EP → Pumpkoins
                </h2>
                <p>
                  {formatEP(EP_PER_PUMPKOIN)} EP = 1 Pumpkoin · one-way exchange
                </p>
                <label htmlFor="pumpkoin-quantity">Pumpkoins to receive</label>
                <div className="rngween-exchange-input">
                  <input
                    id="pumpkoin-quantity"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={max || 1}
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setQuantity(String(max))}
                    disabled={!max || pending}
                  >
                    Max
                  </button>
                </div>
                <span className="rngween-exchange-cost">
                  Cost:{" "}
                  {formatEP(
                    Number.isSafeInteger(amount * EP_PER_PUMPKOIN) && amount > 0
                      ? amount * EP_PER_PUMPKOIN
                      : 0,
                  )}{" "}
                  EP · wallet {formatEP(progress.balance)} EP
                </span>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!valid || pending || !progress.profile}
                >
                  Exchange EP for Pumpkoins
                </button>
              </form>
            </div>
            <div className="rngween-shop-world">
              <Sparkles size={24} />
              <div>
                <h2>RNGween World is open to everyone</h2>
                <p>
                  Collect badges in four haunted zones for four key fragments.
                  Forge your Valley challenge key for free, or buy the 2,000
                  Pumpkoin shortcut below. Speak to The Reaper below Roll to
                  enter. Find 6666 in the Valley for permanent Hexbound.
                </p>
              </div>
              <button className="secondary-button" onClick={onWorld}>
                Find The Reaper
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="rngween-limited-section-title">
              <h2>Event items</h2>
              <p>
                The familiar, skill and key leave after November 3. Earned auras
                stay forever.
              </p>
            </div>
            <div className="rngween-limited-grid">
              {items.map((item) => {
                const saleLocked =
                  item.kind === "aura" && !calendar.aurasBuyable;
                const owned =
                  item.kind === "aura"
                    ? progress.owned.includes(item.id)
                    : (limited?.bought ?? []).includes(item.id);
                const equipped =
                  item.id === RNGWEEN_PET.id
                    ? progress.activePet === item.id
                    : item.id === RNGWEEN_SKILL.id
                      ? progress.equippedSkills.includes(item.id)
                      : progress.equipped === item.id;
                return (
                  <article
                    className="rngween-limited-card"
                    key={item.id}
                    data-limited-item={item.id}
                  >
                    <div
                      className={`rngween-limited-preview ${item.kind === "aura" ? "is-aura" : ""}`}
                      aria-hidden="true"
                    >
                      {item.kind === "aura" ? (
                        <NumberBox
                          value="6666"
                          tier="rare"
                          aura={item.id}
                          compact
                        />
                      ) : item.kind === "companion" ? (
                        <PetIcon
                          pet={item.id}
                          multiplier={item.multiplier}
                          active={equipped}
                          size={94}
                        />
                      ) : item.kind === "world-key" ? (
                        <WorldKeyMark
                          size={78}
                          className="rngween-world-key-art"
                        />
                      ) : (
                        <SkillIcon icon={item.icon} size={74} />
                      )}
                    </div>
                    <span className="rngween-limited-kind">
                      {item.kind === "aura"
                        ? "Permanent aura · task fallback"
                        : item.kind === "world-key"
                          ? "Valley access · until Nov 3 UTC"
                          : `Temporary ${item.kind} · until Nov 3`}
                    </span>
                    <h3>
                      {item.name}
                      {owned && <Check size={15} />}
                    </h3>
                    <p>{item.description}</p>
                    {saleLocked && (
                      <p className="rngween-aura-sale-note">
                        <Clock size={13} /> Purchases open November 1 UTC. Earn
                        this aura from tasks until October 31.
                      </p>
                    )}
                    <strong className="rngween-limited-price">
                      <Pumpkoin size={18} />
                      {count(item.pumpkoinPrice)} Pumpkoins
                    </strong>
                    {item.kind === "world-key" && (unlocked || readyToForge) ? (
                      <>
                        <span className="rngween-key-status">
                          <Check size={14} />
                          {owned
                            ? "Valley key owned"
                            : readyToForge && !unlocked
                              ? "All fragments ready · forge for free"
                              : "Valley challenge unlocked"}
                        </span>
                        <button className="secondary-button" onClick={onWorld}>
                          View World <ArrowRight size={14} />
                        </button>
                      </>
                    ) : owned ? (
                      <button
                        className="secondary-button"
                        disabled={
                          pending || (item.kind === "companion" && equipped)
                        }
                        onClick={() =>
                          run({
                            type:
                              item.kind === "companion"
                                ? "equip-pet"
                                : "equip-skill",
                            id: item.id,
                            ...(item.kind === "skill"
                              ? { equipped: !equipped }
                              : {}),
                          })
                        }
                      >
                        {equipped
                          ? item.kind === "skill"
                            ? "Unequip skill"
                            : "Companion equipped"
                          : `Equip ${item.kind}`}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={
                          pending ||
                          saleLocked ||
                          wallet < item.pumpkoinPrice ||
                          !progress.profile
                        }
                        onClick={() => {
                          setError("");
                          setConfirmation({
                            item,
                            action: {
                              type: "buy-rngween-limited",
                              id: item.id,
                            },
                          });
                        }}
                        aria-label={`Buy ${item.name} for ${item.pumpkoinPrice} Pumpkoins`}
                      >
                        {saleLocked ? (
                          "Available November 1"
                        ) : (
                          <>
                            Buy for {count(item.pumpkoinPrice)}{" "}
                            <Pumpkoin size={16} />
                          </>
                        )}
                      </button>
                    )}
                  </article>
                );
              })}
              <article
                className="rngween-limited-card rngween-world-prize"
                data-world-prize={RNGWEEN_WORLD_SKIN.id}
              >
                <div
                  className="rngween-limited-preview is-aura"
                  aria-hidden="true"
                >
                  <NumberBox
                    value="6666"
                    tier="mythic"
                    aura={RNGWEEN_WORLD_SKIN.id}
                    compact
                  />
                </div>
                <span className="rngween-limited-kind">
                  Permanent aura · world reward
                </span>
                <h3>
                  {RNGWEEN_WORLD_SKIN.name}
                  {hexboundOwned && <Check size={15} />}
                </h3>
                <p>{RNGWEEN_WORLD_SKIN.description}</p>
                <strong className="rngween-world-prize-condition">
                  <HexboundMark size={19} />
                  Find 6666 · never sold
                </strong>
                {hexboundOwned ? (
                  <button
                    className="secondary-button"
                    disabled={
                      pending || progress.equipped === RNGWEEN_WORLD_SKIN.id
                    }
                    onClick={async () => {
                      if (
                        await run({ type: "equip", id: RNGWEEN_WORLD_SKIN.id })
                      )
                        notify?.({
                          kind: "done",
                          text: "Hexbound equipped.",
                        });
                    }}
                  >
                    {progress.equipped === RNGWEEN_WORLD_SKIN.id
                      ? "Hexbound equipped"
                      : "Equip Hexbound"}
                  </button>
                ) : (
                  <button className="secondary-button" onClick={onWorld}>
                    Explore RNGween World
                    <ArrowRight size={14} />
                  </button>
                )}
              </article>
            </div>
            {items.every((item) => item.kind !== "aura") && (
              <p className="rngween-all-auras">
                All four task auras are already in your collection.
              </p>
            )}
            {progress.owned.some((id) =>
              [
                "jack-o-glow",
                "phantom-veil",
                "witchfire",
                "blood-moon",
                "hexbound",
              ].includes(id),
            ) && (
              <button className="secondary-button" onClick={onCollection}>
                Your permanent Halloween collection <ArrowRight size={14} />
              </button>
            )}
            {error && !confirmation && (
              <p className="rngween-shop-error" role="alert">
                {error}
              </p>
            )}
            <p className="rngween-limited-footnote">
              Tasks close October 31; aura purchases open November 1. Shop,
              exchange and world close November 3 at 23:59 UTC. No EP, task
              progress or main-game rolls are awarded by the mini RNG.
            </p>
          </>
        )}
      </section>
      <dialog
        className="rngween-buy-dialog"
        ref={dialog}
        aria-labelledby="rngween-confirm-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) setConfirmation(null);
        }}
      >
        {confirmation && (
          <>
            <Pumpkoin size={38} />
            <h2 id="rngween-confirm-title">
              {confirmation.item?.kind === "world-key"
                ? "Buy a Valley Challenge Key?"
                : confirmation.item
                  ? `Collect ${confirmation.item.name}?`
                  : `Exchange for ${count(confirmation.amount)} Pumpkoins?`}
            </h2>
            <p>
              {confirmation.item
                ? `${count(confirmation.item.pumpkoinPrice)} Pumpkoins. ${confirmation.item.kind === "aura" ? "This aura is yours forever." : "This item expires after November 3 (UTC)."}`
                : `${formatEP(confirmation.amount * EP_PER_PUMPKOIN)} EP will be spent. This exchange cannot be reversed; unused coins disappear after November 3 (UTC).`}
            </p>
            {confirmation.item?.kind === "world-key" && (
              <p>
                The first three World phases are already free. This key unlocks
                only Valley of Horrors and is never consumed by entering or
                rebirth. No refunds, no mission completion, no aura or Hexbound
                included. Complete both zones' badge objectives and forge a free
                key instead.
              </p>
            )}
            {error && (
              <p className="rngween-shop-error" role="alert">
                {error}
              </p>
            )}
            <div>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={pending || !live}
                onClick={confirm}
              >
                {pending
                  ? "Saving…"
                  : confirmation.item
                    ? "Confirm purchase"
                    : "Confirm exchange"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
