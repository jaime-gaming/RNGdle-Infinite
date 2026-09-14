import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ShoppingBag,
  History,
  Medal,
  Sun,
  Moon,
  Monitor,
  LogIn,
  CircleHelp,
  ArrowUpRight,
  ArrowRight,
  Infinity as InfinityIcon,
  X,
  Search,
  ChevronRight,
  Check,
  Dices,
  ArrowLeft,
} from "lucide-react";
import { badges, badgeGroups, rarities } from "./badges";
import "@fontsource-variable/inter";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./styles.css";
import Emoji from "./components/Emoji";
import RollExperience from "./components/RollExperience";
import { POPULATION } from "./probability";
import Shop from "./components/Shop";
import { useProgress } from "./use-progress";
import "./shop.css";
import LocalProfile from "./components/LocalProfile";
import ActivityFeed from "./components/ActivityFeed";

function App() {
  const [page, setPage] = useState(() =>
    ["badges", "shop", "history"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "roll",
  );
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
    setSelectedBadge(null);
    setSearch("");
    setRarity("All rarities");
    setGroup("All sets");
    setSort("Default");
  }, [epoch]);
  async function completeRoll(result, id, cooldownUntil) {
    const outcome = await dispatch({
      type: "complete",
      result,
      id,
      cooldownUntil,
    });
    if (!outcome.ok) notify(outcome.message);
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
  const navigate = (next) => {
    if (!["roll", "badges", "shop", "history"].includes(next)) next = "roll";
    setPage(next);
    location.hash = next === "roll" ? "" : next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const update = () =>
      setPage(
        ["badges", "shop", "history"].includes(location.hash.slice(1))
          ? location.hash.slice(1)
          : "roll",
      );
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
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
            RNG<span>dle</span>
            <span className="infinite-label">
              <InfinityIcon size={14} /> INFINITE
            </span>
          </button>
          <div className="nav-divider" />
          <nav aria-label="Main navigation">
            <button
              aria-label="History"
              className={page === "history" ? "active" : ""}
              onClick={() => navigate("history")}
            >
              <History size={15} />
              <span>History</span>
            </button>
            <button
              aria-label="Badges"
              className={page === "badges" ? "active" : ""}
              onClick={() => navigate("badges")}
            >
              <Medal size={16} />
              <span>Badges</span>
            </button>
            <button
              aria-label="Shop"
              className={page === "shop" ? "active" : ""}
              onClick={() => navigate("shop")}
            >
              <ShoppingBag size={16} />
              <span>Shop</span>
            </button>
          </nav>
        </div>
        <div className="header-right">
          <button
            className="icon-button help-button"
            aria-label="How to play"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
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
            theme={appliedTheme}
            onComplete={completeRoll}
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
        {page === "shop" && (
          <Shop
            key={epoch}
            progress={session}
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
                <p className="eyebrow">LITTLE NUMBERS. BIG DISCOVERIES.</p>
                <h1>The badge collection</h1>
                <p>From everyday coincidences to one-in-a-million finds.</p>
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
              Badge names and rarities from{" "}
              <a
                href="https://rng.cubityfir.st/badges"
                target="_blank"
                rel="noreferrer"
              >
                RNGdle Tools <ArrowUpRight size={12} />
              </a>
              . Only your discovered badges are shown. Sign up for a local
              profile to save your collection.
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
          <button onClick={() => setModal("help")}>
            How to play <ArrowUpRight size={12} />
          </button>
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
            {modal === "help" && (
              <>
                <div className="modal-symbol">
                  <Dices size={28} />
                </div>
                <p className="eyebrow">WELCOME TO RNGdle INFINITE</p>
                <h2 id="modal-title">One roll. A little possibility.</h2>
                <p>
                  It’s simple. Generate a number and see what makes it special.
                </p>
                <div className="help-steps">
                  <div>
                    <span>01</span>
                    <div>
                      <h3>Let luck do its thing</h3>
                      <p>Hit Generate for a number between 0 and 1,000,000.</p>
                    </div>
                  </div>
                  <div>
                    <span>02</span>
                    <div>
                      <h3>Discover the unexpected</h3>
                      <p>
                        Explore badges for patterns, famous numbers, and
                        mathematical curiosities.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span>03</span>
                    <div>
                      <h3>No need to wait until tomorrow</h3>
                      <p>
                        Start with a 45-second reveal and a 60-second cooldown.
                        Spend EP on permanent timing upgrades in the shop.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="info-box">
                  Every number from 0 through 1,000,000 is equally likely;
                  repeats are possible. Scores and badge odds use all 1,000,001
                  numbers, not your session. Top means the share scoring at
                  least as much; Bottom means the share scoring at most as much.
                  Both include ties. Rank labels are rounded like RNGdle; hover
                  to see the precise percentage and counts. Only the highest-EP
                  badge in each family adds to your score. Completing a roll
                  adds its EP to your wallet and unlocks all earned badges.
                  Spend EP on timing upgrades or cosmetic auras in the shop.
                  Upgrades apply to future rolls; they never change your odds or
                  score. Sign up for a local profile to save your wallet,
                  discoveries, purchases, cooldown, and activity history in this
                  browser. Guest progress is temporary. This is not an online
                  account, and clearing site data removes local saves. The
                  leaderboard is disabled. Open History for completed rolls,
                  badge unlocks, and shop transactions. Delete your account and
                  progress from Profile.
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setModal(null);
                    navigate("roll");
                  }}
                >
                  Let’s roll <ArrowRight size={16} />
                </button>
              </>
            )}
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
                    <span>Of numbers</span>
                    <strong
                      title={
                        selectedBadge.matchingNumbers != null
                          ? `${selectedBadge.matchingNumbers.toLocaleString("en-US")} of ${POPULATION.toLocaleString("en-US")} possible numbers earn this badge, including superseded badges.`
                          : undefined
                      }
                    >
                      {selectedBadge.probability ?? "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Collection status</span>
                    <strong>
                      {session.discovered.includes(selectedBadge.canonicalId)
                        ? "Discovered"
                        : "Earned in this roll"}
                    </strong>
                  </div>
                </div>
                <p className="detail-note">
                  Only the highest-EP badge in a family scores. Other family
                  badges are still earned, but add 0 EP.
                </p>
                <a
                  className="primary-button"
                  href={`https://rng.cubityfir.st/badges/${(selectedBadge.canonicalId || selectedBadge.id).toLowerCase()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View badge reference <ArrowUpRight size={16} />
                </a>
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

createRoot(document.getElementById("root")).render(<App />);
