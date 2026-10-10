import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ShoppingBag,
  History,
  Medal,
  Infinity as InfinityIcon,
  Sun,
  Moon,
  Monitor,
  LogIn,
  Link2,
  CircleHelp,
  ArrowUpRight,
  ArrowRight,
  X,
  Search,
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal,
  ScrollText,
  UserRound,
  Sparkles,
  ListChecks,
} from "lucide-react";
import { badges, badgeGroups, rarities } from "./badges";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./styles.css";
import "./ambient.css";
import Emoji from "./components/Emoji";
import RollExperience from "./components/RollExperience";
import { POPULATION, chanceLabels } from "./probability";
import Rebirth from "./components/Rebirth";
import Shop from "./components/Shop";
import { useProgress } from "./use-progress";
import "./shop.css";
import LocalProfile, { AvatarMark } from "./components/LocalProfile";
import DeviceLinkPanel from "./components/DeviceLink.jsx";
import { useOffline } from "./use-offline";
import OfflineRewards from "./components/OfflineRewards";
import ActivityFeed from "./components/ActivityFeed";
import Tasks from "./components/Tasks";
import { taskSummary } from "./tasks.js";
import { TASKS_GLITCH_DURATION_MS, tasksGlitchDelay } from "./tasks-glitch.js";
import { freshRareBadges, newlyReady } from "./notice-rules.js";
import { badgeMetadata } from "./roll-data.js";
import { HISTORY_LIMIT, HISTORY_WARNING } from "./history-log.js";
import Settings from "./components/Settings";
import { SettingsProvider } from "./use-settings.jsx";
import { useReadyAlert } from "./use-ready-alert.js";
import { petDrop, petById } from "./pets.js";
import { goalItem } from "./gameplay-loop.js";
import {
  rebirthUnlocked,
  rebirthReady,
  rollbackAvailable,
  ultraRebirthAvailable,
} from "./rebirth.js";
import { gameNow } from "./game-clock.js";
import { skillPetLuck, skillById } from "./skills.js";
import { randomUnit } from "./random.js";
import Changelog from "./components/Changelog";
import {
  BadgeMark,
  CompanionMark,
  CreatureIcon,
  InfinityMark,
  SkillMark,
  RollMark,
} from "./components/game-icons.jsx";
import Toasts from "./components/Toasts";
import { useToasts } from "./use-toasts.js";
import RebirthNav from "./components/RebirthNav";
import MobileTabBar from "./components/MobileTabBar";
import InstallApp from "./components/InstallApp";
import About from "./components/About";
import {
  LATEST_VERSION,
  readSeenVersion,
  hasUnseenVersion,
  markSeen,
} from "./changelog.js";
import {
  pageFromLocation,
  pathForPage,
  pathForSubpage,
  pathForShelfFamily,
  subpageFromLocation,
  familyFromLocation,
  isCurrentPath,
  validPage,
} from "./router.js";
import {
  SHOP_SECTIONS,
  AURA_FAMILIES,
  shelfOfProduct,
  productById,
} from "./shop-data.js";
import { joinDeviceLink, resumeDeviceLink, subscribeSync } from "./sync.js";

// A shelf is a real sub-page: /shop, /shop/skills, /shop/auras and so on.
// Anything else under /shop is not a shelf and falls back to the hub.
// Only the auras shelf owns families, and only a family that exists counts.
function shopFamilyFromLocation(target) {
  // The router only reads a family off the auras shelf.
  const family = familyFromLocation(target);
  return AURA_FAMILIES.some((entry) => entry.id === family) ? family : "";
}

// Settings owns one sub-page of its own: /settings/link, the device link and
// its technical details. Anything else under /settings is the settings list.
export const SETTINGS_SECTIONS = ["link"];
function settingsSectionFromLocation(target) {
  if (pageFromLocation(target) !== "settings") return "";
  const named = subpageFromLocation(target);
  return SETTINGS_SECTIONS.includes(named) ? named : "";
}

