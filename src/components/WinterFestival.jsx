import WinterMotif from "./WinterMotif.jsx";
import {
  WINTER_ROTATIONS,
  WINTER_INGREDIENTS,
  winterSchedule,
} from "../winter-rotation.js";
import { passBoostById } from "../battle-pass.js";
import PetIcon from "./PetIcon.jsx";
import React, { useEffect, useState } from "react";
import { CalendarDays, Radio, Gift, Snowflake } from "lucide-react";
import { gameNow } from "../game-clock.js";
import {
  WINTER_SPECIAL_TASKS,
  WINTER_LIVE_EVENTS,
  WINTER_GATHERINGS,
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
  const [fullCalendar, setFullCalendar] = useState(false);
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
      `${mission.charges} ${passBoostById(mission.boost)?.name ?? "boost"} charge${mission.charges > 1 ? "s" : ""}`;
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
        data-ready={open && count >= mission.goal && !claimed}
        data-motif={mission.motif ?? "parcel"}
      >
        <p className="eyebrow">
          {claimed
            ? aura
              ? "IN YOUR COLLECTION"
              : "COLLECTED"
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
          <WinterMotif
            motif={mission.motif ?? "parcel"}
            size={46}
            aria-hidden="true"
          />
        )}
        <h4>
          <span className="festival-mission-number">
            {String(
              (live
                ? mission.group === "rotation"
                  ? WINTER_ROTATIONS
                  : [...WINTER_GATHERINGS].sort((a, b) => a.start - b.start)
                : WINTER_SPECIAL_TASKS
              ).indexOf(mission) + 1,
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
        {["digits", "ingredients"].includes(mission.metric) && (
          <div
            className="winter-ingredient-board"
            aria-label={
              mission.metric === "ingredients"
                ? "Kitchen ingredients"
                : "Final digits"
            }
          >
            {(mission.metric === "ingredients"
              ? WINTER_INGREDIENTS
              : Array.from({ length: 10 }, (_, i) => String(i))
            ).map((name, i) => {
              const found = (
                live ? festival?.live?.[mission.id]?.digits : festival?.digits
              )?.includes(i);
              return (
                <span
                  key={name}
                  data-found={!!found}
                  aria-label={`${name}: ${found ? "found" : "missing"}`}
                >
                  {found ? "✓ " : ""}
                  {name}
                </span>
              );
            })}
          </div>
        )}
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
            ? aura
              ? "In your collection"
              : "Collected"
            : !open
              ? now < mission.start
                ? "Not open yet"
                : "Window closed"
              : `Collect ${rewardName}`}
        </button>
      </article>
    );
  };
  const scheduleCards = (events) => {
    const schedule = winterSchedule(events, now);
    const shown = fullCalendar
      ? [...events].sort((a, b) => a.start - b.start)
      : [...schedule.active, ...schedule.upcoming.slice(0, 1)];
    return (
      <>
        <div className="winter-schedule-controls">
          <button
            className="secondary-button"
            aria-pressed={!fullCalendar}
            onClick={() => setFullCalendar(false)}
          >
            Now & next
          </button>
          <button
            className="secondary-button"
            aria-pressed={fullCalendar}
            onClick={() => setFullCalendar(true)}
          >
            Full calendar
          </button>
          <span>
            {schedule.active.length} open · {schedule.upcoming.length} upcoming
          </span>
        </div>
        <div className="festival-grid">{shown.map((m) => card(m, true))}</div>
        {!shown.length && (
          <p className="festival-explainer">
            All windows have ended. Your earned rewards stay in your collection.
          </p>
        )}
      </>
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
          <div className="festival-summary" hidden={view !== "tasks"}>
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
              ["commissions", "Rotating commissions"],
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
              <span>{WINTER_GATHERINGS.length} different gatherings · UTC</span>
            </header>
            <p className="festival-explainer">
              These are timed activities with your own progress, not a shared
              global counter. Start, finish and claim inside the window; there
              is no catch-up. The gift drive uses Snowcoins instead of rolls.
            </p>
            {scheduleCards(WINTER_GATHERINGS)}
          </div>
          <div className="festival-zone" hidden={view !== "commissions"}>
            <header className="festival-zone-heading">
              <CalendarDays size={18} />
              <strong>The village noticeboard</strong>
              <span>One commission every four days</span>
            </header>
            <p className="festival-explainer">
              Eight different routes, one reward each. Complete and collect
              during its four-day window for 6 Snowcoins and one Spark Injector
              charge. No streaks, no escalating daily grind. These use the same
              main online rolls as other missions.
            </p>
            {scheduleCards(WINTER_ROTATIONS)}
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
