import React, { useState } from "react";
import {
  ArrowRight,
  Clock3,
  Dices,
  Ghost,
  Hourglass,
  LockKeyhole,
} from "lucide-react";
import { hourlyView, RNGWEEN_HOURLY_TASKS } from "../rngween-hourly.js";
import { rngweenWorldUnlocked } from "../rngween-limited.js";
import { useHourlyDisplayClock } from "../use-rngween-hourly.js";
import { PumpkinMark } from "./game-icons.jsx";
import "../rngween-hourly.css";

export function hourlyCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
// One shared board, not four tasks per mode. A finished commission waits for
// the player's claim until its hour ends; there is no reroll or skip.
export default function RngweenHourly({
  progress,
  now,
  openWorld,
  openSignup,
  onAction,
  notify,
  inWorld = false,
}) {
  const clock = useHourlyDisplayClock(now);
  const view = hourlyView(progress, clock);
  const [claiming, setClaiming] = useState(0);
  async function claim(slot) {
    if (claiming) return;
    setClaiming(slot.serial);
    try {
      const outcome = await onAction?.({
        type: "claim-rngween-hourly",
        serial: slot.serial,
      });
      if (outcome && !outcome.ok)
        notify?.({ kind: "error", text: outcome.message });
      else if (outcome?.ok)
        notify?.({
          kind: "reward",
          title: `${slot.task.title} claimed`,
          text: `+${slot.task.pumpkoins} Pumpkoins. A new commission took its place.`,
        });
    } finally {
      setClaiming(0);
    }
  }
  const unlocked =
    !!progress.profile &&
    rngweenWorldUnlocked(progress.tasks, progress.rngweenLimited);
  if (!view.active) return null;
  return (
    <section
      className={`rngween-hourly${inWorld ? " is-world-board" : ""}`}
      aria-labelledby={`hourly-title-${inWorld ? "world" : "main"}`}
      data-hourly-board="rngween-2026"
    >
      <header className="rngween-hourly-head">
        <span className="rngween-hourly-mark">
          <Hourglass size={25} />
        </span>
        <div>
          <span className="rngween-eyebrow">Oct 21–24 & Nov 1–3 · UTC</span>
          <h2 id={`hourly-title-${inWorld ? "world" : "main"}`}>
            The Reaper's commissions
          </h2>
          <p>Complete commissions within one hour to earn Pumpkoins.</p>
        </div>
        <span className="rngween-hourly-wallet">
          <PumpkinMark size={20} />
          <strong>
            {(progress.rngweenLimited?.pumpkoins ?? 0).toLocaleString("en-US")}
          </strong>
          <small>Pumpkoins</small>
        </span>
      </header>
      <div className="rngween-hourly-rules">
        <span>
          <Clock3 size={14} /> One hour per task
        </span>
        <span>No skips</span>
        <span>Claim before the hour ends</span>
      </div>
      {!progress.profile ? (
        <div className="rngween-hourly-empty">
          <p>
            Create a saved profile to receive your four commissions and keep
            their Pumpkoins.
          </p>
          <button className="primary-button" onClick={openSignup}>
            Create a saved profile
          </button>
        </div>
      ) : (
        <ul
          className="rngween-hourly-grid"
          aria-label="Four hourly commissions"
        >
          {view.slots.length
            ? view.slots.map((slot) => (
                <li
                  className="rngween-hourly-card"
                  key={slot.key}
                  data-hourly-task={slot.taskId}
                  data-hourly-serial={slot.serial}
                  data-source={slot.task.source}
                >
                  <div className="rngween-hourly-card-top">
                    <span>
                      {slot.task.source === "world" ? (
                        <Ghost size={14} />
                      ) : (
                        <Dices size={14} />
                      )}
                      {slot.task.source === "world"
                        ? "RNGween World"
                        : "Main game"}
                    </span>
                    <span
                      className="rngween-hourly-countdown"
                      aria-label={`${slot.task.title} time remaining`}
                    >
                      <Clock3 size={12} />
                      {hourlyCountdown(slot.remaining)}
                    </span>
                  </div>
                  <h3>{slot.task.title}</h3>
                  <p>{slot.task.detail}</p>
                  <div className="rngween-hourly-meter">
                    <span>
                      {slot.count.toLocaleString("en-US")} /{" "}
                      {slot.task.goal.toLocaleString("en-US")}
                      {slot.task.metric === "banked" ||
                      slot.task.metric === "peakEP"
                        ? " EP"
                        : ""}
                    </span>
                    <progress
                      max={slot.task.goal}
                      value={slot.count}
                      aria-label={`${slot.task.title} progress`}
                    />
                  </div>
                  <div className="rngween-hourly-reward">
                    {slot.claimable ? (
                      <button
                        className="primary-button rngween-hourly-claim"
                        onClick={() => claim(slot)}
                        disabled={claiming === slot.serial}
                      >
                        <PumpkinMark size={17} /> Claim +{slot.task.pumpkoins}
                      </button>
                    ) : (
                      <>
                        <PumpkinMark size={17} /> +{slot.task.pumpkoins}{" "}
                        Pumpkoins
                      </>
                    )}
                    {slot.task.source === "world" &&
                      !inWorld &&
                      !slot.claimable && (
                        <button
                          className="rngween-hourly-world-link"
                          onClick={openWorld}
                          aria-label={`Visit the World for ${slot.task.title}`}
                        >
                          <ArrowRight size={16} />
                        </button>
                      )}
                  </div>
                </li>
              ))
            : [0, 1, 2, 3].map((i) => (
                <li key={i} className="rngween-hourly-card is-loading">
                  <Hourglass size={22} />
                  <p>Saving your assignment…</p>
                </li>
              ))}
        </ul>
      )}
      <footer className="rngween-hourly-foot">
        <p>
          {view.completed > 0
            ? `${view.completed} finished · ${view.earned.toLocaleString("en-US")} Pumpkoins earned this event.`
            : `${RNGWEEN_HOURLY_TASKS.length} commission varieties.`}
        </p>
        {!unlocked && (
          <p>
            <LockKeyhole size={13} /> World commissions join future slots only
            after you unlock its gate.
          </p>
        )}
        <small>
          Online play only. Main tasks count the committed number once per roll;
          World tasks only count World rolls. No progress carries into the next
          assignment. Expired tasks are replaced without a reward; every
          commission stops when the aura week begins or the event closes.
        </small>
      </footer>
    </section>
  );
}
