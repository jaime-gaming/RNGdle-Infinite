import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Coins,
  LayoutGrid,
  Repeat,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import {
  shopProducts,
  productById,
  productUnlocked,
  productsOnShelf,
  rollSettings,
  offlineSettings,
  formatDuration,
  nextUpgrade,
  SHOP_SECTIONS,
  shelfOfProduct,
  skillStock,
  skillStockWindow,
  nextSkillStockOffset,
  SKILL_STOCK_SIZE,
  SKILL_STOCK_WINDOW_MS,
  AURA_FAMILIES,
} from "../shop-data";
import { LOADOUT_LIMIT } from "../progress.js";
import { gameNow } from "../game-clock.js";
import { pathForSubpage, pathForShelfFamily } from "../router.js";
import {
  availableGoals,
  currentGoal,
  recommendedGoal,
} from "../gameplay-loop.js";
import { rackReport } from "../rack.js";
import "../progress-links.css";
import PetShelf from "./PetShelf";
import { PETS } from "../pets.js";
import { flywheelRequired } from "../flywheel.js";
import {
  skillArmed,
  skillById,
  skillChargeOf,
  skillEffectChips,
  skillUnlocked,
} from "../skills.js";
import NumberBox from "./NumberBox";
import {
  AuraMark,
  AuroraMark,
  AutomationMark,
  BayMark,
  BedrockMark,
  BounceMark,
  ChronoMark,
  CircuitMark,
  ClockMark,
  CompanionMark,
  CoreMark,
  EclipseMark,
  EmberwakeMark,
  FlywheelMark,
  FrostglassMark,
  GlitchMark,
  LensMark,
  LumenMark,
  MonolithMark,
  NebulaMark,
  ObsidianMark,
  OfflineMark,
  OrbitMark,
  PaceMark,
  PrismMark,
  QuarryMark,
  SingularityMark,
  SkillMark,
  SolsticeMark,
  SparkMark,
  RackMark,
  HalcyonMark,
  DownpourMark,
  BlueprintMark,
  InkblotMark,
  MiserMark,
  TriptychMark,
  SpeedMark,
  StarfallMark,
  SurgeMark,
  TidepoolMark,
  TrailMark,
  TurboMark,
  TwiceMark,
  VaultMark,
  VerdantMark,
} from "./game-icons.jsx";
import { useFormatEP, useSettings } from "../use-settings.jsx";
import "../shop.css";
// Every product icon is a hand-drawn mark from game-icons.jsx: one grid, one
// stroke weight, one filled accent. No stock icon sets in the catalogue.
const icons = {
  speed: SpeedMark,
  clock: ClockMark,
  flywheel: FlywheelMark,
  stars: StarfallMark,
  aurora: AuroraMark,
  orbit: OrbitMark,
  ice: FrostglassMark,
  fire: EmberwakeMark,
  eclipse: EclipseMark,
  prism: PrismMark,
  tide: TidepoolMark,
  leaf: VerdantMark,
  circuit: CircuitMark,
  obsidian: ObsidianMark,
  singularity: SingularityMark,
  nebula: NebulaMark,
  solstice: SolsticeMark,
  lumen: LumenMark,
  glitch: GlitchMark,
  monolith: MonolithMark,
  chrono: ChronoMark,
  offline: OfflineMark,
  vault: VaultMark,
  auto: AutomationMark,
  core: CoreMark,
  lens: LensMark,
  surge: SurgeMark,
  trail: TrailMark,
  bounce: BounceMark,
  twice: TwiceMark,
  bedrock: BedrockMark,
  turbo: TurboMark,
  quarry: QuarryMark,
  miser: MiserMark,
  triptych: TriptychMark,
  bay: BayMark,
  spark: SparkMark,
  halcyon: HalcyonMark,
  downpour: DownpourMark,
  blueprint: BlueprintMark,
  inkblot: InkblotMark,
};
// The shelves come from the catalogue, so routing, the hub, the featured picks
// and the deep links all read the same list. This map only paints them.
const shelfIcons = {
  skill: SkillMark,
  pace: PaceMark,
  companion: CompanionMark,
  aura: AuraMark,
  offline: OfflineMark,
  automation: AutomationMark,
};
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
  // "" is the hub. A section id means that shelf is the page being read.
  section = "",
  // Auras own families: "" is the shelf's index of banners, an id is one set.
  family = "",
  onOpenShelf,
  onOpenFamily,
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
  const shelf = SHOP_SECTIONS.find((entry) => entry.id === section) ?? null;
  const auraFamily =
    section === "auras"
      ? (AURA_FAMILIES.find((entry) => entry.id === family) ?? null)
      : null;
  const settings = rollSettings(progress.owned);
  const { intervalMS: offlineInterval, cap: offlineCap } = offlineSettings(
    progress.owned,
  );
  const charges = flywheelRequired(progress.owned);
  const rack = rackReport(progress);
  const goal = currentGoal(progress),
    suggested = recommendedGoal(progress),
    // The same cheap-first order as the shelves themselves.
    choices = [...availableGoals(progress)].sort((a, b) => a.price - b.price);
  // The skill stall: three shop skills on sale at a time, rotating every five
  // minutes on the shared game clock, so every tab and the purchase guard
  // agree on the stock. The one-second ticker only runs on this shelf.
  const [clock, setClock] = useState(() => gameNow());
  useEffect(() => {
    if (shelf?.id !== "skills") return;
    const timer = setInterval(() => setClock(gameNow()), 1000);
    return () => clearInterval(timer);
  }, [shelf?.id]);
  const stockWindow = skillStockWindow(clock);
  const stock = skillStock(stockWindow, progress.owned);
  const stockSecondsLeft = Math.max(
    0,
    Math.ceil(((stockWindow + 1) * SKILL_STOCK_WINDOW_MS - clock) / 1000),
  );
  // The rotation is deterministic, so the upcoming stock is already known.
  const nextPair = skillStock(stockWindow + 1, progress.owned);
  // When one out-of-stock skill comes back — the moment it is on sale again,
  // not the next rotation, which may not carry it.
  function restockLabel(id) {
    const offset = nextSkillStockOffset(stockWindow, progress.owned, id);
    if (offset == null) return "Back later";
    const seconds = Math.max(
      0,
      Math.ceil(
        ((stockWindow + offset) * SKILL_STOCK_WINDOW_MS - clock) / 1000,
      ),
    );
    return `Back in ${formatDuration(seconds)}`;
  }
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
  // its prerequisite or waiting on a local profile. A skill the stall does not
  // stock right now is visible but not available.
  function stateOf(item) {
    const owned = progress.owned.includes(item.id);
    const requires = !!(
      item.requires && !progress.owned.includes(item.requires)
    );
    const profileGated = !!(item.requiresProfile && !progress.profile);
    const stocked = item.kind !== "skill" || stock.includes(item.id);
    return {
      owned,
      requires,
      profileGated,
      stocked,
      affordable: progress.balance >= item.price,
      available: !owned && !requires && !profileGated && stocked,
      affordableNow:
        !owned && !requires && stocked && progress.balance >= item.price,
    };
  }
  // An upgrade behind a purchase you have not made is not on the shelf at all.
  // The shop shows the next step of a chain, never the wall behind it, so a
  // card appears the moment it becomes buyable and not one roll earlier.
  const unlockedNow = (item) => productUnlocked(item, progress.owned);
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
  // The preview band is the card's headline: the same shape on every shelf, so
  // a glance tells you what a purchase changes before you read a word.
  function preview(item, state) {
    const Icon = icons[item.icon] ?? ShoppingBag;
    const ownedNow = state.owned;
    if (item.kind === "pace")
      return (
        <>
          <Icon size={28} />
          <span>
            <b>{item.charges}</b> {item.charges === 1 ? "roll" : "rolls"}{" "}
            <small>→</small> charged
          </span>
          <small>NEXT ROLL · ZERO COOLDOWN</small>
        </>
      );
    if (item.kind === "offline-cap")
      return (
        <>
          <Icon size={25} />
          <span>
            {item.from} <small>→</small> <b>{item.value}</b>
          </span>
          <small>OFFLINE ROLLS STORED PER ABSENCE</small>
        </>
      );
    if (item.kind === "offline")
      return (
        <>
          <Icon size={25} />
          <span>
            {item.from / 60000} min <small>→</small>{" "}
            <b>{item.value / 60000} min</b>
          </span>
          <small>OFFLINE INTERVAL · SAME ROLL CAP</small>
        </>
      );
    if (item.kind === "skill")
      return (
        <>
          <Icon size={25} />
          <span>
            <b>{item.charges}</b> {item.charges === 1 ? "roll" : "rolls"}{" "}
            <small>→</small> ready
          </span>
          <small>
            {ownedNow
              ? `${skillChargeOf(progress, item.id)} / ${item.charges} CHARGED · FIRES ON ONE ROLL`
              : "CHARGED EFFECT · FIRES ON ONE ROLL"}
          </small>
        </>
      );
    if (item.kind === "skill-slot")
      return (
        <>
          <Icon size={25} />
          <span>
            {item.from} <small>→</small> <b>{item.slots}</b>
          </span>
          <small>SKILL SLOTS · SWAPPING IS FREE</small>
        </>
      );
    if (item.kind === "utility")
      return (
        <>
          <Icon size={25} />
          <span>{item.name}</span>
          <small>
            {item.id === "auto-roll"
              ? "CLICK THE ABILITY · ROLL · REPEAT"
              : item.id === "persistence-core"
                ? "AUTO-ROLL · REMEMBERED · BACKGROUND"
                : item.id === "offline-roller"
                  ? `${ownedNow ? offlineInterval / 60000 : 10} MIN / ROLL · ${ownedNow ? offlineCap : 144} MAX`
                  : "SEARCH · FILTER · DISCOVER"}
          </small>
        </>
      );
    return (
      <>
        <Icon size={25} />
        <span>
          {item.from / 1000}s <small>→</small> <b>{item.value / 1000}s</b>
        </span>
        <small>
          {item.kind === "roll" ? "COMPLETE REVEAL" : "BETWEEN ROLLS"}
        </small>
      </>
    );
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
    // Out of the stall's current stock: still listed, dimmed under a green
    // aura, with the next restock counting down.
    const restocking = skill && !state.owned && !state.stocked;
    const definition = skill ? skillById.get(item.skillId ?? item.id) : null;
    const Icon = icons[item.icon] ?? ShoppingBag;
    // A card that is simply for sale says nothing extra: the price and the
    // button are the state. Only real states earn a chip.
    const stateLabel = equipped
      ? "Equipped"
      : state.owned
        ? "Owned"
        : restocking
          ? "Back soon"
          : skill
            ? "In stock"
            : "";
    if (!matches(item, state)) return null;
    return (
      <article
        className={`shop-card ${aura ? "is-aura" : ""} ${state.owned ? "is-owned" : ""} ${equipped ? "is-equipped" : ""} ${restocking ? "is-restocking" : ""}`}
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
              : // A skill tile wears its own tint, so the shelf reads each
                // skill's colour the same way the corner rack does.
                `upgrade-preview upgrade-${item.kind}${item.tint ? ` tint-${item.tint}` : ""}`
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
          ) : (
            preview(item, state)
          )}
        </div>
        <div className="shop-card-body">
          <div className="shop-item-title">
            {aura && item.swatch && (
              <span
                className="aura-swatch"
                aria-hidden="true"
                style={{
                  "--swatch-a": item.swatch[0],
                  "--swatch-b": item.swatch[1],
                }}
              />
            )}
            <h3>{item.name}</h3>
            {stateLabel && (
              <span
                className={`shop-state ${state.owned ? "is-owned" : ""} ${equipped ? "is-equipped" : ""} ${restocking ? "is-restocking" : ""}`}
              >
                {stateLabel}
              </span>
            )}
          </div>
          <p className="shop-card-desc">
            {item.id === "offline-roller" && state.owned
              ? `One ordinary roll per ${offlineInterval / 60000} minutes away. Maximum ${offlineCap} rolls per absence; unused fractions do not carry over.`
              : item.description}
          </p>
          {/* What the skill adds, outside the folded description so the effect
              is never the line that gets clipped: one pill per claim. */}
          {skill && definition && (
            <p className="shop-skill-effect">
              {skillEffectChips(definition).map((chip) => (
                <span className="shop-effect-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </p>
          )}
          {/* Only the cards that need a caveat carry one: a goal marker, an
              unmet prerequisite (rare now that the shelf hides those), or the
              profile gate. A prerequisite that is already met is not a caveat
              — it never renders a "Needs" tag on a card you can buy. */}
          {(goal?.id === item.id || state.requires || state.profileGated) && (
            <div className="shop-card-tags">
              {goal?.id === item.id && (
                <span className="shop-tag is-goal">Your goal</span>
              )}
              {state.requires && (
                <span className="shop-tag is-locked">
                  Needs {requiresName(item)}
                </span>
              )}
              {state.profileGated && (
                <span className="shop-tag is-locked">Needs a profile</span>
              )}
            </div>
          )}
          <div className="shop-price">
            <Coins size={15} />
            {formatEP(item.price)} EP
          </div>
          <button
            className={
              state.owned && !skill ? "secondary-button" : "primary-button"
            }
            disabled={
              pending ||
              restocking ||
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
            ) : restocking ? (
              restockLabel(item.id)
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
          {(() => {
            // The button on an out-of-stock card already says when the skill
            // returns; a second sentence under it would only repeat it.
            const note = restocking ? "" : noteFor(item, state);
            return note ? (
              <small className="shop-item-note">{note}</small>
            ) : null;
          })()}
        </div>
      </article>
    );
  }
  function requiresName(item) {
    return item.requires ? productById.get(item.requires)?.name : "";
  }
  function noteFor(item, state) {
    if (state.profileGated) return "Needs a saved local profile.";
    if (state.requires) return `Requires ${requiresName(item)} first.`;
    if (!state.owned && !state.affordable)
      return `${formatEP(item.price - progress.balance)} more EP needed`;
    if (state.owned) {
      if (item.kind === "aura") return "";
      if (item.kind === "skill") {
        if (skillArmed(progress, item.id))
          return "Ready — fires on your next roll";
        return `${skillChargeOf(progress, item.id)} / ${item.charges} charged${
          (progress.equippedSkills ?? []).includes(item.id)
            ? ""
            : " · not in your rack"
        }`;
      }
      if (item.kind === "skill-slot") return `Rack size: ${item.slots} skills.`;
      if (item.kind === "utility")
        return item.id === "auto-roll"
          ? "Arm it from the rack."
          : item.id === "offline-roller"
            ? `One roll per ${offlineInterval / 60000} minutes away.`
            : item.id === "archive-lens"
              ? "In History."
              : "Auto-Roll remembered.";
      if (item.kind === "pace")
        return `${progress.flywheelCharge ?? 0} / ${charges} charges.`;
      return "Maximum level.";
    }
    return "";
  }
  // A shelf button: a real link to its own sub-page, carrying the one number
  // that says whether it is worth opening.
  function shelfTile(entry) {
    const Icon = shelfIcons[entry.icon] ?? ShoppingBag;
    return (
      <a
        key={entry.id}
        href={pathForSubpage("shop", entry.id)}
        aria-label={entry.label}
        className="shop-tile"
        data-shelf={entry.id}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onOpenShelf(entry.id);
        }}
      >
        <span className="shop-tile-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="shop-tile-body">
          <strong>{entry.label}</strong>
          <small>{entry.blurb}</small>
        </span>
        <span className="shop-tile-stat">{sectionStat(entry)}</span>
      </a>
    );
  }
  // Every hub button answers one question: what is on that shelf right now?
  function sectionStat(section) {
    const items = productsOnShelf(section.id).filter(unlockedNow);
    if (section.id === "skills") return `${rack.used} / ${rack.slots} slots`;
    if (section.id === "pace")
      return `${settings.rollMS / 1000}s · ${formatDuration(settings.cooldownMS / 1000)}`;
    if (section.id === "companions") {
      const owned = progress.pets?.length ?? 0;
      return `${owned} / ${PETS.length} found`;
    }
    if (section.id === "offline")
      return progress.owned.includes("offline-roller")
        ? `${offlineInterval / 60000} min / roll`
        : "Locked";
    const owned = items.filter((item) =>
      progress.owned.includes(item.id),
    ).length;
    return `${owned} / ${items.length} owned`;
  }
  // The spotlight is a shop window, not a second catalogue: three picks, each
  // one a link into the shelf that sells it. Distinct by construction so the
  // same item is never advertised twice.
  const featured = (() => {
    const picks = [];
    const take = (item, label) => {
      if (item && !picks.some((pick) => pick.item.id === item.id))
        picks.push({ item, label });
    };
    const open = shopProducts.filter((item) => {
      const state = stateOf(item);
      // A featured pick must be openable: out-of-stock skills stay out of the
      // window until the stall offers them again.
      if (item.kind === "skill" && !stock.includes(item.id)) return false;
      return !state.owned && !state.requires && !state.profileGated;
    });
    // A pick already in the window is never offered twice.
    const unpicked = (items) =>
      items.filter((item) => !picks.some((pick) => pick.item.id === item.id));
    const cheapest = (items) => [...items].sort((a, b) => a.price - b.price)[0];
    take(
      currentGoal(progress),
      progress.goalId ? "Your goal" : "Recommended next",
    );
    take(
      cheapest(unpicked(open).filter((item) => stateOf(item).affordableNow)),
      "Within reach now",
    );
    take(
      cheapest(unpicked(open).filter((item) => item.kind === "aura")),
      "Cosmetic pick",
    );
    take(
      cheapest(unpicked(open).filter((item) => item.kind !== "aura")),
      "Soonest upgrade",
    );
    take(cheapest(unpicked(open)), "Saving up for");
    return picks.slice(0, 3);
  })();
  // What a shelf actually puts on screen. Pace and Offline deliberately show
  // one level per path rather than the whole track, so the status line counts
  // these, never the catalogue size: a shelf must never claim to be showing ten
  // items while two cards are drawn. Every shelf reads cheapest first.
  const byPrice = (a, b) => a.price - b.price;
  const shelfItemsNow = (() => {
    if (!shelf) return [];
    // The auras shelf is an index of four banners until a family is opened.
    if (shelf.id === "auras")
      return auraFamily
        ? productsOnShelf("auras")
            .filter((item) => item.family === auraFamily.id)
            .sort(byPrice)
        : [];
    if (shelf.id === "skills")
      // The whole skill catalogue shows cheap-first; the two the stall stocks
      // right now are buyable, the others wait dimmed under the green restock
      // aura. Flywheel and the bays are shelf fixtures.
      return [
        nextUpgrade(progress.owned, "pace"),
        ...productsOnShelf("skills").filter((item) => item.kind !== "pace"),
      ]
        .filter(Boolean)
        .sort(byPrice);
    if (shelf.id === "pace")
      return ["roll", "cooldown"]
        .map((kind) => nextUpgrade(progress.owned, kind))
        .filter(Boolean)
        .sort(byPrice);
    if (shelf.id === "offline")
      return progress.owned.includes("offline-roller")
        ? [
            nextUpgrade(progress.owned, "offline"),
            ...(progress.owned.includes("offline-clock-1")
              ? [nextUpgrade(progress.owned, "offline-cap")]
              : []),
          ]
            .filter(Boolean)
            .sort(byPrice)
        : [];
    // Companions are drawn by their own component, with their own count.
    if (shelf.id === "companions") return [];
    return productsOnShelf(shelf.id).slice().sort(byPrice);
  })().filter(unlockedNow);
  const visibleCount = shelfItemsNow.filter((item) =>
    matches(item, stateOf(item)),
  ).length;
  // Saved racks. Equipping is free, so a rack is a convenience rather than a
  // purchase: applying one can never cost EP, and a skill the account lost is
  // simply left out of the rack it applies.
  const loadouts = progress.loadouts ?? [];
  const rackIds = [...new Set(progress.equippedSkills ?? [])].filter((id) =>
    skillUnlocked(id, progress),
  );
  const rackSaved =
    !!rackIds.length &&
    loadouts.some((entry) => entry.id === `rack-${rackIds.join("+")}`);
  const loadoutOf = (entry) => ({
    ...entry,
    names: entry.skills.map((id) => skillById.get(id)?.name ?? id),
    ready: entry.skills.filter((id) => skillUnlocked(id, progress)).length,
  });
  // Auras are grouped by family. A family with nothing to show after a search
  // simply drops out, so the shelf never prints an empty heading.
  const auraGroups = AURA_FAMILIES.map((family) => ({
    family,
    items: shelfItemsNow
      .filter((item) => item.family === family.id)
      .filter((item) => matches(item, stateOf(item))),
  })).filter((group) => group.items.length);
  // A locked shelf already explains itself, and companions carry their own
  // count, so only the shelves that can go empty get this line.
  const emptyNote =
    shelf &&
    !visibleCount &&
    shelf.id !== "companions" &&
    // The auras index is never empty: its four banners are the shelf.
    !(shelf.id === "auras" && !auraFamily) &&
    !(shelf.id === "offline" && !progress.owned.includes("offline-roller"))
      ? "Nothing on this shelf matches your search and filters."
      : "";
  const affordableCount = shopProducts.filter(
    (item) => stateOf(item).affordableNow,
  ).length;
  // The three auras a family puts on its banner: the best of the set, dearest
  // first, with their colours for the gradient behind them.
  function bannerAuras(entry) {
    return productsOnShelf("auras")
      .filter((item) => item.family === entry.id)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3);
  }
  function familyBanner(entry, { link = true } = {}) {
    const samples = bannerAuras(entry);
    const owned = productsOnShelf("auras")
      .filter((item) => item.family === entry.id)
      .filter((item) => progress.owned.includes(item.id)).length;
    const total = productsOnShelf("auras").filter(
      (item) => item.family === entry.id,
    ).length;
    const body = (
      <>
        <span
          className="aura-family-gradient"
          aria-hidden="true"
          style={{
            "--banner-a": samples[0]?.swatch?.[0] ?? "var(--border)",
            "--banner-b": samples[1]?.swatch?.[1] ?? "var(--border)",
            "--banner-c": samples[2]?.swatch?.[0] ?? "var(--border)",
          }}
        />
        <span className="aura-family-copy">
          <strong
            style={{
              "--family-font": entry.font,
              "--family-tracking": entry.tracking,
              "--family-case": entry.casing,
              "--family-weight": entry.weight,
            }}
          >
            {entry.label}
          </strong>
          <small>{entry.blurb}</small>
          <span className="aura-family-count">
            {owned} / {total} yours{link ? " · open the set" : ""}
          </span>
        </span>
        <span className="aura-family-samples" aria-hidden="true">
          {samples.map((aura) => (
            <NumberBox
              key={aura.id}
              value="??????"
              tier={previewTier}
              aura={aura.id}
              compact
            />
          ))}
        </span>
      </>
    );
    return link ? (
      <a
        key={entry.id}
        href={pathForShelfFamily("shop", "auras", entry.id)}
        className="aura-family-banner"
        data-family={entry.id}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onOpenFamily(entry.id);
        }}
      >
        {body}
      </a>
    ) : (
      <div
        className="aura-family-banner is-open"
        key={entry.id}
        data-family={entry.id}
      >
        {body}
      </div>
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
          <p>
            Upgrades, tools and cosmetics. Nothing here changes your odds: only
            your pace, your wallet or your looks.
          </p>
        </div>
      </div>
      {/* A shelf is its own page, so it says where it sits in the shop. */}
      {shelf && (
        <nav className="shop-crumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => onOpenShelf("")}>
            Shop
          </button>
          <ChevronRight size={13} aria-hidden="true" />
          {auraFamily ? (
            <>
              <button type="button" onClick={() => onOpenShelf("auras")}>
                {shelf.label}
              </button>
              <ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page">{auraFamily.label}</span>
            </>
          ) : (
            <span aria-current="page">{shelf.label}</span>
          )}
        </nav>
      )}
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
      {/* The shop's own page is the index: one button per shelf, each a real
          link to a real sub-page, each carrying the number that tells you
          whether it is worth opening. The shelves themselves live on their
          own pages. */}
      {!shelf && (
        <>
          <section className="shop-hub" id="shop-hub" aria-label="Shop shelves">
            <div className="shop-section-heading">
              <div>
                <h2>
                  <LayoutGrid size={16} /> Pick a shelf
                </h2>
                <p>
                  {shopProducts.length} things to buy,{" "}
                  {
                    shopProducts.filter((item) =>
                      progress.owned.includes(item.id),
                    ).length
                  }{" "}
                  already yours.
                </p>
              </div>
              <span className="shop-section-stat">Shop · /shop</span>
            </div>
            <nav className="shop-jump" aria-label="Shop sections">
              {SHOP_SECTIONS.map(shelfTile)}
            </nav>
          </section>
          {/* A shop window, not a second catalogue: three picks that link into the
          shelf that sells them, so nothing is listed twice. */}
          {!!featured.length && (
            <section
              className="shop-featured"
              aria-label="Featured items"
              id="shop-featured"
            >
              <div className="shop-section-heading">
                <div>
                  <h2>
                    <SparkMark size={16} /> Featured for you
                  </h2>
                  <p>Three picks from your wallet and your goal.</p>
                </div>
              </div>
              <div className="shop-spotlight">
                {featured.map(({ item, label }) => {
                  const Icon = icons[item.icon] ?? ShoppingBag;
                  const held =
                    item.price > 0
                      ? Math.min(
                          100,
                          Math.round((progress.balance / item.price) * 100),
                        )
                      : 0;
                  return (
                    <a
                      key={item.id}
                      className="spotlight"
                      href={pathForSubpage("shop", shelfOfProduct(item))}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey)
                          return;
                        event.preventDefault();
                        onOpenShelf(shelfOfProduct(item));
                      }}
                    >
                      <span className="spotlight-art" aria-hidden="true">
                        {item.kind === "aura" ? (
                          <NumberBox
                            value="??????"
                            tier={previewTier}
                            aura={item.id}
                            compact
                          />
                        ) : (
                          <span className="spotlight-chip">
                            <Icon size={24} />
                          </span>
                        )}
                      </span>
                      <span className="spotlight-body">
                        <span className="spotlight-label">{label}</span>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                        <span className="spotlight-meter">
                          <i style={{ width: `${held}%` }} />
                        </span>
                        <span className="spotlight-cta">
                          <span className="spotlight-price">
                            {progress.balance >= item.price
                              ? `Ready now · ${formatEP(item.price)} EP`
                              : `${formatEP(item.price - progress.balance)} EP to go`}
                          </span>
                          <span className="spotlight-open">
                            Open{" "}
                            {SHOP_SECTIONS.find(
                              (section) => section.id === shelfOfProduct(item),
                            )?.label ?? "shop"}
                            <ChevronRight size={12} />
                          </span>
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
      {/* One sticky bar per shelf: search, filters and the way back. */}
      {shelf && (
        <div className="shop-controls">
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
            <button
              type="button"
              className="shop-back"
              onClick={() => onOpenShelf("")}
            >
              <LayoutGrid size={14} /> All shelves
            </button>
            <span className="shop-filter-count" role="status">
              {shelf.id === "companions"
                ? `${progress.pets?.length ?? 0} / ${PETS.length} found`
                : shelf.id === "auras" && !auraFamily
                  ? // The index has no cards to count — its four banners are
                    // the shelf, so it counts sets instead of calling itself
                    // locked.
                    `${AURA_FAMILIES.length} sets · ${productsOnShelf("auras").length} looks`
                  : !shelfItemsNow.length
                    ? // A locked shelf has nothing to count; its own panel says
                      // why, and a second "0 of 0" would only be noise.
                      "Locked"
                    : `${visibleCount} of ${shelfItemsNow.length} on this shelf`}
            </span>
          </div>
        </div>
      )}
      {shelf?.id === "skills" && (
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
                Charged effects: fill the circle, the next roll fires it. The
                stall stocks {SKILL_STOCK_SIZE} at a time and rotates every five
                minutes; equipping is always free.
              </p>
            </div>
            <span className="shop-section-stat">
              {rack.used} / {rack.slots} slots used
            </span>
          </div>
          {/* The stall itself: how full, and when the stock rotates. */}
          <div
            className={`skill-stock ${stock.length ? "" : "is-empty"}`}
            role="status"
          >
            <Repeat size={14} aria-hidden="true" />
            {stock.length ? (
              <span>
                <strong>
                  {stock.length} of {SKILL_STOCK_SIZE} in stock
                </strong>
                {" · new stock in "}
                <b data-testid="skill-stock-timer">
                  {formatDuration(stockSecondsLeft)}
                </b>
                {/* The rotation is deterministic, so the stock that replaces
                    this one is already knowable — say it. */}
                {!!nextPair.length && (
                  <em className="skill-stock-next">
                    {" · next: "}
                    {nextPair
                      .map((id) => skillById.get(id)?.name ?? id)
                      .join(", ")}
                  </em>
                )}
              </span>
            ) : (
              <span>You own every shop skill.</span>
            )}
          </div>
          {/* What the rack adds up to is stated once — in the Σ panel of the
              skill bar — not repeated here. */}
          {(!!loadouts.length || !!rackIds.length) && (
            <div className="skill-racks" aria-labelledby="skill-racks-title">
              <div className="skill-racks-head">
                <h3 id="skill-racks-title">
                  <RackMark size={14} /> Saved racks
                </h3>
                <p>
                  Swapping skills is free, so a rack you like is worth keeping:
                  one click puts the whole set back. They belong to the run — a
                  rebirth clears them with the skills that paid for them.
                </p>
                <span className="skill-racks-count">
                  {loadouts.length} of {LOADOUT_LIMIT} saved
                </span>
              </div>
              <div className="skill-rack-row">
                {loadouts.map((entry) => {
                  const rack = loadoutOf(entry);
                  const partial = rack.ready < entry.skills.length;
                  return (
                    <span
                      className={`skill-rack ${partial ? "is-partial" : ""}`}
                      key={entry.id}
                    >
                      <button
                        type="button"
                        className="skill-rack-apply"
                        disabled={pending || !rack.ready}
                        onClick={() => perform("apply-loadout", entry.id)}
                      >
                        <strong>{entry.name}</strong>
                        <small>
                          {partial
                            ? `${rack.ready} of ${entry.skills.length} unlocked`
                            : rack.names.join(" · ")}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="skill-rack-delete"
                        aria-label={`Delete ${entry.name}`}
                        disabled={pending}
                        onClick={() => perform("delete-loadout", entry.id)}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    pending ||
                    !rackIds.length ||
                    rackSaved ||
                    loadouts.length >= LOADOUT_LIMIT
                  }
                  onClick={() => perform("save-loadout")}
                >
                  {rackSaved
                    ? "This rack is saved"
                    : loadouts.length >= LOADOUT_LIMIT
                      ? "Rack book full"
                      : "Save this rack"}
                </button>
              </div>
            </div>
          )}
          <div className="shop-grid shop-grid-rows">
            {shelfItemsNow.map(card)}
          </div>
        </section>
      )}
      {shelf?.id === "pace" && (
        <section className="shop-category" id="shop-pace" tabIndex={-1}>
          <div className="shop-section-heading">
            <div>
              <h2>
                <PaceMark size={16} /> Pace
              </h2>
              <p>
                Shorter reveals and cooldowns, one level at a time; a purchase
                applies to your next roll.
              </p>
            </div>
            <span className="shop-section-stat">
              {settings.rollMS / 1000}s reveal ·{" "}
              {formatDuration(settings.cooldownMS / 1000)} cooldown
            </span>
          </div>
          <div className="shop-grid shop-grid-rows shop-grid-upgrades">
            {shelfItemsNow.map(card)}
          </div>
        </section>
      )}
      {shelf?.id === "auras" && (
        <section className="shop-category" id="shop-auras" tabIndex={-1}>
          <div className="shop-section-heading">
            <div>
              <h2>
                <AuraMark size={16} /> Auras
              </h2>
              <p>
                {auraFamily
                  ? `One set of the shelf. ${auraGroups[0]?.items.length ?? 0} looks, cosmetic only.`
                  : "Four sets, cosmetic only; wear one at a time."}
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
            <span>Same rarity — your look.</span>
          </div>
          {/* The index: one banner per family, each one a real page. */}
          {!auraFamily && (
            <div className="aura-family-banners">
              {AURA_FAMILIES.map((entry) => familyBanner(entry))}
            </div>
          )}
          {/* Inside a family: its banner opens the page, its cards follow. */}
          {auraFamily && (
            <>
              {familyBanner(auraFamily, { link: false })}
              {auraGroups.map((group) => (
                <div className="shop-family" key={group.family.id}>
                  <div className="shop-family-heading">
                    <h3>Every {group.family.label.toLowerCase()} look</h3>
                    <p>{group.family.blurb}</p>
                    <span className="shop-family-stat">
                      {
                        group.items.filter((item) =>
                          progress.owned.includes(item.id),
                        ).length
                      }
                      {" / "}
                      {group.items.length} yours
                    </span>
                  </div>
                  <div className="shop-grid shop-grid-rows">
                    {group.items.map(card)}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      )}
      {shelf?.id === "companions" && (
        <PetShelf
          progress={progress}
          onAction={onAction}
          notify={notify}
          query={query}
          filter={filter}
        />
      )}
      {shelf?.id === "tools" && (
        <section className="shop-category" id="shop-tools" tabIndex={-1}>
          <div className="shop-section-heading">
            <div>
              <h2>
                <AutomationMark size={16} /> Tools
              </h2>
              <p>
                Automation and archive tools. Same draws, odds and EP as rolling
                yourself.
              </p>
            </div>
          </div>
          <div className="shop-grid shop-grid-rows">
            {shelfItemsNow.map(card)}
          </div>
        </section>
      )}
      {shelf?.id === "offline" && (
        <section className="shop-category" id="shop-offline" tabIndex={-1}>
          {progress.owned.includes("offline-roller") ? (
            <>
              <div className="shop-section-heading">
                <div>
                  <h2>
                    <OfflineMark size={16} /> Offline
                  </h2>
                  <p>Earn offline rolls sooner, and store more per absence.</p>
                </div>
                <span className="shop-section-stat">
                  {offlineInterval / 60000} min / roll · {offlineCap} max
                </span>
              </div>
              <div className="shop-grid shop-grid-rows">
                {shelfItemsNow.map(card)}
              </div>
            </>
          ) : (
            // Nothing on this shelf can be bought before the roller exists, so
            // the page says exactly which door to open instead of guessing.
            <div className="shop-section-heading shop-locked-heading">
              <div>
                <h2>
                  <OfflineMark size={16} /> Offline
                </h2>
                <p>
                  Locked. The Offline Roller in Tools unlocks earning while you
                  are away.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenShelf("tools")}
              >
                <AutomationMark size={14} /> Open Tools
              </button>
            </div>
          )}
        </section>
      )}
      {emptyNote && <p className="shop-empty">{emptyNote}</p>}
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
      {/* Leaving a shelf is one click: the other five, with their own numbers. */}
      {shelf && (
        <nav className="shop-others" aria-label="Other shelves">
          <span className="shop-others-label">Other shelves</span>
          <div className="shop-jump">
            {SHOP_SECTIONS.filter((entry) => entry.id !== shelf.id).map(
              shelfTile,
            )}
          </div>
        </nav>
      )}
      <p className="shop-save-note">
        Purchases cost in-game EP only, and they are yours until you rebirth.{" "}
        {progress.profile
          ? `Saved locally as ${progress.profile.username}.`
          : "Sign up to keep your wallet across reloads."}
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
              KEPT TILL REBIRTH{" "}
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
                  ? `unlocks ${selected.name} until you rebirth — it charges over ${selected.charges} online rolls, then fires once.`
                  : selected.kind === "skill-slot"
                    ? `widens your rack to ${selected.slots} slots; existing charge is kept.`
                    : selected.kind === "utility"
                      ? selected.id === "auto-roll"
                        ? "adds Auto-Roll to the rack: one click arms it, one stands it down."
                        : selected.id === "persistence-core"
                          ? "lets Auto-Roll remember its switch and run in background tabs."
                          : selected.id === "offline-roller"
                            ? "earns one roll per 10 minutes away, up to 144 per absence. A local profile is required."
                            : "unlocks advanced history search."
                      : selected.kind === "pace"
                        ? `sets Flywheel to ${selected.charges} online ${selected.charges === 1 ? "roll" : "rolls"} per charge.`
                        : selected.kind === "offline"
                          ? `earns one offline roll per ${selected.value / 60000} minutes; the ${offlineCap}-roll cap stays.`
                          : selected.kind === "offline-cap"
                            ? `stores up to ${selected.value} offline rolls per absence.`
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
