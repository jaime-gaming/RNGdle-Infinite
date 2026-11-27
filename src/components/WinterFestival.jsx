import PetIcon from "./PetIcon.jsx";
import React, { useEffect, useState } from "react";
import { CalendarDays, Radio, Gift, Snowflake } from "lucide-react";
import { gameNow } from "../game-clock.js";
import {
  WINTER_SPECIAL_TASKS,
  WINTER_LIVE_EVENTS,
  winterFestivalCount,
} from "../winter-festival.js";
import { RNGMAS_REWARDS, RNGMAS_COSMETICS_BY_ID } from "../rngmas.js";
import NumberBox from "./NumberBox.jsx";

const date = (at) =>
  new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
function remaining(until, now) {
  const minutes = Math.max(0, Math.ceil((until - now) / 60000));
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h ${minutes % 60}m`;
}
export default function WinterFestival({
  progress,
  status,
  onAction,
  pending,
  collectionOnly = false,
}) {
  const [view, setView] = useState("tasks");
  const [now, setNow] = useState(gameNow);
  useEffect(() => {
    const nextBoundary = Math.min(
      ...WINTER_LIVE_EVENTS.flatMap((event) => [event.start, event.end]).filter(
        (at) => at > now,
      ),
    );
    const timer = setTimeout(
      () => setNow(gameNow()),
      Math.min(30000, Math.max(1, nextBoundary - now)),
    );
    return () => clearTimeout(timer);
  }, [now]);
  if (!status.active) return null;
  const festival = progress.rngmas.festival;
  const card = (mission, live) => {
    const aura = RNGMAS_COSMETICS_BY_ID.get(mission.reward);
    const rewardName =
      aura?.name ??
      `${mission.charges} ${mission.boost?.replace("boost-", "")} boost${mission.charges > 1 ? "s" : ""}`;
    const open = !live || (now >= mission.start && now < mission.end);
    const claimed = live
      ? festival?.live?.[mission.id]?.claimed
      : festival?.claimed?.includes(mission.id);
    const count = winterFestivalCount(progress.rngmas, mission);
    return (
      <article
        className="festival-card"
        key={mission.id}
        data-live={live && open}
        data-collected={claimed}
      >
        <p className="eyebrow">
          {claimed
            ? "IN YOUR COLLECTION"
            : live
              ? open
                ? "LIVE NOW"
                : now < mission.start
                  ? "UPCOMING"
                  : "ENDED"
              : "SPECIAL TASK"}
        </p>
        {aura?.kind === "pet-variant" ? (
          <PetIcon pet={aura.petId} skin={aura.skinId} size={72} />
        ) : aura ? (
          <NumberBox value="2026" tier="rare" aura={aura.id} compact />
        ) : (
          <Gift size={36} aria-hidden="true" />
        )}
        <h4>
          <span className="festival-mission-number">
            {String(
              (live ? WINTER_LIVE_EVENTS : WINTER_SPECIAL_TASKS).indexOf(
                mission,
              ) + 1,
            ).padStart(2, "0")}
          </span>{" "}
          {mission.name}
        </h4>
        <p>{mission.description}</p>
        {live && (
          <p className="festival-window">
            {date(mission.start)} – {date(mission.end)} UTC
            <br />
            {open
              ? `Closes in ${remaining(mission.end, now)}`
              : now < mission.start
                ? `Opens in ${remaining(mission.start, now)}`
                : "This window has closed. Earned cosmetics stay yours."}
          </p>
        )}
        <p>
          <strong>{rewardName}</strong>
          {mission.coins ? ` + ${mission.coins} Snowcoins` : ""}
        </p>
        <label>
          {count} / {mission.goal}
          <progress
            max={mission.goal}
            value={count}
            aria-label={`${mission.name} progress`}
          />
        </label>
        {mission.metric === "donations" &&
          open &&
          !claimed &&
          count < mission.goal && (
            <button
              className="secondary-button"
              disabled={pending || (progress.rngmas.snowcoins ?? 0) < 5}
              onClick={() =>
                onAction(
                  { type: "winter-parcel", id: mission.id },
                  "Parcel sent to the Northbound drive.",
                )
              }
            >
              Send parcel · 5 Snowcoins
            </button>
          )}
        <button
          className={
            open && count >= mission.goal && !claimed
              ? "primary-button"
              : "secondary-button"
          }
          disabled={pending || !open || count < mission.goal || claimed}
          onClick={() =>
            onAction(
              { type: "winter-special-claim", id: mission.id },
              `${rewardName} collected.`,
            )
          }
        >
          {claimed
            ? "In your collection"
            : !open
              ? "Window closed"
              : `Collect ${rewardName}`}
        </button>
      </article>
    );
  };
  return (
    <section
      id="winter-festival-board"
      className="festival-board"
      aria-labelledby={collectionOnly ? undefined : "festival-board-title"}
      aria-label={collectionOnly ? "Winter rewards" : undefined}
    >
      {!collectionOnly && (
        <>
          <div className="rngmas-section-heading">
            <div>
              <p className="eyebrow">
                <Radio size={13} /> THE FESTIVAL IS OPEN
              </p>
              <h3 id="festival-board-title">The festival board</h3>
              <p>
                Complete three season-long missions or join a timed gathering.
                Main online rolls count; extra skill results and offline rolls
                do not. Companion skins require their base companion to equip.
              </p>
            </div>
          </div>
          <div className="festival-summary">
            <strong>
              {festival?.claimed?.length ?? 0} / {WINTER_SPECIAL_TASKS.length}{" "}
              missions collected
            </strong>
            <progress
              value={festival?.claimed?.length ?? 0}
              max={WINTER_SPECIAL_TASKS.length}
              aria-label="Season missions collected"
            />
            <span>
              {remaining(status.endsInMs ? now + status.endsInMs : now, now)}{" "}
              left this season · Claim before the window closes.
            </span>
          </div>
          <nav className="festival-tabs" aria-label="Festival sections">
            {[
              ["tasks", "Missions"],
              ["live", "Live schedule"],
            ].map(([id, label]) => (
              <button
                key={id}
                className="secondary-button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="festival-zone" hidden={view !== "tasks"}>
            <header className="festival-zone-heading">
              <Snowflake size={18} />
              <strong>Special winter tasks</strong>
              <span>Available throughout RNGmas</span>
            </header>
            <div className="festival-grid">
              {WINTER_SPECIAL_TASKS.map((m) => card(m, false))}
            </div>
          </div>
          <div className="festival-zone" hidden={view !== "live"}>
            <header className="festival-zone-heading">
              <Radio size={18} />
              <strong>Live gatherings</strong>
              <span>Four scheduled windows · UTC</span>
            </header>
            <p className="festival-explainer">
              These are timed activities with your own progress, not a shared
              global counter. Start, finish and claim inside the window; there
              is no catch-up. The gift drive uses Snowcoins instead of rolls.
            </p>
            <div className="festival-grid">
              {WINTER_LIVE_EVENTS.map((m) => card(m, true))}
            </div>
          </div>
        </>
      )}
      <div className="festival-zone" hidden={!collectionOnly}>
        <header className="festival-zone-heading">
          <Gift size={18} />
          <strong>The winter collection</strong>
          <span>
            {RNGMAS_REWARDS.filter((a) => progress.owned.includes(a.id)).length}{" "}
            / {RNGMAS_REWARDS.length} collected
          </span>
        </header>
        <p className="festival-explainer">
          Eight auras and five companion skins: five chapter rewards, two
          calendar keepsakes, one midnight aura and skins from a mission, the
          gift drive, live gatherings and the market. Other missions award
          boosts and Snowcoins instead. Previously earned rewards stay yours;
          winter pass rewards are separate.
        </p>
        <div className="festival-collection">
          {RNGMAS_REWARDS.map((aura) => (
            <article key={aura.id}>
              {aura.kind === "pet-variant" ? (
                <PetIcon pet={aura.petId} skin={aura.skinId} size={64} />
              ) : (
                <NumberBox value="2026" tier="rare" aura={aura.id} compact />
              )}
              <strong>{aura.name}</strong>
              <small>
                {progress.owned.includes(aura.id)
                  ? "Collected"
                  : "Exclusive · RNGmas 2026"}
              </small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
