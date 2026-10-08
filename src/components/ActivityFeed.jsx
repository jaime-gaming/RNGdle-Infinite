import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  History,
  Coins,
  Medal,
  PawPrint,
  ShoppingBag,
  Check,
  RotateCcw,
  Share2,
  Bookmark,
  ListChecks,
  TriangleAlert,
  Infinity as InfinityIcon,
} from "lucide-react";
import NumberBox from "./NumberBox";
import { skillById, skillEffectChips } from "../skills.js";
import { badges } from "../badges";
import { formatEP, buildShareTextFromHistory } from "../roll-data";
import {
  HISTORY_LIMIT,
  HISTORY_WARNING,
  historyCycles,
  removableCount,
} from "../history-log.js";
import { CADENCE_NAME } from "../tasks.js";
import "../activity.css";
const byId = new Map(badges.map((b) => [b.canonicalId, b]));
const filters = [
  "All activity",
  "Rolls",
  "Badge unlocks",
  "Shop",
  "Tasks",
  "Offline",
];
// The oldest-first sizes the bulk delete offers for "little by little".
const OLDEST_STEPS = [500, 1000, 2000];
const count = (n) => n.toLocaleString("en-US");
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const shortDate = (at) =>
  at == null
    ? ""
    : new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });
function BadgeList({ ids, openBadge }) {
  return (
    <div className="activity-badges">
      {ids.map((id) => {
        const badge = byId.get(id);
        return (
          badge && (
            <button
              key={id}
              className={`badge-pill ${badge.rarity.toLowerCase()}`}
              onClick={() => openBadge(badge)}
            >
              {badge.name}
            </button>
          )
        );
      })}
    </div>
  );
}
export default function ActivityFeed({
  progress,
  navigate,
  openSignup,
  openBadge,
  notify,
  onAction,
}) {
  const [filter, setFilter] = useState("All activity"),
    [limit, setLimit] = useState(50);
  const [copiedId, setCopiedId] = useState("");
  const copiedTimer = useRef(null);
  const [query, setQuery] = useState(""),
    [tier, setTier] = useState("all");
  // Bulk delete: the panel is opened from the space warning, and a cut waits
  // for its own confirmation before anything is removed.
  const [pruneOpen, setPruneOpen] = useState(false),
    [pending, setPending] = useState(null),
    [pruning, setPruning] = useState(false),
    [pruneError, setPruneError] = useState("");
  const lens = progress.owned.includes("archive-lens");
  const history = progress.history ?? [];
  // A few rolls can be pinned for later: the bookmarks live on the save, so
  // they survive reloads, rebirths and other tabs.
  const bookmarks = progress.bookmarks ?? [];
  const cycles = useMemo(
    () => historyCycles(history, bookmarks),
    [history, bookmarks],
  );
  const removable = useMemo(
    () => removableCount(history, bookmarks),
    [history, bookmarks],
  );
  const spaceFull = history.length >= HISTORY_LIMIT;
  const lowSpace = history.length >= HISTORY_WARNING;
  // Below the warning level there is nothing to make room for, so the panel
  // closes rather than waiting, open, for the next time the log fills up.
  useEffect(() => {
    if (!lowSpace) {
      setPruneOpen(false);
      setPending(null);
    }
  }, [lowSpace]);
  const events = useMemo(
    () =>
      history
        .filter(
          (e) =>
            filter === "All activity" ||
            (filter === "Rolls" && e.type === "roll") ||
            (filter === "Offline" && e.source === "offline") ||
            (filter === "Rebirths" &&
              ["rebirth", "ultra-rebirth"].includes(e.type)) ||
            (filter === "Bookmarks" &&
              e.type === "roll" &&
              bookmarks.includes(e.id)) ||
            (filter === "Badge unlocks" && e.type === "unlock") ||
            (filter === "Shop" && ["purchase", "equip"].includes(e.type)) ||
            (filter === "Tasks" && e.type === "task"),
        )
        .filter(
          (e) =>
            !lens ||
            ((!query.trim() || String(e.number ?? "").includes(query.trim())) &&
              (tier === "all" || (e.type === "roll" && e.tier === tier))),
        )
        .slice()
        .sort((a, b) => a.at - b.at)
        .reverse(),
    [history, filter, query, tier, lens, bookmarks],
  );
  async function toggleBookmark(event) {
    const result = await onAction?.({ type: "bookmark", id: event.id });
    if (result && !result.ok && result.message) notify?.(result.message);
  }
  // Any archived roll can be shared later: the text is rebuilt from the entry
  // the save kept, so it can only ever state what the roll actually earned.
  async function shareRoll(event) {
    try {
      await navigator.clipboard.writeText(buildShareTextFromHistory(event));
      setCopiedId(event.id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(""), 2200);
    } catch {
      notify?.(
        "Clipboard isn’t available. Try copying from a secure browser window.",
      );
    }
  }
  // Confirming runs the cut the player picked. The save works out what that
  // removes, so the count shown here can only ever be a preview of it.
  async function confirmPrune() {
    if (!pending) return;
    setPruning(true);
    setPruneError("");
    const outcome = await onAction?.(pending.action);
    setPruning(false);
    if (!outcome?.ok) {
      setPruneError(outcome?.message ?? "Nothing was deleted.");
      return;
    }
    setPending(null);
    notify?.(
      `Deleted ${count(outcome.removed ?? 0)} entries. Bookmarked rolls and rebirth markers were kept.`,
    );
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate("roll")}>
        <ArrowLeft size={14} /> Back to rolling
      </button>
      <div className="page-heading">
        <div className="page-icon">
          <History size={25} />
        </div>
        <div>
          <h1>Your activity</h1>
          <p>
            Every completed roll, new discovery, companion, and shop
            transaction.
          </p>
        </div>
      </div>
      {!progress.profile && (
        <div className="guest-save-notice">
          <p>
            Guest play is not saved. This feed disappears when you leave, and
            signing up starts a fresh account rather than keeping it.
          </p>
          <button className="secondary-button" onClick={openSignup}>
            Sign up to save
          </button>
        </div>
      )}
      <div className="activity-summary">
        <span>
          <Coins size={16} /> <strong>{formatEP(progress.balance)} EP</strong>{" "}
          available
        </span>
        <span>
          {history.filter((e) => e.type === "roll").length.toLocaleString()}{" "}
          recorded rolls
        </span>
        <span>
          {count(history.length)} of {count(HISTORY_LIMIT)} entries kept
        </span>
      </div>
      {lowSpace && (
        <section
          className={`history-space ${spaceFull ? "is-full" : ""}`}
          role="status"
          aria-labelledby="history-space-title"
        >
          <div>
            <h2 id="history-space-title">
              <TriangleAlert size={16} aria-hidden="true" />
              {spaceFull ? "Entry space is full" : "Low entry space"}
            </h2>
            <p>
              {spaceFull
                ? `The log holds ${count(HISTORY_LIMIT)} entries. New rolls now push out the oldest entries that are not bookmarked. Bulk delete to choose what goes.`
                : `${count(history.length)} of ${count(HISTORY_LIMIT)} entries kept. Bulk delete clears a finished rebirth or your oldest entries, and bookmarked rolls are never removed.`}
            </p>
          </div>
          <button
            className="secondary-button"
            aria-expanded={pruneOpen}
            aria-controls="history-prune"
            onClick={() => {
              setPruneOpen((open) => !open);
              setPending(null);
              setPruneError("");
            }}
          >
            {pruneOpen ? "Hide bulk delete" : "Bulk delete"}
          </button>
        </section>
      )}
      {lowSpace && pruneOpen && (
        <section
          className="history-prune"
          id="history-prune"
          aria-labelledby="history-prune-title"
        >
          <h2 id="history-prune-title">Bulk delete</h2>
          <p>
            Rebirth markers and bookmarked rolls are never removed. Profile
            figures are counted from this log, so they drop by what goes; your
            balance, all-time EP and rebirths stay as they are.
          </p>
          <h3>Finished rebirths</h3>
          {cycles.finished.length ? (
            <ul className="history-prune-cycles">
              {cycles.finished.map((cycle) => (
                <li key={cycle.marker}>
                  <div>
                    <strong>{cycle.label}</strong>
                    <span>
                      {cycle.entries
                        ? `${count(cycle.entries)} entries`
                        : "Nothing to delete"}
                      {cycle.kept
                        ? ` · ${count(cycle.kept)} bookmarked kept`
                        : ""}
                      {cycle.started != null
                        ? ` · ${shortDate(cycle.started)} to ${shortDate(cycle.ended)}`
                        : ""}
                    </span>
                  </div>
                  <button
                    className="danger-button"
                    disabled={!cycle.entries || pruning}
                    aria-label={`Delete ${count(cycle.entries)} entries from the cycle ${lowerFirst(cycle.label)}`}
                    onClick={() =>
                      setPending({
                        action: {
                          type: "history-prune",
                          mode: "cycle",
                          marker: cycle.marker,
                        },
                        count: cycle.entries,
                        what: `from the cycle ${lowerFirst(cycle.label)}`,
                      })
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-prune-empty">
              No rebirth has finished yet, so there is no whole cycle to clear.
            </p>
          )}
          <p className="history-prune-current">
            The cycle in play holds {count(cycles.current.entries)} removable
            entries. Clear it a little at a time below.
          </p>
          <h3>Oldest entries</h3>
          <div className="history-prune-steps">
            {OLDEST_STEPS.map((size) => (
              <button
                key={size}
                className="secondary-button"
                disabled={!removable || pruning}
                onClick={() =>
                  setPending({
                    action: {
                      type: "history-prune",
                      mode: "oldest",
                      count: size,
                    },
                    count: Math.min(size, removable),
                    what: "from the oldest",
                  })
                }
              >
                Delete oldest {count(size)}
              </button>
            ))}
          </div>
          {pending && (
            <div
              className="history-prune-confirm"
              role="group"
              aria-label="Confirm deletion"
            >
              <p>
                Delete {count(pending.count)} entries {pending.what}? Bookmarked
                rolls and rebirth markers stay. This cannot be undone.
              </p>
              {pruneError && <p role="alert">{pruneError}</p>}
              <div className="history-prune-actions">
                <button
                  className="secondary-button"
                  disabled={pruning}
                  onClick={() => {
                    setPending(null);
                    setPruneError("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="danger-button"
                  disabled={pruning}
                  onClick={confirmPrune}
                >
                  {pruning
                    ? "Deleting…"
                    : `Delete ${count(pending.count)} entries`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <div
        className="activity-filters"
        role="group"
        aria-label="Activity filters"
      >
        {[
          ...filters,
          "Bookmarks",
          ...(progress.rebirths ? ["Rebirths"] : []),
        ].map((name) => (
          <button
            key={name}
            aria-pressed={filter === name}
            onClick={() => {
              setFilter(name);
              setLimit(50);
            }}
          >
            {name === "Bookmarks" && bookmarks.length
              ? `Bookmarks (${bookmarks.length}/3)`
              : name}
          </button>
        ))}
      </div>
      {lens ? (
        <div className="archive-controls">
          <label>
            Search a rolled number
            <input
              type="search"
              inputMode="numeric"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
              placeholder="e.g. 1337"
            />
          </label>
          <label>
            Roll tier
            <select
              aria-label="Roll tier"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                setLimit(50);
              }}
            >
              <option value="all">All tiers</option>
              {[
                "trash",
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
          {(query || tier !== "all") && (
            <button
              className="secondary-button"
              onClick={() => {
                setQuery("");
                setTier("all");
                setLimit(50);
              }}
            >
              Clear archive filters
            </button>
          )}
        </div>
      ) : (
        <p className="archive-upsell">
          Need to find a specific roll?{" "}
          <button onClick={() => navigate("shop")}>
            Unlock Archive Lens in the shop
          </button>
          . Your full feed is always free.
        </p>
      )}
      <p className="activity-note">
        Newest first · The log keeps up to {count(HISTORY_LIMIT)} entries, and
        bookmarked rolls are never removed. Activity is recorded from this
        update onward; older rolls cannot be reconstructed.
      </p>
      {!events.length ? (
        <section className="activity-empty">
          <History size={30} />
          <h2>{history.length ? "No matching activity" : "No rolls yet"}</h2>
          <p>
            {history.length
              ? "Try another activity filter."
              : "Complete a roll to see your number, EP, and badge discoveries here."}
          </p>
          {!history.length && (
            <button className="primary-button" onClick={() => navigate("roll")}>
              Let’s roll
            </button>
          )}
        </section>
      ) : (
        <ol className="activity-feed">
          {events.slice(0, limit).map((event) => (
            <React.Fragment key={event.id}>
              {/* A rebirth ends a cycle, not the story: the log keeps every
                  entry and draws a dotted line where the new one begins. */}
              {(event.type === "rebirth" || event.type === "ultra-rebirth") && (
                <li className="activity-divider">
                  <span className="activity-divider-label">
                    {event.type === "ultra-rebirth"
                      ? `Ultra-rebirth ${event.count}`
                      : `Rebirth ${event.count}`}
                  </span>
                </li>
              )}
              <li className="activity-event" data-event-type={event.type}>
                <div className={`activity-icon event-${event.type}`}>
                  {event.type === "roll" ? (
                    <Coins size={19} />
                  ) : event.type === "unlock" ? (
                    <Medal size={19} />
                  ) : event.type === "purchase" ? (
                    <ShoppingBag size={19} />
                  ) : event.type === "pet" ? (
                    <PawPrint size={19} />
                  ) : event.type === "rebirth" ? (
                    <RotateCcw size={19} />
                  ) : event.type === "ultra-rebirth" ? (
                    <InfinityIcon size={19} />
                  ) : event.type === "task" ? (
                    <ListChecks size={19} />
                  ) : (
                    <Check size={19} />
                  )}
                </div>
                <article>
                  <div className="activity-event-heading">
                    <h2>
                      {event.type === "roll"
                        ? event.source === "offline"
                          ? "Offline roll completed"
                          : event.flywheel === "boost"
                            ? "Flywheel roll completed"
                            : "Roll completed"
                        : event.type === "unlock"
                          ? `${event.badges.length} new badge${event.badges.length === 1 ? "" : "s"} unlocked`
                          : event.type === "purchase"
                            ? `Purchased ${event.name}`
                            : event.type === "pet"
                              ? `Found ${event.name} on a roll`
                              : event.type === "rebirth"
                                ? `Rebirth ${event.count}`
                                : event.type === "ultra-rebirth"
                                  ? `Ultra-rebirth ${event.count}`
                                  : event.type === "task"
                                    ? `Task claimed · ${event.name}`
                                    : `Equipped ${event.name}`}
                    </h2>
                    <time dateTime={new Date(event.at).toISOString()}>
                      {new Date(event.at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {event.type === "roll" ? (
                    <>
                      <div className="activity-roll">
                        <NumberBox
                          compact
                          value={event.number}
                          tier={event.tier}
                          aria-label={`Historical roll ${event.number}`}
                        />
                        <div>
                          <strong className="activity-credit">
                            +{formatEP(event.ep)} EP
                          </strong>
                          <span>
                            {event.tier.toUpperCase()} · {event.badges.length}{" "}
                            badges earned
                            {event.draws > 1
                              ? ` · best of ${event.draws} draws`
                              : ""}
                            {event.walletBonus
                              ? ` · +${formatEP(event.walletBonus)} EP extra`
                              : ""}
                          </span>
                          {!!event.skills?.length && (
                            <span className="activity-skills">
                              {event.skills.map((id) => {
                                const skill = skillById.get(id);
                                if (!skill) return null;
                                // The receipt states what the skill actually
                                // added to this roll, not just its name.
                                return (
                                  <span className="activity-skill" key={id}>
                                    <strong>{skill.name}</strong>
                                    {skillEffectChips(skill)[0]}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                          <div className="activity-actions">
                            <button
                              type="button"
                              className={`activity-bookmark ${
                                bookmarks.includes(event.id) ? "is-saved" : ""
                              }`}
                              onClick={() => toggleBookmark(event)}
                              aria-pressed={bookmarks.includes(event.id)}
                              aria-label={
                                bookmarks.includes(event.id)
                                  ? `Remove bookmark from roll ${event.number}`
                                  : `Bookmark roll ${event.number}`
                              }
                              title={
                                bookmarks.includes(event.id)
                                  ? "Remove bookmark"
                                  : "Keep this roll handy (up to 3)"
                              }
                            >
                              <Bookmark
                                size={15}
                                aria-hidden="true"
                                fill={
                                  bookmarks.includes(event.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                            <button
                              type="button"
                              className={`activity-share ${
                                copiedId === event.id ? "is-copied" : ""
                              }`}
                              onClick={() => shareRoll(event)}
                              aria-label={
                                copiedId === event.id
                                  ? `Copied roll ${event.number} result and link`
                                  : `Share roll ${event.number}`
                              }
                              title={
                                copiedId === event.id
                                  ? "Copied result + link"
                                  : "Share this roll"
                              }
                            >
                              {copiedId === event.id ? (
                                <Check size={15} aria-hidden="true" />
                              ) : (
                                <Share2 size={15} aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <details>
                        <summary>View earned badges</summary>
                        <BadgeList ids={event.badges} openBadge={openBadge} />
                      </details>
                    </>
                  ) : event.type === "unlock" ? (
                    <>
                      <p>
                        First discovered with roll{" "}
                        <strong>{event.number}</strong>.
                      </p>
                      <BadgeList ids={event.badges} openBadge={openBadge} />
                    </>
                  ) : event.type === "pet" ? (
                    <p>
                      A new companion joined your collection from a lucky roll.
                    </p>
                  ) : event.type === "rebirth" ? (
                    <p>
                      New cycle started
                      {event.skill
                        ? ` · ${skillById.get(event.skill)?.name} unlocked`
                        : ""}
                      . The collection, every purchase, the companions and the
                      wallet reset; the history, the rebirths and every
                      permanent bonus were kept, and the cycle began with{" "}
                      {formatEP(event.grant ?? 0)} EP.
                    </p>
                  ) : event.type === "ultra-rebirth" ? (
                    <p>
                      The run started over from the top of the ladder: the
                      collection, every purchase, the companions and the wallet
                      reset. History, rebirths and bonuses stayed, the cycle
                      began with {formatEP(event.grant ?? 0)} EP, and the
                      permanent wallet bonus grew by 10 points.
                    </p>
                  ) : event.type === "task" ? (
                    <p className="activity-transaction">
                      <strong>+{formatEP(event.ep)} EP</strong> ·{" "}
                      {CADENCE_NAME[event.cadence]} task, paid into your wallet
                    </p>
                  ) : (
                    <p className="activity-transaction">
                      {event.type === "purchase" ? (
                        <>
                          <strong>−{formatEP(event.ep)} EP</strong> · Kept until
                          your next rebirth
                        </>
                      ) : (
                        <>Free equipment change · No EP spent</>
                      )}
                    </p>
                  )}
                </article>
              </li>
            </React.Fragment>
          ))}
        </ol>
      )}
      {events.length > limit && (
        <button
          className="secondary-button activity-more"
          onClick={() => setLimit((n) => n + 50)}
        >
          Load more activity ({events.length - limit} remaining)
        </button>
      )}
    </>
  );
}
