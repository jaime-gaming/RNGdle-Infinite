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
  CircleHelp,
  ArrowUpRight,
  ArrowRight,
  X,
  Search,
  ChevronRight,
  Check,
  ArrowLeft,
  SlidersHorizontal,
  ScrollText,
} from "lucide-react";
import { badges, badgeGroups, rarities } from "./badges";
import "@fontsource-variable/inter";
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
import LocalProfile from "./components/LocalProfile";
import { useOffline } from "./use-offline";
import OfflineRewards from "./components/OfflineRewards";
import ActivityFeed from "./components/ActivityFeed";
import Settings from "./components/Settings";
import { SettingsProvider } from "./use-settings.jsx";
import { useReadyAlert } from "./use-ready-alert.js";
import { petDrop, petById } from "./pets.js";
import { skillPetLuck, skillById } from "./skills.js";
import { randomUnit } from "./random.js";
import Changelog from "./components/Changelog";
import RebirthNav from "./components/RebirthNav";
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
  isCurrentPath,
  validPage,
} from "./router.js";

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
  const [modal, setModal] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [toast, setToast] = useState("");
  const {
    progress: session,
    warning: progressWarning,
    dispatch,
    epoch,
  } = useProgress();
  useEffect(() => {
    setModal(null);
    setShopFocus(null);
    setSelectedBadge(null);
    setSearch("");
    setRarity("All rarities");
    setGroup("All sets");
    setSort("Default");
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
    if (outcome.ok && drop)
      notify(`${petById.get(drop).emoji} ${petById.get(drop).name} appeared!`);
    if (!outcome.ok) notify(outcome.message);
    return outcome;
  }
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All rarities");
  const [group, setGroup] = useState("All sets");
  const [sort, setSort] = useState("Default");
  const toastTimer = useRef(null);
  const previousFocus = useRef(null);
  const modalRef = useRef(null);
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  const navigate = (next, productId = null) => {
    setShopFocus(next === "shop" ? productId : null);
    setPage((next = validPage(next)));
    // Real URLs, so a page can be linked, bookmarked and reloaded directly.
    if (!isCurrentPath(next, location))
      history.pushState({ page: next }, "", pathForPage(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    // Back/forward must move between pages, and a legacy #shop link or a
    // 404.html fallback landing must be normalised to its real path once.
    const update = () => setPage(pageFromLocation(location));
    update();
    if (location.hash || !isCurrentPath(pageFromLocation(location), location))
      history.replaceState(
        { page: pageFromLocation(location) },
        "",
        pathForPage(pageFromLocation(location)),
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
      clearTimeout(toastTimer.current);
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
  function openAuth() {
    setModal("auth");
  }
  const offlineState = useOffline(session, dispatch);
  // One alert per finished cooldown, and never while a roll is still revealing.
  useReadyAlert(session.cooldownUntil, {
    blocked: !!session.pendingRoll || !!session.offline?.batch,
  });
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
              ["badges", "Badges", Medal],
              ["history", "History", History],
            ].map(([destination, label, Icon]) => (
              <button
                key={destination}
                aria-label={label}
                aria-current={page === destination ? "page" : undefined}
                className={page === destination ? "active" : ""}
                onClick={() => navigate(destination)}
              >
                <Icon size={16} />
                <span>{label}</span>
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
              title={`Ultra-rebirth ${session.ultraRebirths} · +${Math.round(
                session.ultraRebirths * 10,
              )}% EP on every banked roll`}
            >
              <InfinityIcon size={13} aria-hidden="true" /> Ultra ×
              {session.ultraRebirths}
            </span>
          )}
          <RebirthNav
            progress={session}
            active={page === "badges"}
            onClick={() => navigate("badges")}
          />
          <button
            className="icon-button help-button"
            aria-label="How to play"
            aria-current={page === "about" ? "page" : undefined}
            onClick={() => navigate("about")}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="icon-button help-button"
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
            onClick={() => openAuth()}
          >
            <LogIn size={15} />
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
          >
            <button
              className="discover-link"
              onClick={() => navigate("badges")}
            >
              <span className="mini-badges">
                <Emoji text="🍀 💎 🪐" />
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
          />
        )}
        {page === "settings" && (
          <>
            <button className="back-link" onClick={() => navigate("roll")}>
              <ArrowLeft size={14} /> Back to rolling
            </button>
            <div className="page-heading">
              <div className="page-icon">
                <SlidersHorizontal size={25} />
              </div>
              <div>
                <h1>Settings</h1>
                <p>Alerts, presentation and gameplay conveniences.</p>
              </div>
            </div>
            <Settings
              notify={notify}
              progress={session}
              onAction={dispatch}
              navigate={navigate}
            />
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
            <About navigate={navigate} />
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
        {page === "shop" && (
          <Shop
            key={epoch}
            progress={session}
            focusProduct={shopFocus}
            onAction={dispatch}
            openSignup={openAuth}
            navigate={navigate}
            notify={notify}
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
            <Rebirth
              key={epoch}
              progress={session}
              onAction={dispatch}
              onDone={(message) => {
                navigate("roll");
                notify(message ?? "Rebirth complete.");
              }}
            />
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
            {modal === "auth" && (
              <LocalProfile
                profile={session.profile}
                onAction={dispatch}
                onClose={() => setModal(null)}
              />
            )}
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
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
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