function shopSectionFromLocation(target) {
  if (pageFromLocation(target) !== "shop") return "";
  // A legacy "#auras" bookmark names the shelf itself; a real sub-page carries
  // it in the path. Anything else lands on the hub.
  const named = (name) =>
    SHOP_SECTIONS.some((section) => section.id === name) ? name : "";
  const hash = String(target.hash || "").replace(/^#/, "");
  return named(hash) || named(subpageFromLocation(target));
}

// Used by the notices: a badge's rarity as the game writes it.
const NO_BADGES = [];
const RARITY_NAME = {
  epic: "Epic",
  anomaly: "Anomaly",
  mythic: "Mythic",
  godly: "GODLY",
};

function App() {
  const [page, setPage] = useState(() => pageFromLocation(location));
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("rng-theme");
      return ["light", "dark", "system"].includes(saved) ? saved : "light";
    } catch {
      return "light";
    }
  });
  const [appliedTheme, setAppliedTheme] = useState(
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme,
  );
  const [seenVersion, setSeenVersion] = useState(readSeenVersion);
  const showVersionFlag = hasUnseenVersion(seenVersion);
  const [shopFocus, setShopFocus] = useState(null);
  const [shopSection, setShopSection] = useState(() =>
    shopSectionFromLocation(location),
  );
  const [settingsSection, setSettingsSection] = useState(() =>
    settingsSectionFromLocation(location),
  );
  const [shopFamily, setShopFamily] = useState(() =>
    shopFamilyFromLocation(location),
  );
  // Goal picking is armed from the shop's goal banner; the state lives here so
  // it survives shelf changes (the Shop remounts on every sub-page).
  const [pickingGoal, setPickingGoal] = useState(false);
  // One short Tasks-only glitch, scheduled at a fresh random interval after the
  // previous one has finished, so occurrences can never overlap.
  const [tasksGlitchActive, setTasksGlitchActive] = useState(false);
  useEffect(() => {
    let nextTimer = null;
    let finishTimer = null;
    let stopped = false;
    const schedule = () => {
      nextTimer = setTimeout(() => {
        if (stopped) return;
        setTasksGlitchActive(true);
        finishTimer = setTimeout(() => {
          if (stopped) return;
          setTasksGlitchActive(false);
          schedule();
        }, TASKS_GLITCH_DURATION_MS);
      }, tasksGlitchDelay());
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(nextTimer);
      clearTimeout(finishTimer);
    };
  }, []);
  const [modal, setModal] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState(null);
  // Notices: a short stack of cards, one per thing that just happened. See
  // use-toasts.js; `notify` takes a plain line or a kinded, titled notice.
  const { toasts, notify, dismiss: dismissToast } = useToasts();
  // A prestige (the ultra-rebirth in the save) earns a moment, and so does the
  // Rollback, the last stage, in its own words. The ceremony is a full-screen
  // moment that lives in the app shell (the rebirth page navigates away the
  // moment it succeeds), plays over whatever is on screen, then removes itself.
  // Pointer-transparent and animation-driven — reduced motion never sees it.
  // The state names the moment: "prestige", "rollback", or null for none.
  const [ultraCeremony, setUltraCeremony] = useState(null);
  useEffect(() => {
    if (!ultraCeremony) return;
    const timer = setTimeout(() => setUltraCeremony(null), 2700);
    return () => clearTimeout(timer);
  }, [ultraCeremony]);
  // A plain rebirth earns a smaller moment: a spinning rainbow ring over the
  // new cycle, in the app shell for the same reason, gone by itself.
  const [rebirthRing, setRebirthRing] = useState(false);
  useEffect(() => {
    if (!rebirthRing) return;
    const timer = setTimeout(() => setRebirthRing(false), 3300);
    return () => clearTimeout(timer);
  }, [rebirthRing]);
  // The home-screen app: registering the (pass-through) service worker is
  // part of the install criteria on some browsers.
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(() => {});
  }, []);
  // A companion found on a roll walks in with its own moment on the roll stage.
  const [arrivalPet, setArrivalPet] = useState(null);
  const {
    progress: session,
    warning: progressWarning,
    dispatch,
    epoch,
  } = useProgress();
  // Device links: ?sync=ROOM.KEY joins this browser to another device's
  // account through the memory-only relay, then leaves the address bar. A
  // reload of a browser already in a room simply reopens the stream, and the
  // first live pairing (or a lost relay) is announced once, in the toast.
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("sync");
    if (token) {
      const url = new URL(location.href);
      url.searchParams.delete("sync");
      history.replaceState(
        history.state,
        "",
        url.pathname + url.search + url.hash,
      );
      joinDeviceLink(token);
    } else {
      resumeDeviceLink();
    }
    let announced = "";
    return subscribeSync((state, note) => {
      if (state === "live" && announced !== "live") {
        announced = "live";
        notify({
          kind: "milestone",
          title: "Devices linked",
          text: "Both devices now play the same account, live.",
        });
      } else if (state === "error" && announced !== "error") {
        announced = "error";
        notify({ kind: "error", text: note || "The device link was lost." });
      } else if (state !== "error") announced = state;
    });
  }, []);
  useEffect(() => {
    setModal(null);
    setShopFocus(null);
    setSelectedBadge(null);
    setSearch("");
    setRarity("All rarities");
    setGroup("All sets");
    setSort("Default");
    setPickingGoal(false);
  }, [epoch]);
  async function completeRoll(result, id, cooldownUntil) {
    // Companion luck is sampled here, independently of the number itself.
    let drop = null;
    try {
      // Trail and Drift widen the companion window for the roll they fire on.
      // It is still its own sample, drawn after the number, so it can never
      // bias the roll itself.
      drop = petDrop(
        randomUnit(),
        session.pets,
        skillPetLuck(session.pendingRoll?.skills),
      );
    } catch {}
    const outcome = await dispatch({
      type: "complete",
      result,
      id,
      cooldownUntil,
      ...(drop ? { petDrop: drop } : {}),
    });
    // Rolling counts as getting on with the game, so the flag stops nagging.
    if (outcome.ok && showVersionFlag) {
      markSeen();
      setSeenVersion(LATEST_VERSION);
    }
    if (outcome.ok && outcome.eventRewards?.length) {
      const names = outcome.eventRewards
        .map((aura) => productById.get(aura)?.name)
        .filter(Boolean);
      if (names.length)
        notify({
          kind: "milestone",
          title:
            names.length === 1
              ? `${names[0]} unlocked`
              : "R4ND0MN3S5 signal restored",
          text: `${names.join(", ")} ${names.length === 1 ? "was" : "were"} added to your aura collection for free.`,
          icon: <Sparkles size={18} aria-hidden="true" />,
        });
    }
    if (outcome.ok && drop) {
      notify({
        kind: "milestone",
        title: "New companion",
        text: `${petById.get(drop).name} joined you and multiplies the EP you bank.`,
        icon: <CreatureIcon pet={drop} size={18} />,
      });
      setArrivalPet(drop);
      clearTimeout(arrivalTimer.current);
      arrivalTimer.current = setTimeout(() => setArrivalPet(null), 5600);
    }
    if (!outcome.ok) notify({ kind: "error", text: outcome.message });
    return outcome;
  }
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All rarities");
  const [group, setGroup] = useState("All sets");
  const [sort, setSort] = useState("Default");
  const arrivalTimer = useRef(null);
  const previousFocus = useRef(null);
  const modalRef = useRef(null);
  // The log's space warnings are announced once, when a roll or a claim carries
  // it across a level. An account that loads already past a level stays quiet:
  // the History page shows the warning for as long as it applies.
  const historySize = session.history?.length ?? 0;
  const lastHistorySize = useRef(historySize);
  useEffect(() => {
    const before = lastHistorySize.current;
    lastHistorySize.current = historySize;
    const openHistory = {
      label: "Open History",
      onSelect: () => navigate("history"),
    };
    if (before < HISTORY_LIMIT && historySize >= HISTORY_LIMIT)
      notify({
        kind: "warning",
        title: "Entry space is full",
        text: "The oldest entries now make room for new rolls.",
        action: openHistory,
      });
    else if (before < HISTORY_WARNING && historySize >= HISTORY_WARNING)
      notify({
        kind: "warning",
        title: "Low entry space",
        text: "Open History to bulk delete old entries.",
        action: openHistory,
      });
  }, [historySize]);
  // Two things the player waits for earn a notice when they first appear: a
  // task that can be claimed, and a badge of Epic or better. The first load is
  // quiet, and one roll that finishes several things is one notice. The badge
  // notice stays off the roll page, where the result already shows the badges.
  const readyTasks = taskSummary(session.tasks, gameNow()).ready;
  const lastReadyTasks = useRef(readyTasks);
  useEffect(() => {
    const rose = newlyReady(lastReadyTasks.current, readyTasks);
    lastReadyTasks.current = readyTasks;
    if (rose > 0 && page !== "tasks")
      notify({
        kind: "milestone",
        title:
          readyTasks === 1
            ? "Task ready to claim"
            : `${readyTasks} tasks ready to claim`,
        text: "The reward waits on the Tasks page.",
        action: { label: "Open Tasks", onSelect: () => navigate("tasks") },
      });
  }, [readyTasks]);
  const discovered = session.discovered ?? NO_BADGES;
  const lastDiscovered = useRef(discovered);
  useEffect(() => {
    const fresh = freshRareBadges(lastDiscovered.current, discovered, (id) =>
      badgeMetadata.get(id),
    );
    lastDiscovered.current = discovered;
    if (page === "roll" || !fresh.length) return;
    const names = fresh.map((badge) => badge.name);
    notify({
      kind: "milestone",
      title:
        fresh.length === 1
          ? `${RARITY_NAME[fresh[0].rarity]} badge found`
          : `${fresh.length} rare badges found`,
      text: names.join(", "),
      action: { label: "Open Badges", onSelect: () => navigate("badges") },
    });
  }, [discovered]);
  // Real URLs, so a page and its shelf can be linked, bookmarked and reloaded
  // directly. The address bar is the source of truth, never component state.
  const push = (target, path, section = "") => {
    const here = new URL(path, location.origin).pathname;
    if (here !== location.pathname || location.hash)
      history.pushState({ page: target, section }, "", path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openLinkSettings = () => {
    setSettingsSection("link");
    setPage("settings");
    push("settings", pathForSubpage("settings", "link"), "link");
  };
  const navigate = (next, focusProduct = null) => {
    const target = validPage(next);
    // The device link is a page of its own under Settings: "settings" with the
    // link section named lands there, everything else lands on the list.
    if (target === "settings" && focusProduct === "link") {
      openLinkSettings();
      return;
    }
    // Leaving the shop disarms goal picking: it belongs to the shop floor.
    if (target !== "shop") setPickingGoal(false);
    setSettingsSection("");
    // Opening the shop on a product or a companion (a goal link, a recap) opens
    // the shelf that sells it, so the card is on screen when the page renders.
    const section =
      target === "shop" && goalItem(focusProduct)
        ? shelfOfProduct(goalItem(focusProduct))
        : "";
    setShopFocus(target === "shop" ? focusProduct : null);
    setShopSection(section);
    setPage(target);
    push(
      target,
      target === "shop" && section
        ? pathForSubpage("shop", section)
        : pathForPage(target),
      section,
    );
  };
  const openShelf = (id, focus = null) => {
    const section = SHOP_SECTIONS.some((entry) => entry.id === id) ? id : "";
    setShopFocus(focus);
    setShopSection(section);
    setShopFamily("");
    setPage("shop");
    push(
      "shop",
      section ? pathForSubpage("shop", section) : pathForPage("shop"),
      section,
    );
  };
  const openFamily = (id) => {
    const family = AURA_FAMILIES.some((entry) => entry.id === id) ? id : "";
    setShopFocus(null);
    setShopSection("auras");
    setShopFamily(family);
    setPage("shop");
    push("shop", pathForShelfFamily("shop", "auras", family), "auras");
  };
  useEffect(() => {
    // Back/forward must move between pages, and a legacy #shop link or a
    // 404.html fallback landing must be normalised to its real path once.
    const update = () => {
      setPage(pageFromLocation(location));
      setShopSection(shopSectionFromLocation(location));
      setShopFamily(shopFamilyFromLocation(location));
      setSettingsSection(settingsSectionFromLocation(location));
    };
    update();
    const landed = pageFromLocation(location);
    const section = shopSectionFromLocation(location);
    const family = shopFamilyFromLocation(location);
    const settingsSub = settingsSectionFromLocation(location);
    // A legacy "#shop" bookmark keeps working, a "#skills" one lands on the
    // shelf, and an unknown sub-path is normalised back to the shop hub.
    if (
      location.hash ||
      !isCurrentPath(landed, location) ||
      (landed === "shop" && subpageFromLocation(location) !== section) ||
      (landed === "settings" &&
        subpageFromLocation(location) !== settingsSub) ||
      (section === "auras" && familyFromLocation(location) !== family)
    )
      history.replaceState(
        { page: landed, section, family },
        "",
        landed === "shop" && section
          ? pathForShelfFamily("shop", section, family)
          : landed === "settings" && settingsSub
            ? pathForSubpage("settings", settingsSub)
            : pathForPage(landed),
      );
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      setAppliedTheme(resolved);
    };
    update();
    try {
      localStorage.setItem("rng-theme", theme);
    } catch {}
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(
    () => () => {
      clearTimeout(arrivalTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!modal) return;
    previousFocus.current = document.activeElement;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector("button, input")?.focus();
    const handleKey = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...modalRef.current.querySelectorAll("button, input, a, select"),
        ].filter((el) => !el.disabled);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
      previousFocus.current?.focus();
    };
  }, [modal]);
  function openBadge(badge) {
    const catalogueBadge = badges.find((b) => b.name === badge.name);
    setSelectedBadge(
      catalogueBadge || {
        ...badge,
        rarity: badge.rarity[0].toUpperCase() + badge.rarity.slice(1),
        groups: ["No Set"],
      },
    );
    setModal("badge");
  }
  // Profile is a page (/profile), not a window: every "sign up" prompt in the
  // game simply navigates there, and the page remembers itself in the URL.
  function openAuth() {
    navigate("profile");
  }
  const offlineState = useOffline(session, dispatch);
  // One alert per finished cooldown, and never while a roll is still revealing.
  useReadyAlert(session.cooldownUntil, {
    blocked: !!session.pendingRoll || !!session.offline?.batch,
  });
  const rebirthVisible = rebirthUnlocked(session);
  // A ready task shows a dot in the header and the tab bar, until it is claimed.
  const tasksReady = taskSummary(session.tasks, gameNow()).ready > 0;
  // The mobile tab bar marks the rebirth tab ready the moment either a rung
  // or a prestige or the Rollback is available.
  const rebirthReadyNow =
    rebirthVisible &&
    (rebirthReady(session, gameNow()) ||
      ultraRebirthAvailable(session, gameNow()) ||
      rollbackAvailable(session, gameNow()));
  // A direct link to a page that has not been unlocked yet simply goes home:
  // no locked panel, no counter, nothing to explain the mystery early.
  useEffect(() => {
    if (page === "rebirth" && !rebirthVisible) navigate("roll");
  }, [page, rebirthVisible]);
  const discoveredBadges = badges.filter((b) =>
    session.discovered.includes(b.canonicalId),
  );
  const discoveredGroups = [
    ...new Set(discoveredBadges.flatMap((b) => b.groups)),
  ];
  const filteredBadges = discoveredBadges
    .filter(
      (b) =>
        (b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.groups.some((g) =>
            g.toLowerCase().includes(search.toLowerCase()),
          )) &&
        (rarity === "All rarities" || b.rarity === rarity) &&
        (group === "All sets" || b.groups.includes(group)),
    )
    .sort((a, b) =>
      sort === "A–Z"
        ? a.name.localeCompare(b.name)
        : sort === "Rarest first"
          ? rarities.indexOf(b.rarity) - rarities.indexOf(a.rarity)
          : 0,
    );
  return (
    <>
      <header className="header">
        <div className="header-left">
          <button
            className="wordmark"
            aria-label="RNGdle Infinite home"
            onClick={() => navigate("roll")}
          >
            <span className="brand-name">
              <span className="brand-title">
                RNG<span>dle</span>
              </span>
              <span className="brand-edition">INFINITE</span>
            </span>
          </button>
          <div className="nav-divider" />
          <nav aria-label="Main navigation">
            {[
              ["shop", "Shop", ShoppingBag],
              ["tasks", "Tasks", ListChecks],
              ["badges", "Badges", Medal],
              ["history", "History", History],
            ].map(([destination, label, Icon]) => (
              <button
                key={destination}
                aria-label={
                  destination === "tasks" && tasksReady
                    ? "Tasks, ready to claim"
                    : label
                }
                aria-current={page === destination ? "page" : undefined}
                className={`${page === destination ? "active" : ""} ${destination === "tasks" ? "tasks-nav-glitch" : ""}`}
                onClick={() => navigate(destination)}
              >
                <Icon size={16} />
                <span
                  className={
                    destination === "tasks"
                      ? `tasks-nav-glitch-label${tasksGlitchActive ? " is-glitching" : ""}`
                      : undefined
                  }
                >
                  {label}
                </span>
                {destination === "tasks" && tasksReady && (
                  <i className="nav-ready-dot" aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="header-right">
          {showVersionFlag && (
            <button
              className="version-flag"
              onClick={() => navigate("changelog")}
              aria-label={`New version ${LATEST_VERSION}, see what changed`}
            >
              <span className="version-flag-dot" aria-hidden="true" />
              <span>New Version</span>
            </button>
          )}
          {session.ultraRebirths > 0 && (
            <span
              className="ultra-mark"
              title={
                session.rollbacks > 0
                  ? `Rollback taken · Prestige ×${session.ultraRebirths} · +${Math.round(
                      session.ultraRebirths * 10 + 25,
                    )}% EP on every banked roll`
                  : `Prestige ×${session.ultraRebirths} · +${Math.round(
                      session.ultraRebirths * 10,
                    )}% EP on every banked roll`
              }
            >
              <InfinityIcon size={13} aria-hidden="true" />{" "}
              {session.rollbacks > 0
                ? "Rollback"
                : `Prestige ×${session.ultraRebirths}`}
            </span>
          )}
          <RebirthNav
            progress={session}
            active={page === "rebirth"}
            onClick={() => navigate("rebirth")}
          />
          <button
            className={`icon-button help-button ${page === "about" ? "active" : ""}`}
            aria-label="How to play"
            aria-current={page === "about" ? "page" : undefined}
            onClick={() => navigate("about")}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className={`icon-button help-button ${page === "settings" ? "active" : ""}`}
            aria-label="Settings"
            aria-current={page === "settings" ? "page" : undefined}
            onClick={() => navigate("settings")}
          >
            <SlidersHorizontal size={18} />
          </button>
          <div className="theme-switch" aria-label="Color theme">
            {[
              ["light", Sun],
              ["system", Monitor],
              ["dark", Moon],
            ].map(([value, Icon]) => (
              <button
                key={value}
                aria-label={`${value} theme`}
                aria-pressed={theme === value}
                className={theme === value ? "selected" : ""}
                onClick={() => setTheme(value)}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <button
            className="sign-in"
            aria-label={session.profile ? "Your profile" : "Sign up"}
            data-avatar={session.profile?.avatar ? "logo" : "icon"}
            onClick={() => openAuth()}
          >
            {session.profile ? (
              <AvatarMark
                avatar={session.profile.avatar}
                size={18}
                label={`${session.profile.username} logo`}
              />
            ) : (
              <LogIn size={15} />
            )}
            <span>{session.profile ? "Profile" : "Sign up"}</span>
          </button>
        </div>
      </header>
      {progressWarning && (
        <div className="progress-warning" role="status">
          {progressWarning}
        </div>
      )}
      <main className={page === "roll" ? "home-main" : "content-main"}>
        <OfflineRewards
          progress={session}
          status={offlineState}
          onDismiss={() => dispatch({ type: "offline-dismiss" })}
          onHistory={() => navigate("history")}
        />
        <div
          className="roll-view"
          hidden={page !== "roll"}
          style={
            page !== "roll" ? { display: "none" } : { display: "contents" }
          }
        >
          <RollExperience
            key={epoch}
            {...{ openBadge, notify, session }}
            active={
              page === "roll" &&
              !modal &&
              !offlineState.busy &&
              !session.offline?.batch
            }
            theme={appliedTheme}
            navigate={navigate}
            onComplete={completeRoll}
            onDraw={() => dispatch({ type: "draw" })}
            openSignup={openAuth}
            aura={session.equipped}
            arrivalPet={arrivalPet}
          >
            <button
              className="discover-link"
              onClick={() => navigate("badges")}
            >
              <span className="mini-badges" aria-hidden="true">
                <RollMark size={16} />
                <BadgeMark size={16} />
                <CompanionMark size={16} />
                <SkillMark size={16} />
              </span>
              <span>
                Every number has a story. <strong>Discover the badges</strong>
              </span>
              <ChevronRight size={14} />
            </button>
          </RollExperience>
        </div>
        {page === "history" && (
          <ActivityFeed
            key={epoch}
            progress={session}
            navigate={navigate}
            openSignup={openAuth}
            openBadge={openBadge}
            notify={notify}
            onAction={dispatch}
          />
        )}
        {page === "settings" && (
          <>
            <button
              className="back-link"
              onClick={() =>
                settingsSection ? navigate("settings") : navigate("roll")
              }
            >
              <ArrowLeft size={14} />{" "}
              {settingsSection ? "Back to settings" : "Back to rolling"}
            </button>
            <div className="page-heading">
              <div className="page-icon">
                {settingsSection === "link" ? (
                  <Link2 size={25} />
                ) : (
                  <SlidersHorizontal size={25} />
                )}
              </div>
              <div>
                <h1>
                  {settingsSection === "link" ? "Device link" : "Settings"}
                </h1>
                <p>
                  {settingsSection === "link"
                    ? "One account across your devices, and everything behind it."
                    : "Alerts, presentation and gameplay conveniences."}
                </p>
              </div>
            </div>
            {settingsSection === "link" ? (
              <DeviceLinkPanel
                notify={notify}
                progress={session}
                navigate={navigate}
              />
            ) : (
              <Settings
                notify={notify}
                progress={session}
                onAction={dispatch}
                navigate={navigate}
              />
            )}
          </>
        )}
        {page === "about" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <CircleHelp size={25} />
              </div>
              <div>
                <h1>How to play</h1>
                <p>What the game is, and what it never does.</p>
              </div>
            </div>
            <About navigate={navigate} progress={session} />
          </>
        )}
        {page === "changelog" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <ScrollText size={25} />
              </div>
              <div>
                <h1>Changelog</h1>
                <p>What changed, and when.</p>
              </div>
            </div>
            <Changelog onSeen={() => setSeenVersion(LATEST_VERSION)} />
          </>
        )}
        {page === "profile" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div
                className={`page-icon ${session.profile?.avatar ? "has-logo" : ""}`}
              >
                {session.profile?.avatar ? (
                  <AvatarMark
                    avatar={session.profile.avatar}
                    size={46}
                    label={`${session.profile.username} logo`}
                  />
                ) : (
                  <UserRound size={25} />
                )}
              </div>
              <div>
                <h1>Profile</h1>
                <p>Your local save and how far you have come.</p>
              </div>
            </div>
            <div className="profile-page">
              <LocalProfile
                key={epoch}
                profile={session.profile}
                progress={session}
                onAction={dispatch}
                onContinue={() => navigate("roll")}
                navigate={navigate}
              />
            </div>
          </>
        )}
        {page === "rebirth" && rebirthVisible && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <Sparkles size={25} />
              </div>
              <div>
                <h1>Rebirth</h1>
                <p>
                  Start the run over; your account and aura collection stay.
                </p>
              </div>
            </div>
            <Rebirth
              key={epoch}
              progress={session}
              onAction={dispatch}
              onDone={(message, meta) => {
                navigate("roll");
                notify({
                  kind: "milestone",
                  title: "Rebirth complete",
                  text: message ?? "The new cycle has started.",
                });
                if (meta?.rollback) setUltraCeremony("rollback");
                else if (meta?.ultra) setUltraCeremony("prestige");
                else setRebirthRing(true);
              }}
            />
          </>
        )}
        {page === "tasks" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <ListChecks size={25} />
              </div>
              <div>
                <h1>Tasks</h1>
                <p>
                  Small goals that pay EP. Daily tasks reset each day, weekly
                  ones on Monday.
                </p>
              </div>
            </div>
            <Tasks
              key={epoch}
              progress={session}
              onAction={dispatch}
              notify={notify}
              openSignup={openAuth}
              openAuraFamily={openFamily}
            />
          </>
        )}
        {page === "shop" && (
          <Shop
            key={`${epoch}:${shopSection}:${shopFamily}`}
            progress={session}
            section={shopSection}
            family={shopFamily}
            onOpenShelf={openShelf}
            onOpenFamily={openFamily}
            focusProduct={shopFocus}
            onAction={dispatch}
            openSignup={openAuth}
            navigate={navigate}
            notify={notify}
            pickingGoal={pickingGoal}
            onPickingGoal={setPickingGoal}
          />
        )}
        {page === "badges" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <Medal size={25} />
              </div>
              <div>
                <h1>The badge collection</h1>
                <p>Discover badges by rolling numbers.</p>
              </div>
            </div>
            <div className="catalogue-intro">
              <span>
                <strong>
                  {discoveredBadges.length} / {badges.length}
                </strong>{" "}
                badges discovered
              </span>
              <span>
                {badgeGroups.length} sets{" "}
                <span className="dot-separator">·</span> 6 rarities
              </span>
            </div>
            <div className="collection-progress">
              <progress
                className="collection-progress-bar"
                aria-label="Badge collection progress"
                aria-valuetext={`${discoveredBadges.length} of ${badges.length} badges discovered`}
                value={discoveredBadges.length}
                max={badges.length}
              />
              <span className="collection-progress-label">
                {discoveredBadges.length === badges.length
                  ? "Collection complete"
                  : `${((discoveredBadges.length / badges.length) * 100).toFixed(1)}% complete`}
              </span>
            </div>
            {!!session.rebirths && (
              <p className="rebirth-count">
                Rebirths: {session.rebirths.toLocaleString("en-US")}
              </p>
            )}
            <div className="filters">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search badges"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search badges or sets…"
                />
                {search && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <select
                aria-label="Filter by set"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                {["All sets", ...discoveredGroups].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <select
                aria-label="Sort badges"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                {["Default", "A–Z", "Rarest first"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="rarity-filters">
              {["All rarities", ...rarities].map((r) => (
                <button
                  key={r}
                  className={`${rarity === r ? "active" : ""} ${r.toLowerCase()}`}
                  onClick={() => setRarity(r)}
                >
                  {r !== "All rarities" && <span className="rarity-dot" />}
                  {r}
                </button>
              ))}
            </div>
            <div className="results-heading">
              <span>{filteredBadges.length} badges</span>
              {(search ||
                rarity !== "All rarities" ||
                group !== "All sets") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setRarity("All rarities");
                    setGroup("All sets");
                  }}
                >
                  Reset filters
                </button>
              )}
              <span>Click a badge to take a closer look</span>
            </div>
            <div className="badge-grid">
              {filteredBadges.map((b) => (
                <button
                  className={`badge-card ${b.rarity.toLowerCase()}`}
                  key={b.name}
                  onClick={() => openBadge(b)}
                >
                  <div className="badge-card-top">
                    <span className="badge-emoji">
                      <Emoji text={b.emoji} />
                    </span>
                    <ArrowUpRight size={15} />
                  </div>
                  <h2>{b.name}</h2>
                  <p>{b.groups[0]}</p>
                  <span className="rarity-label">
                    <span className="rarity-dot" />
                    {b.rarity}
                  </span>
                </button>
              ))}
            </div>
            {!filteredBadges.length && (
              <div className="empty-state">
                <Search size={30} />
                <h2>
                  {discoveredBadges.length
                    ? "No badges found"
                    : "No badges discovered yet"}
                </h2>
                <p>
                  {discoveredBadges.length
                    ? "Try a different name, rarity, or badge set."
                    : "Complete a roll to discover your first badges. Undiscovered badges stay hidden."}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (!discoveredBadges.length) {
                      navigate("roll");
                      return;
                    }
                    setSearch("");
                    setRarity("All rarities");
                    setGroup("All sets");
                  }}
                >
                  {discoveredBadges.length ? "Clear filters" : "Start rolling"}
                </button>
              </div>
            )}
            <p className="source-note">
              Original badge references from{" "}
              <a
                href="https://rng.cubityfir.st/badges"
                target="_blank"
                rel="noreferrer"
              >
                RNGdle Tools <ArrowUpRight size={12} />
              </a>
              . Includes two Infinite-exclusive badges. Only your discovered
              badges are shown. Sign up for a local profile to save your
              collection.
            </p>
          </>
        )}
      </main>
      <footer>
        <span>
          RNGdle <span className="footer-infinity">∞</span> Infinite
        </span>
        <span className="footer-center">
          Just a number. A whole lot of possibility.
        </span>
        <div>
          <a
            href="https://www.rngdle.com/"
            target="_blank"
            rel="noreferrer"
            className="footer-real-game"
          >
            Real game <ArrowUpRight size={12} />
          </a>
          <button onClick={() => navigate("changelog")}>Changelog</button>
          <button onClick={() => navigate("settings")}>Settings</button>
          <button onClick={() => navigate("about")}>How to play</button>
        </div>
      </footer>
      {/* The install card lives on the roll screen only: it is the landing
          page, and other pages keep their back-links unobstructed. */}
      {page === "roll" && <InstallApp notify={notify} />}
      <MobileTabBar
        page={page}
        rebirthVisible={rebirthVisible}
        rebirthReady={rebirthReadyNow}
        tasksReady={tasksReady}
        tasksGlitchActive={tasksGlitchActive}
        navigate={navigate}
      />
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={modalRef}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "badge" && selectedBadge && (
              <>
                <div
                  className={`large-badge ${selectedBadge.rarity.toLowerCase()}`}
                >
                  <Emoji text={selectedBadge.emoji} />
                </div>
                <p
                  className={`rarity-label centered ${selectedBadge.rarity.toLowerCase()}`}
                >
                  <span className="rarity-dot" />
                  {selectedBadge.rarity}
                </p>
                <h2 id="modal-title">{selectedBadge.name}</h2>
                <p>
                  {selectedBadge.description ||
                    "A little detail that makes a number extraordinary."}
                </p>
                <div className="badge-details">
                  <div>
                    <span>Badge set</span>
                    <strong>{selectedBadge.groups.join(" · ")}</strong>
                  </div>
                  <div>
                    <span>Rarity</span>
                    <strong>{selectedBadge.rarity}</strong>
                  </div>
                  <div>
                    <span>EP value</span>
                    <strong>
                      {selectedBadge.ep?.toLocaleString("en-US") ?? "—"} EP
                    </strong>
                  </div>
                  <div>
                    <span>Chance per roll</span>
                    <strong
                      title={
                        selectedBadge.matchingNumbers != null
                          ? `${selectedBadge.matchingNumbers.toLocaleString("en-US")} of ${POPULATION.toLocaleString("en-US")} possible numbers earn this badge, including superseded badges.`
                          : undefined
                      }
                    >
                      {selectedBadge.matchingNumbers != null
                        ? chanceLabels(selectedBadge.matchingNumbers).percent
                        : "—"}
                      {selectedBadge.matchingNumbers != null && (
                        <small className="chance-frequency">
                          {
                            chanceLabels(selectedBadge.matchingNumbers)
                              .frequency
                          }
                        </small>
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Collection status</span>
                    <strong>
                      {session.discovered.includes(selectedBadge.canonicalId)
                        ? "Discovered"
                        : session.rebirths
                          ? "Not yet rediscovered"
                          : "Earned in this roll"}
                    </strong>
                  </div>
                </div>
                {selectedBadge.matchingNumbers != null && (
                  <p className="chance-outcomes">
                    {chanceLabels(selectedBadge.matchingNumbers).outcomes} earn
                    this badge, including superseded badges.
                  </p>
                )}
                <p className="detail-note">
                  Only the highest-EP badge in a family scores. Other family
                  badges are still earned, but add 0 EP. Each roll is
                  independent; “1 in” is not a guarantee or a pity counter.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      <Toasts items={toasts} onDismiss={dismissToast} />

      {/* The ceremony: rays, a slam of the title and a storm of confetti for
          the ultra-rebirth itself. Pointer-transparent (never in the way of
          the game) and fully animation-driven — with reduced motion it rests
          at opacity 0, exactly as if it were never there. */}
      {ultraCeremony && (
        <div className="ultra-ceremony" aria-hidden="true">
          <span className="ultra-ceremony-rays" />
          <span className="ultra-ceremony-mark">
            <InfinityMark size={64} />
          </span>
          <strong className="ultra-ceremony-title">
            {ultraCeremony === "rollback"
              ? "ROLLBACK"
              : `PRESTIGE ${session.ultraRebirths}`}
          </strong>
          <span className="ultra-ceremony-sub">
            {ultraCeremony === "rollback"
              ? "the last stage — the run starts again, the account never does"
              : "the run starts again — the account never does"}
          </span>
          <span className="ultra-ceremony-confetti">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>
      )}
      {/* The rebirth moment: a flash, rainbow rays, a shockwave and the
          spinning ring bursting into confetti over the new cycle. Pointer-
          transparent and fully animation-driven — with reduced motion it
          rests at opacity 0, exactly as if it were never there. */}
      {rebirthRing && (
        <div className="rebirth-ceremony" aria-hidden="true">
          <span className="rebirth-ceremony-flash" />
          <span className="rebirth-ceremony-rays" />
          <span className="rebirth-ceremony-shock" />
          <span className="rebirth-ceremony-circle" />
          <strong className="rebirth-ceremony-title">
            REBIRTH {session.rebirths}
          </strong>
          <span className="rebirth-ceremony-sub">a new cycle begins</span>
          <span className="rebirth-ceremony-confetti">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>,
);
