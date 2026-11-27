import React, { useEffect, useState } from "react";
import { CalendarDays, Radio, Gift, Snowflake } from "lucide-react";
import { gameNow } from "../game-clock.js";
import {
  WINTER_SPECIAL_TASKS,
  WINTER_LIVE_EVENTS,
  winterFestivalCount,
} from "../winter-festival.js";
import { RNGMAS_COSMETICS, RNGMAS_COSMETICS_BY_ID } from "../rngmas.js";
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
}) {
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
        <NumberBox value="2026" tier="rare" aura={aura.id} compact />
        <h4>{mission.name}</h4>
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
          <strong>{aura.name}</strong>
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
              `${aura.name} collected.`,
            )
          }
        >
          {claimed
            ? "In your collection"
            : !open
              ? "Window closed"
              : `Collect ${aura.name}`}
        </button>
      </article>
    );
  };
  return (
    <section
      id="winter-festival-board"
      className="festival-board"
      aria-labelledby="festival-board-title"
    >
      <div className="rngmas-section-heading">
        <div>
          <p className="eyebrow">
            <Radio size={13} /> THE FESTIVAL IS OPEN
          </p>
          <h3 id="festival-board-title">The festival board</h3>
          <p>
            Season-long tasks, four timed gatherings and a collection of{" "}
            {RNGMAS_COSMETICS.length} exclusive event auras. Play the main roll
            to progress; extra skill results and offline rolls do not count.
          </p>
        </div>
      </div>
      <details className="festival-zone" open>
        <summary>
          <Snowflake size={18} />
          <strong>Special winter tasks</strong>
          <span>Available throughout RNGmas</span>
        </summary>
        <div className="festival-grid">
          {WINTER_SPECIAL_TASKS.map((m) => card(m, false))}
        </div>
      </details>
      <details className="festival-zone" open>
        <summary>
          <Radio size={18} />
          <strong>Live gatherings</strong>
          <span>Four scheduled windows · UTC</span>
        </summary>
        <p className="festival-explainer">
          These are timed activities with your own progress, not a shared global
          counter. Start, finish and claim inside the window; there is no
          catch-up. The gift drive uses Snowcoins instead of rolls.
        </p>
        <div className="festival-grid">
          {WINTER_LIVE_EVENTS.map((m) => card(m, true))}
        </div>
      </details>
      <details className="festival-zone">
        <summary>
          <Gift size={18} />
          <strong>The winter collection</strong>
          <span>
            {
              RNGMAS_COSMETICS.filter((a) => progress.owned.includes(a.id))
                .length
            }{" "}
            / {RNGMAS_COSMETICS.length} collected
          </span>
        </summary>
        <p className="festival-explainer">
          Five chapter auras, two calendar keepsakes, three task rewards, four
          live rewards and three market exclusives. All permanent once earned.
          Winter pass cosmetics are separate.
        </p>
        <div className="festival-collection">
          {RNGMAS_COSMETICS.map((aura) => (
            <article key={aura.id}>
              <NumberBox value="2026" tier="rare" aura={aura.id} compact />
              <strong>{aura.name}</strong>
              <small>
                {progress.owned.includes(aura.id)
                  ? "Collected"
                  : "Exclusive · RNGmas 2026"}
              </small>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
