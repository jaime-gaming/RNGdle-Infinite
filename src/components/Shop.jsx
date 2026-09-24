import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Vault,
  Waves as TideIcon,
  Leaf,
  CircuitBoard,
  Triangle,
  CircleDot,
  Zap,
  PawPrint,
  Wind,
  Layers,
  Mountain,
  Gauge,
  Target,
  LayoutGrid,
  Search,
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
import { rackReport } from "../rack.js";
import "../progress-links.css";
import PetShelf from "./PetShelf";
import { flywheelRequired } from "../flywheel.js";
import { skillById, skillChargeOf, skillEffectChips } from "../skills.js";
import NumberBox from "./NumberBox";
import {
  AutomationMark,
  CoreMark,
  LensMark,
  OfflineMark,
  PaceMark,
  SkillMark,
  VaultMark,
} from "./game-icons.jsx";
import { useFormatEP, useSettings } from "../use-settings.jsx";
import "../shop.css";
const icons = {
  stars: Sparkles,
  aurora: Waves,
  orbit: Orbit,
  speed: FastForward,
  clock: Clock3,
  ice: Snowflake,
  fire: Flame,
  lens: LensMark,
  auto: AutomationMark,
  eclipse: Eclipse,
  prism: Gem,
  offline: MoonStar,
  flywheel: Cog,
  vault: VaultMark,
  core: CoreMark,
  tide: TideIcon,
  leaf: Leaf,
  circuit: CircuitBoard,
  obsidian: Triangle,
  singularity: CircleDot,
  surge: Zap,
  trail: PawPrint,
  bounce: Wind,
  twice: Layers,
  bedrock: Mountain,
  turbo: Gauge,
  quarry: Target,
  bay: LayoutGrid,
};
// The shelves, in the order they are rendered. Each one is addressable
// (/shop#skills) and the sticky bar links straight to it.
export const SHOP_SECTIONS = [
  { id: "skills", label: "Skills" },
  { id: "pace", label: "Pace" },
  { id: "companions", label: "Companions" },
  { id: "auras", label: "Auras" },
  { id: "offline", label: "Offline" },
  { id: "tools", label: "Tools" },
];
// The filter chips above the shelves. They only ever narrow what is drawn:
// nothing is hidden by default, so the whole catalogue stays one glance away.
const SHOP_FILTERS = [
  { id: "all", text: "Everything" },
  { id: "available", text: "Available now" },
  { id: "affordable", text: "Affordable" },
  { id: "owned", text: "Owned" },
];
export default function Shop({
  progress,
  focusProduct,
  onAction,
  navigate,
  notify,
  openSignup,
}) {
  const formatEP = useFormatEP();
  const { settings: preferences } = useSettings();
  const [previewTier, setPreviewTier] = useState("rare");
  const [lastPurchase, setLastPurchase] = useState(null);
  const [selected, setSelected] = useState(null),
    [pending, setPending] = useState(false),
    [purchaseError, setPurchaseError] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const busy = useRef(false),
    dialog = useRef(null),
    returnFocus = useRef(null),
    returnKind = useRef(null);
  function jumpTo(id) {
    const target = document.getElementById(`shop-${id}`);
    if (!target) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduce ? "instant" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
    history.replaceState(null, "", `#${id}`);
  }
  const settings = rollSettings(progress.owned);
  const { intervalMS: offlineInterval, cap: offlineCap } = offlineSettings(
    progress.owned,
  );
  const charges = flywheelRequired(progress.owned);
  const rack = rackReport(progress);
  const goal = currentGoal(progress),
    suggested = recommendedGoal(progress),
    choices = availableGoals(progress);
  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (SHOP_SECTIONS.some((section) => section.id === id))
      document.getElementById(`shop-${id}`)?.scrollIntoView({ block: "start" });
  }, []);
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
  async function perform(type, id, extra = null) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await onAction({ type, id, ...(extra ?? {}) });
      if (result.ok) {
        setSelected(null);
        if (type === "buy") setLastPurchase(productById.get(id));
        else {
          setLastPurchase(null);
          if (type === "goal") notify("Goal updated. No EP spent.");
          else if (type === "equip-skill") notify("Skill rack updated. Free.");
          else notify("Appearance updated.");
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
  // Every product knows how it is doing at a glance: owned, affordable, missing
  // its prerequisite or waiting on a local profile.
  function stateOf(item) {
    const owned = progress.owned.includes(item.id);
    const requires = !!(
      item.requires && !progress.owned.includes(item.requires)
    );
    const profileGated = !!(item.requiresProfile && !progress.profile);
    return {
      owned,
      requires,
      profileGated,
      affordable: progress.balance >= item.price,
      available: !owned && !requires && !profileGated,
      affordableNow: !owned && !requires && progress.balance >= item.price,
    };
  }
  const matches = (item, state) => {
    const text = query.trim().toLowerCase();
    if (text) {
      const haystack = [
        item.name,
        item.description,
        item.kind,
        skillById.get(item.skillId ?? item.id)?.name ?? "",
        ...skillEffectChips(skillById.get(item.skillId ?? item.id) ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (filter === "owned") return state.owned;
    if (filter === "available") return state.available;
    if (filter === "affordable") return state.affordableNow;
    return true;
  };
  function effectOf(item) {
    if (item.kind === "pace")
      return `${item.charges === 1 ? "Every" : `Every ${item.charges}`} online rolls charge a free roll — no cooldown after the reveal`;
    if (item.kind === "offline-cap")
      return `Offline storage ${item.from} → ${item.value} rolls per absence`;
    if (item.kind === "offline")
      return `Offline rate ${item.from / 60000} → ${item.value / 60000} minutes per roll`;
    if (item.kind === "skill-slot")
      return `Rack size ${item.from} → ${item.slots} skills`;
    if (item.kind === "skill") {
      const skill = skillById.get(item.skillId ?? item.id);
      return skill
        ? `${skillEffectChips(skill).join(" · ")} · fires after ${item.charges} rolls`
        : "";
    }
    if (item.kind === "aura") return "Cosmetic only · your odds never move";
    if (item.id === "auto-roll")
      return "Click the ability on the Roll page to roll on repeat";
    if (item.id === "persistence-core")
      return "Auto-Roll survives a reload and keeps running in the background";
    if (item.id === "offline-roller")
      return `${owned(item) ? offlineInterval / 60000 : 10} minutes per offline roll · ${owned(item) ? offlineCap : 144} stored`;
    if (item.id === "archive-lens")
      return "Number search and tier filters across the archive";
    return "";
  }
  const owned = (item) => progress.owned.includes(item.id);
  function card(item) {
    const state = stateOf(item);
    const aura = item.kind === "aura",
      skill = item.kind === "skill",
      bay = item.kind === "skill-slot",
      equipped = aura
        ? progress.equipped === item.id
        : skill
          ? (progress.equippedSkills ?? []).includes(item.id)
          : false;
    const definition = skill ? skillById.get(item.skillId ?? item.id) : null;
    const Icon = icons[item.icon] ?? ShoppingBag;
    const shown = matches(item, state);
    if (!shown) return null;
    return (
      <article
        className={`shop-card ${aura ? "is-aura" : ""} ${state.owned ? "is-owned" : ""} ${equipped ? "is-equipped" : ""}`}
        key={item.id}
        data-product={item.id}
        data-kind={item.kind}
        data-tracked={goal?.id === item.id}
        aria-label={item.name}
        tabIndex={-1}
      >
        <div
          className={`shop-card-lead ${aura ? `aura-preview aura-${item.id}` : ""}`}
        >
          {aura ? (
            <NumberBox
              value="??????"
              tier={previewTier}
              aura={item.id}
              compact
            />
          ) : (
            <span className="shop-card-icon">
              <Icon size={20} />
            </span>
          )}
        </div>
        <div className="shop-card-main">
          <div className="shop-item-title">
            <h3>{item.name}</h3>
            <span
              className={`shop-state ${state.owned ? "is-owned" : ""} ${equipped ? "is-equipped" : ""}`}
            >
              {equipped ? "Equipped" : state.owned ? "Owned" : "Permanent"}
            </span>
          </div>
          <p className="shop-card-effect">{effectOf(item)}</p>
          <p className="shop-card-desc">
            {item.id === "offline-roller" && state.owned
              ? `One ordinary roll per ${offlineInterval / 60000} minutes away. Maximum ${offlineCap} rolls per absence; unused fractions do not carry over.`
              : item.description}
          </p>
          <div className="shop-card-tags">
            {goal?.id === item.id && (
              <span className="shop-tag is-goal">Your goal</span>
            )}
            {requiresName(item) && (
              <span className="shop-tag is-locked">
                Needs {requiresName(item)}
              </span>
            )}
            {state.profileGated && (
              <span className="shop-tag is-locked">Needs a profile</span>
            )}
            {skill && definition && (
              <span className="shop-tag">
                {skillChargeOf(progress, item.id)} / {item.charges} charged
              </span>
            )}
            {item.kind === "pace" && (
              <span className="shop-tag">
                {progress.flywheelCharge ?? 0} / {charges} charges
              </span>
            )}
          </div>
        </div>
        <div className="shop-card-buy">
          <span className="shop-price">
            <Coins size={15} />
            {formatEP(item.price)} EP
          </span>
          <button
            className={
              state.owned && !skill ? "secondary-button" : "primary-button"
            }
            disabled={
              pending ||
              (equipped && aura) ||
              (state.owned && !aura && !skill) ||
              (!state.owned &&
                !state.profileGated &&
                (!state.affordable || state.requires))
            }
            onClick={() => {
              if (state.profileGated) return openSignup();
              if (!state.owned)
                return preferences.confirmPurchases
                  ? setSelected(item)
                  : perform("buy", item.id);
              if (aura) return perform("equip", item.id);
              if (skill)
                return perform("equip-skill", item.id, { equipped: !equipped });
              return undefined;
            }}
          >
            {state.profileGated ? (
              "Sign up to unlock"
            ) : equipped ? (
              <>
                <Check size={14} /> Equipped
              </>
            ) : state.owned ? (
              aura ? (
                "Equip aura"
              ) : skill ? (
                "Equip"
              ) : (
                <>
                  <Check size={14} /> Purchased
                </>
              )
            ) : (
              `Buy for ${formatEP(item.price)} EP`
            )}
          </button>
          <small className="shop-item-note">{noteFor(item, state)}</small>
        </div>
      </article>
    );
  }
  function requiresName(item) {
    return item.requires ? productById.get(item.requires)?.name : "";
  }
  function noteFor(item, state) {
    if (state.profileGated)
      return "Offline progress needs a saved local profile.";
    if (state.requires) return `Requires ${requiresName(item)} first.`;
    if (!state.owned && !state.affordable)
      return `${formatEP(item.price - progress.balance)} more EP needed`;
    if (state.owned) {
      if (item.kind === "aura") return "Equip whenever you like.";
      if (item.kind === "skill")
        return `${skillChargeOf(progress, item.id)} / ${item.charges} charged · ${
          (progress.equippedSkills ?? []).includes(item.id)
            ? "in your rack"
            : "not in your rack yet"
        }.`;
      if (item.kind === "skill-slot")
        return `Rack size: ${item.slots} skills. Swapping is always free.`;
      if (item.kind === "utility")
        return item.id === "auto-roll"
          ? "Click the ability in the rack to turn it on."
          : item.id === "offline-roller"
            ? `Ready · one roll per ${offlineInterval / 60000} minutes away.`
            : item.id === "archive-lens"
              ? "Unlocked in History."
              : "Keeps Auto-Roll armed between visits.";
      if (item.kind === "pace")
        return `${progress.flywheelCharge ?? 0} / ${charges} charges · applies automatically.`;
      return "Maximum level reached.";
    }
    if (item.kind === "aura") return "One-time cosmetic purchase";
    return "One-time unlock · same odds and scores";
  }
  const shelfItems = (predicate) =>
    shopProducts.filter(predicate).map(card).filter(Boolean);
  const visibleCount = shopProducts.filter((item) =>
    matches(item, stateOf(item)),
  ).length;
  const affordableCount = shopProducts.filter(
    (item) => stateOf(item).affordableNow,
  ).length;
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
          <p>
            Upgrades, tools and cosmetics. Nothing here changes your odds: only
            your pace, your wallet or your looks.
          </p>
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
          <p>
            {affordableCount} items in this shop are within reach right now.
          </p>
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
            ? "Saved with your profile. Your progress towards it appears after every roll."
            : "Guest goals are temporary."}
        </small>
      </section>
      {/* One sticky bar holds the whole map: shelves, search and filters. */}
      <div className="shop-controls">
        <nav className="shop-jump" aria-label="Shop sections">
          <span className="shop-jump-label">Shelves</span>
          {SHOP_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                jumpTo(section.id);
              }}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="shop-filters" role="group" aria-label="Shop filters">
          <label className="shop-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="Search the shop"
              placeholder="Search upgrades, skills, cosmetics…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear shop search"
                onClick={() => setQuery("")}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <div className="shop-filter-chips">
            {SHOP_FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={filter === entry.id}
                className={filter === entry.id ? "active" : ""}
                onClick={() => setFilter(entry.id)}
              >
                {entry.text}
              </button>
            ))}
          </div>
          <span className="shop-filter-count" role="status">
            {visibleCount} of {shopProducts.length} items
          </span>
        </div>
      </div>
      <section
        className="shop-category skill-shelf"
        id="shop-skills"
        tabIndex={-1}
      >
        <div className="shop-section-heading">
          <div>
            <h2>
              <SkillMark size={16} /> Skills
            </h2>
            <p>
              Charged effects. A circle fills as you roll online; when it is
              full, the next roll fires it. Flywheel lives in this shelf too.
              Your rack holds {rack.slots}{" "}
              {rack.slots === 1 ? "skill" : "skills"}, and equipping or swapping
              is always free.
            </p>
          </div>
          <span className="shop-section-stat">
            {rack.used} / {rack.slots} slots used
          </span>
        </div>
        {/* The indicator of what skills are worth: every contribution, named. */}
        <div className="rack-report" aria-label="What your rack adds up to">
          <div className="rack-report-head">
            <strong>Your rack, added up</strong>
            <span>
              {rack.next.chips.length
                ? `${rack.armed.length} armed · applies to your next roll`
                : "Nothing charged yet — rolling online fills these circles."}
            </span>
          </div>
          {!!rack.next.chips.length && (
            <div className="rack-report-chips">
              {rack.next.chips.map((chip) => (
                <span className="rack-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          )}
          <div className="rack-report-columns">
            <div>
              <span className="rack-report-label">Equipped skills</span>
              {rack.equipped.length ? (
                <ul className="rack-report-list">
                  {rack.equipped.map((skill) => (
                    <li
                      key={skill.id}
                      className={skill.armed ? "is-armed" : ""}
                    >
                      <span>{skill.name}</span>
                      <span>
                        {skill.chip} · {skill.charge}/{skill.charges}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rack-report-empty">
                  No skills equipped. Buying one unlocks it for good, and it
                  takes a free slot automatically.
                </p>
              )}
            </div>
            <div>
              <span className="rack-report-label">Banked EP multiplier</span>
              <ul className="rack-report-list">
                <li className="is-total">
                  <span>Total</span>
                  <span>×{Number(rack.next.walletMultiplier.toFixed(2))}</span>
                </li>
                {rack.next.walletParts.map((part) => (
                  <li key={part.id}>
                    <span>{part.label}</span>
                    <span>×{Number(part.value.toFixed(2))}</span>
                  </li>
                ))}
                {!rack.next.walletParts.length && (
                  <li className="is-muted">
                    <span>A companion or a wallet skill raises this</span>
                    <span>×1.00</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <div className="shop-grid shop-grid-rows">
          {card(nextUpgrade(progress.owned, "pace"))}
          {shelfItems((item) => ["skill", "skill-slot"].includes(item.kind))}
        </div>
        {!shelfItems((item) => ["skill", "skill-slot"].includes(item.kind))
          .length &&
          progress.owned.includes(nextUpgrade(progress.owned, "pace")?.id) && (
            <p className="shop-empty">No skills match this filter.</p>
          )}
      </section>
      <section className="shop-category" id="shop-pace" tabIndex={-1}>
        <div className="shop-section-heading">
          <div>
            <h2>
              <PaceMark size={16} /> Pace
            </h2>
            <p>
              Shorter reveals and shorter cooldowns. One level at a time: buying
              an upgrade reveals the next one in its path. Timing is applied to
              your next roll, never to one already in flight.
            </p>
          </div>
          <span className="shop-section-stat">
            {settings.rollMS / 1000}s reveal ·{" "}
            {formatDuration(settings.cooldownMS / 1000)} cooldown
          </span>
        </div>
        <div className="shop-grid shop-grid-rows shop-grid-upgrades">
          {["roll", "cooldown"].map((kind) =>
            card(nextUpgrade(progress.owned, kind)),
          )}
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
      <section className="shop-category" id="shop-auras" tabIndex={-1}>
        <div className="shop-section-heading">
          <div>
            <h2>
              <Sparkles size={16} /> Auras
            </h2>
            <p>
              Cosmetic only, and equipped one at a time. Every aura keeps your
              rarity colour readable underneath.
            </p>
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
            Same rarity, your signature look. Existing owners get the upgraded
            effects free.
          </span>
        </div>
        <div className="shop-grid shop-grid-rows">
          {shopProducts.filter((item) => item.kind === "aura").map(card)}
        </div>
      </section>
      <PetShelf
        progress={progress}
        onAction={onAction}
        notify={notify}
        query={query}
        filter={filter}
      />
      <section className="shop-category" id="shop-tools" tabIndex={-1}>
        <div className="shop-section-heading">
          <div>
            <h2>
              <AutomationMark size={16} /> Tools
            </h2>
            <p>
              Convenience, not luck: automations and archive tools use exactly
              the same draws, odds and EP rules as pressing the button yourself.
            </p>
          </div>
        </div>
        <div className="shop-grid shop-grid-rows">
          {shopProducts.filter((p) => p.kind === "utility").map(card)}
        </div>
      </section>
      {progress.owned.includes("offline-roller") && (
        <section className="shop-category" id="shop-offline" tabIndex={-1}>
          <div className="shop-section-heading">
            <div>
              <h2>
                <OfflineMark size={16} /> Offline
              </h2>
              <p>
                Earn offline rolls sooner, and store more of them. Currently one
                roll per {offlineInterval / 60000} minutes, up to {offlineCap}{" "}
                per absence.
              </p>
            </div>
            <span className="shop-section-stat">
              {offlineInterval / 60000} min / roll · {offlineCap} max
            </span>
          </div>
          <div className="shop-grid shop-grid-rows">
            {card(nextUpgrade(progress.owned, "offline"))}
            {progress.owned.includes("offline-clock-1") &&
              card(nextUpgrade(progress.owned, "offline-cap"))}
          </div>
        </section>
      )}
      <p className="shop-save-note">
        Timing upgrades apply when you start your next roll. An active reveal or
        cooldown is not shortened by a purchase.{" "}
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
                : selected.kind === "skill"
                  ? "SKILL"
                  : selected.kind === "skill-slot"
                    ? "SKILL RACK"
                    : selected.kind === "utility"
                      ? "TOOL"
                      : "UPGRADE"}
            </p>
            <h2 id="purchase-title">Buy {selected.name}?</h2>
            <p>
              This spends <strong>{formatEP(selected.price)} EP</strong> and{" "}
              {selected.kind === "aura"
                ? "equips your new aura."
                : selected.kind === "skill"
                  ? `unlocks ${selected.name} permanently and puts it in your rack if a slot is free. It charges over ${selected.charges} completed online rolls and then fires on one roll. Offline rolls never charge it.`
                  : selected.kind === "skill-slot"
                    ? `widens your rack to ${selected.slots} skill slots. Equipping and swapping skills stays free, and existing charge is kept.`
                    : selected.kind === "utility"
                      ? selected.id === "auto-roll"
                        ? "unlocks Auto-Roll as an ability in the corner rack. One click arms it, another stands it down, and it never skips a reveal or a cooldown."
                        : selected.id === "persistence-core"
                          ? "makes Auto-Roll remember its switch after a reload and keep going while this tab is in the background. Timings, odds and settlement are unchanged."
                          : selected.id === "offline-roller"
                            ? "unlocks offline earnings: one normal roll per 10 minutes away, up to 144 rolls per absence. Calculated automatically on return; a local profile is required."
                            : "unlocks advanced history search immediately."
                      : selected.kind === "pace"
                        ? `sets Flywheel to ${selected.charges} online ${selected.charges === 1 ? "roll" : "rolls"} per charge. Earned charge carries over up to this limit; a new Flywheel starts at zero charge. Reveals and scores are unchanged.`
                        : selected.kind === "offline"
                          ? `sets future offline earnings to one ordinary roll per ${selected.value / 60000} minutes. Your ${offlineCap}-roll cap per absence is unchanged. No retroactive rewards; committed batches must finish first.`
                          : selected.kind === "offline-cap"
                            ? `stores up to ${selected.value} offline rolls per absence instead of ${selected.from}. Rates, odds and EP are unchanged, and committed batches must finish first.`
                            : "applies the upgrade to future rolls."}
            </p>
            {!!skillEffectChips(
              skillById.get(selected.skillId ?? selected.id) ?? {},
            ).length && (
              <p className="purchase-effect">
                Adds{" "}
                <strong>
                  {skillEffectChips(
                    skillById.get(selected.skillId ?? selected.id),
                  ).join(" · ")}
                </strong>
                .
              </p>
            )}
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
