import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  History,
  Coins,
  Medal,
  ShoppingBag,
  Check,
} from "lucide-react";
import NumberBox from "./NumberBox";
import { badges } from "../badges";
import { formatEP } from "../roll-data";
import "../activity.css";
const byId = new Map(badges.map((b) => [b.canonicalId, b]));
const filters = ["All activity", "Rolls", "Badge unlocks", "Shop", "Offline"];
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
}) {
  const [filter, setFilter] = useState("All activity"),
    [limit, setLimit] = useState(50);
  const [query, setQuery] = useState(""),
    [tier, setTier] = useState("all");
  const lens = progress.owned.includes("archive-lens");
  const history = progress.history ?? [];
  const events = useMemo(
    () =>
      history
        .filter(
          (e) =>
            filter === "All activity" ||
            (filter === "Rolls" && e.type === "roll") ||
            (filter === "Offline" && e.source === "offline") ||
            (filter === "Badge unlocks" && e.type === "unlock") ||
            (filter === "Shop" && ["purchase", "equip"].includes(e.type)),
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
    [history, filter, query, tier, lens],
  );
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
          <p className="eyebrow">YOUR LUCK, RECORDED.</p>
          <h1>Your activity</h1>
          <p>Every completed roll, new discovery, and shop transaction.</p>
        </div>
      </div>
      {!progress.profile && (
        <div className="guest-save-notice">
          <p>
            Your guest feed is temporary. Sign up to keep it with your progress.
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
      </div>
      <div
        className="activity-filters"
        role="group"
        aria-label="Activity filters"
      >
        {filters.map((name) => (
          <button
            key={name}
            aria-pressed={filter === name}
            onClick={() => {
              setFilter(name);
              setLimit(50);
            }}
          >
            {name}
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
        Newest first · Activity is recorded from this update onward; older rolls
        cannot be reconstructed. Nothing is automatically trimmed. Browser
        storage limits still apply.
      </p>
      {!events.length ? (
        <section className="activity-empty">
          <History size={30} />
          <h2>
            {history.length
              ? "No matching activity"
              : "Your story starts with a roll"}
          </h2>
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
            <li
              key={event.id}
              className="activity-event"
              data-event-type={event.type}
            >
              <div className={`activity-icon event-${event.type}`}>
                {event.type === "roll" ? (
                  <Coins size={19} />
                ) : event.type === "unlock" ? (
                  <Medal size={19} />
                ) : event.type === "purchase" ? (
                  <ShoppingBag size={19} />
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
                        </span>
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
                      First discovered with roll <strong>{event.number}</strong>
                      .
                    </p>
                    <BadgeList ids={event.badges} openBadge={openBadge} />
                  </>
                ) : (
                  <p className="activity-transaction">
                    {event.type === "purchase" ? (
                      <>
                        <strong>−{formatEP(event.ep)} EP</strong> · Permanent
                        purchase
                      </>
                    ) : (
                      <>Free equipment change · No EP spent</>
                    )}
                  </p>
                )}
              </article>
            </li>
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
