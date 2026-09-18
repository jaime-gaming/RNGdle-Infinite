import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  Orbit,
  Waves,
  Check,
  Coins,
  X,
  FastForward,
  Clock3,
  Snowflake,
  Flame,
  ScanSearch,
  Repeat2,
  Eclipse,
  Gem,
  MoonStar,
  Cog,
} from "lucide-react";
import {
  shopProducts,
  productById,
  rollSettings,
  offlineSettings,
  formatDuration,
  nextUpgrade,
} from "../shop-data";
import {
  availableGoals,
  currentGoal,
  recommendedGoal,
} from "../gameplay-loop.js";
import "../progress-links.css";
import { flywheelRequired } from "../flywheel.js";
import NumberBox from "./NumberBox";
import { formatEP } from "../roll-data";
const icons = {
  stars: Sparkles,
  aurora: Waves,
  orbit: Orbit,
  speed: FastForward,
  clock: Clock3,
  ice: Snowflake,
  fire: Flame,
  lens: ScanSearch,
  auto: Repeat2,
  eclipse: Eclipse,
  prism: Gem,
  offline: MoonStar,
  flywheel: Cog,
};
export default function Shop({
  progress,
  focusProduct,
  onAction,
  navigate,
  notify,
  openSignup,
}) {
  const [previewTier, setPreviewTier] = useState("rare");
  const [lastPurchase, setLastPurchase] = useState(null);
  const [selected, setSelected] = useState(null),
    [pending, setPending] = useState(false),
    [purchaseError, setPurchaseError] = useState("");
  const busy = useRef(false),
    dialog = useRef(null),
    returnFocus = useRef(null),
    returnKind = useRef(null);
  const settings = rollSettings(progress.owned);
  const offlineInterval = offlineSettings(progress.owned).intervalMS;
  const charges = flywheelRequired(progress.owned);
  const goal = currentGoal(progress),
    suggested = recommendedGoal(progress),
    choices = availableGoals(progress);
  useEffect(() => {
    if (!focusProduct || !productById.has(focusProduct)) return;
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector(`[data-product="${focusProduct}"]`);
      card?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      card?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusProduct]);
  useEffect(() => {
    if (selected) {
      setLastPurchase(null);
      setPurchaseError("");
      returnFocus.current = document.activeElement;
      returnKind.current = selected.kind;
      dialog.current.showModal();
    } else {
      dialog.current?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else if (returnKind.current)
        (
          document.querySelector(
            `[data-kind="${returnKind.current}"] button:not(:disabled)`,
          ) ?? document.querySelector(`[data-kind="${returnKind.current}"]`)
        )?.focus();
    }
  }, [selected]);
  async function perform(type, id) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await onAction({ type, id });
      if (result.ok) {
        setSelected(null);
        if (type === "buy") setLastPurchase(productById.get(id));
        else {
          setLastPurchase(null);
          notify(
            type === "goal"
              ? "Goal updated. No EP spent."
              : "Appearance updated.",
          );
        }
      } else {
        setPurchaseError(result.message);
        notify(result.message);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function card(item) {
    const aura = item.kind === "aura",
      owned = progress.owned.includes(item.id),
      equipped = aura && progress.equipped === item.id;
    const affordable = progress.balance >= item.price,
      requires = item.requires && !progress.owned.includes(item.requires),
      Icon = icons[item.icon];
    return (
      <article
        className="shop-card"
        key={item.id}
        data-product={item.id}
        data-kind={item.kind}
        data-tracked={goal?.id === item.id}
        aria-label={item.name}
        tabIndex={-1}
      >
        <div
          className={
            aura
              ? `aura-preview aura-${item.id}`
              : `upgrade-preview upgrade-${item.kind}`
          }
          aria-hidden="true"
        >
          {aura ? (
            <>
              <NumberBox
                value="??????"
                tier={previewTier}
                aura={item.id}
                compact
              />
              <Icon size={21} />
            </>
          ) : item.kind === "pace" ? (
            <>
              <Icon size={28} />
              <span>
                <b>{item.charges}</b> {item.charges === 1 ? "roll" : "rolls"}{" "}
                <small>→</small> charged
              </span>
              <small>NEXT ROLL · ZERO COOLDOWN</small>
            </>
          ) : item.kind === "offline" ? (
            <>
              <Icon size={25} />
              <span>
                {item.from / 60000} min <small>→</small>{" "}
                <b>{item.value / 60000} min</b>
              </span>
              <small>OFFLINE INTERVAL · SAME 144-ROLL CAP</small>
            </>
          ) : item.kind === "utility" ? (
            <>
              <Icon size={25} />
              <span>{item.name}</span>
              <small>
                {item.id === "auto-roll"
                  ? "ENABLE · ROLL · REPEAT"
                  : item.id === "offline-roller"
                    ? `${owned ? offlineInterval / 60000 : 10} MIN / ROLL · 144 MAX`
                    : "SEARCH · FILTER · DISCOVER"}
              </small>
            </>
          ) : (
            <>
              <Icon size={25} />
              <span>
                {item.from / 1000}s <small>→</small> <b>{item.value / 1000}s</b>
              </span>
              <small>
                {item.kind === "roll" ? "COMPLETE REVEAL" : "BETWEEN ROLLS"}
              </small>
            </>
          )}
        </div>
        <div className="shop-card-body">
          <div className="shop-item-title">
            <h3>{item.name}</h3>
            <span>{equipped ? "Equipped" : owned ? "Owned" : "Permanent"}</span>
          </div>
          <p>
            {item.id === "offline-roller" && owned
              ? `One ordinary roll per ${offlineInterval / 60000} minutes away. Maximum 144 rolls per absence; unused fractions do not carry over.`
              : item.description}
          </p>
          <div className="shop-price">
            <Coins size={15} />
            {formatEP(item.price)} EP
          </div>
          <button
            className={owned ? "secondary-button" : "primary-button"}
            disabled={
              pending ||
              equipped ||
              (owned && !aura) ||
              (!owned &&
                !(item.requiresProfile && !progress.profile) &&
                (!affordable || requires))
            }
            onClick={() =>
              item.requiresProfile && !progress.profile
                ? openSignup()
                : owned
                  ? perform("equip", item.id)
                  : setSelected(item)
            }
          >
            {item.requiresProfile && !progress.profile ? (
              "Sign up to unlock"
            ) : equipped ? (
              <>
                <Check size={14} /> Equipped
              </>
            ) : owned ? (
              aura ? (
                "Equip aura"
              ) : (
                <>
                  <Check size={14} /> Purchased
                </>
              )
            ) : (
              `Buy for ${formatEP(item.price)} EP`
            )}
          </button>
          <small className="shop-item-note">
            {item.requiresProfile && !progress.profile
              ? "Offline progress needs a saved local profile."
              : requires
                ? `Requires ${productById.get(item.requires).name}`
                : !owned && !affordable
                  ? `${formatEP(item.price - progress.balance)} more EP needed`
                  : owned
                    ? aura
                      ? "Equip whenever you like."
                      : item.kind === "utility"
                        ? item.id === "auto-roll"
                          ? "Enable on the Roll page."
                          : item.id === "offline-roller"
                            ? `Ready · one roll per ${offlineInterval / 60000} minutes away.`
                            : "Unlocked in History."
                        : item.kind === "pace"
                          ? `${progress.flywheelCharge ?? 0} / ${charges} charges · applies automatically.`
                          : "Maximum level reached."
                    : aura
                      ? "One-time cosmetic purchase"
                      : "One-time unlock · same odds and scores"}
          </small>
        </div>
      </article>
    );
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate("roll")}>
        <ArrowLeft size={14} /> Back to rolling
      </button>
      <div className="page-heading">
        <div className="page-icon">
          <ShoppingBag size={25} />
        </div>
        <div>
          <h1>The EP shop</h1>
          <p>Upgrades, tools and cosmetics.</p>
        </div>
      </div>
      {!progress.profile && (
        <div className="guest-save-notice">
          <p>
            You’re playing as a guest. Purchases and progress last only until
            you reload.
          </p>
          <button className="secondary-button" onClick={openSignup}>
            Sign up to save
          </button>
        </div>
      )}
      <section className="shop-wallet" aria-label="EP wallet">
        <div>
          <span className="eyebrow">
            <Coins size={14} /> YOUR EP BALANCE
          </span>
          <strong data-testid="wallet-balance">
            {formatEP(progress.balance)} <small>EP</small>
          </strong>
        </div>
        <div className="timing-stats">
          <div>
            <span>Roll reveal</span>
            <strong data-testid="roll-duration">
              {settings.rollMS / 1000}s
            </strong>
          </div>
          <div>
            <span>Cooldown</span>
            <strong data-testid="cooldown-duration">
              {formatDuration(settings.cooldownMS / 1000)}
            </strong>
          </div>
        </div>
      </section>
      <section className="shop-goal-picker" aria-label="Choose your next goal">
        <label htmlFor="shop-goal">Track a goal</label>
        <select
          id="shop-goal"
          value={progress.goalId ?? ""}
          disabled={pending || !choices.length}
          onChange={(e) => perform("goal", e.target.value || null)}
        >
          <option value="">
            {suggested ? `Recommended · ${suggested.name}` : "All items owned"}
          </option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {formatEP(item.price)} EP
            </option>
          ))}
        </select>
        <small>
          {progress.profile
            ? "Saved with your profile."
            : "Guest goals are temporary."}
        </small>
      </section>
      <section className="shop-category">
        <div className="shop-section-heading">
          <div>
            <h2>Upgrade your pace</h2>
            <p>
              One level at a time. Buy an upgrade to reveal the next one in its
              path.
            </p>
          </div>
        </div>
        <div className="shop-grid shop-grid-upgrades">
          {["roll", "cooldown"].map((kind) =>
            card(nextUpgrade(progress.owned, kind)),
          )}
          {card(nextUpgrade(progress.owned, "pace"))}
        </div>
      </section>
      {lastPurchase && (
        <>
          <div className="purchase-return-space" aria-hidden="true" />
          <aside className="purchase-return" aria-label="Purchase complete">
            <p role="status">{lastPurchase.name} purchased.</p>
            <button className="return-link" onClick={() => navigate("roll")}>
              Continue rolling
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss purchase update"
              onClick={() => setLastPurchase(null)}
            >
              <X size={16} />
            </button>
          </aside>
        </>
      )}
      <p className="shop-save-note">
        Timing upgrades apply when you start your next roll. An active reveal or
        cooldown is not shortened by a purchase.
      </p>
      <section className="shop-category">
        <div className="shop-section-heading">
          <div>
            <h2>Roll auras</h2>
            <p>Cosmetic only. Equip one at a time.</p>
          </div>
          <button
            className="secondary-button"
            disabled={progress.equipped === "none" || pending}
            onClick={() => perform("equip", "none")}
          >
            {progress.equipped === "none" ? (
              <>
                <Check size={14} /> Original equipped
              </>
            ) : (
              "Use original appearance"
            )}
          </button>
        </div>
        <div className="aura-preview-controls">
          <label>
            Preview rarity{" "}
            <select
              aria-label="Cosmetic preview rarity"
              value={previewTier}
              onChange={(e) => setPreviewTier(e.target.value)}
            >
              {[
                "common",
                "uncommon",
                "rare",
                "epic",
                "anomaly",
                "mythic",
                "godly",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <span>
            Same rarity. Your signature look. Existing owners get the upgraded
            effects free.
          </span>
        </div>
        <div className="shop-grid">
          {shopProducts.filter((item) => item.kind === "aura").map(card)}
        </div>
      </section>
      <section className="shop-category">
        <div className="shop-section-heading">
          <div>
            <h2>Tools</h2>
            <p>
              Automate your rolls or explore your archive. Same odds and EP
              rules.
            </p>
          </div>
        </div>
        <div className="shop-grid">
          {shopProducts.filter((p) => p.kind === "utility").map(card)}
        </div>
      </section>
      {progress.owned.includes("offline-roller") && (
        <section className="shop-category">
          <div className="shop-section-heading">
            <div>
              <h2>Offline upgrades</h2>
              <p>
                Fill the same offline allowance sooner. Maximum 144 rolls per
                absence.
              </p>
            </div>
          </div>
          <div className="shop-grid">
            {card(nextUpgrade(progress.owned, "offline"))}
          </div>
        </section>
      )}
      <p className="shop-save-note">
        {progress.profile
          ? `Saved locally as ${progress.profile.username}. Clearing site data removes your profile and progress.`
          : "Sign up for a local profile to keep your wallet, discoveries, upgrades, and cosmetics."}{" "}
        No real money or cloud account is involved.
      </p>
      <dialog
        className="shop-confirm"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) setSelected(null);
        }}
        aria-labelledby="purchase-title"
      >
        {selected && (
          <>
            <button
              className="shop-confirm-close icon-button"
              aria-label="Cancel purchase"
              disabled={pending}
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
            <div className="modal-symbol">
              <ShoppingBag size={26} />
            </div>
            <p className="eyebrow">
              PERMANENT{" "}
              {selected.kind === "aura"
                ? "COSMETIC"
                : selected.kind === "utility"
                  ? "TOOL"
                  : "UPGRADE"}
            </p>
            <h2 id="purchase-title">Buy {selected.name}?</h2>
            <p>
              This spends <strong>{formatEP(selected.price)} EP</strong> and{" "}
              {selected.kind === "aura"
                ? "equips your new aura."
                : selected.kind === "utility"
                  ? selected.id === "auto-roll"
                    ? "unlocks the Auto-Roll switch on the Roll page. It starts off and never skips the reveal or cooldown."
                    : selected.id === "offline-roller"
                      ? "unlocks offline earnings: one normal roll per 10 minutes away, up to 144 rolls per absence. Calculated automatically on return; a local profile is required."
                      : "unlocks advanced history search immediately."
                  : selected.kind === "pace"
                    ? `sets Flywheel to ${selected.charges} online ${selected.charges === 1 ? "roll" : "rolls"} per charge. Earned charge carries over up to this limit; a new Flywheel starts at zero charge. Reveals and scores are unchanged.`
                    : selected.kind === "offline"
                      ? `sets future offline earnings to one ordinary roll per ${selected.value / 60000} minutes. Maximum 144 per absence. No retroactive rewards; committed batches must finish first.`
                      : "applies the upgrade to future rolls."}
            </p>
            {!progress.profile && (
              <p className="guest-purchase-note">
                Guest purchase: sign up before leaving to save it.
              </p>
            )}
            <div className="purchase-balance">
              <span>Balance after purchase</span>
              <strong>
                {formatEP(Math.max(0, progress.balance - selected.price))} EP
              </strong>
            </div>
            {purchaseError && <p role="alert">{purchaseError}</p>}
            <div className="purchase-actions">
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  pending ||
                  progress.balance < selected.price ||
                  progress.owned.includes(selected.id) ||
                  !!(
                    selected.requires &&
                    !progress.owned.includes(selected.requires)
                  )
                }
                onClick={() => perform("buy", selected.id)}
              >
                {pending ? "Applying…" : "Confirm purchase"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
