import React, { useEffect, useState } from "react";
import { Check, Coins } from "lucide-react";
import {
  CADENCE_NAME,
  TASK_CADENCES,
  TASKS,
  nextReset,
  taskProgress,
  taskSummary,
} from "../tasks.js";
import { formatEP } from "../roll-data.js";
import { gameNow } from "../game-clock.js";
import "../tasks.css";

// How long until a reset, in words short enough for a card header.
export function resetCountdown(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

const count = (n) => n.toLocaleString("en-US");

export default function Tasks({ progress, onAction, notify, openSignup }) {
  const [now, setNow] = useState(() => gameNow());
  const [claiming, setClaiming] = useState("");
  // The countdowns and the reset itself stay honest while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(gameNow()), 30000);
    return () => clearInterval(timer);
  }, []);
  const summary = taskSummary(progress.tasks, now);
  async function claim(task) {
    setClaiming(task.id);
    const outcome = await onAction?.({ type: "claim-task", id: task.id });
    setClaiming("");
    if (outcome?.ok)
      notify?.(`+${formatEP(task.reward)} EP claimed: ${task.title}.`);
    else notify?.(outcome?.message ?? "That task could not be claimed.");
  }
  return (
    <>
      {!progress.profile && (
        <div className="guest-save-notice">
          <p>
            Guest play is not saved, so tasks claimed here are gone when you
            leave. Signing up starts a saved account.
          </p>
          <button className="secondary-button" onClick={openSignup}>
            Sign up to save
          </button>
        </div>
      )}
      <section className="tasks-summary" aria-label="Task summary">
        <span>
          <Coins size={16} aria-hidden="true" />{" "}
          <strong>{formatEP(progress.balance)} EP</strong> available
        </span>
        <span>
          {summary.ready
            ? `${summary.ready} ready to claim`
            : "Nothing ready to claim"}
        </span>
        <span>
          {summary.claimed} of {summary.total} claimed
        </span>
      </section>
      {TASK_CADENCES.map((cadence) => (
        <section
          className="task-group"
          key={cadence}
          aria-labelledby={`task-group-${cadence}`}
        >
          <header className="task-group-head">
            <h2 id={`task-group-${cadence}`}>{CADENCE_NAME[cadence]}</h2>
            <span className="task-reset">
              Resets in {resetCountdown(nextReset(cadence, now) - now)}
            </span>
          </header>
          <ul className="task-list">
            {TASKS.filter((task) => task.cadence === cadence).map((task) => {
              const view = taskProgress(progress.tasks, task, now);
              const shown = Math.min(view.count, view.goal);
              return (
                <li
                  key={task.id}
                  className={`task-card is-${view.state}`}
                  data-task={task.id}
                  data-state={view.state}
                >
                  <div className="task-card-head">
                    <h3>{task.title}</h3>
                    <span className="task-reward">
                      +{formatEP(task.reward)} EP
                    </span>
                  </div>
                  <p>{task.detail}</p>
                  <progress
                    className="task-bar"
                    max={view.goal}
                    value={shown}
                    aria-label={task.title}
                    aria-valuetext={`${count(shown)} of ${count(view.goal)}`}
                  />
                  <div className="task-card-foot">
                    <span className="task-count">
                      {count(shown)} / {count(view.goal)}
                    </span>
                    {view.state === "claimable" && (
                      <button
                        className="primary-button"
                        disabled={!!claiming}
                        aria-label={`Claim reward for ${task.title}`}
                        onClick={() => claim(task)}
                      >
                        {claiming === task.id ? "Claiming…" : "Claim"}
                      </button>
                    )}
                    {view.state === "claimed" && (
                      <span className="task-claimed">
                        <Check size={14} aria-hidden="true" /> Claimed
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="task-note">
        A reward is paid into your wallet once, when you claim it. Unclaimed
        rewards expire when their reset comes. Offline rolls do not count, and
        task EP never counts towards a rebirth.
      </p>
    </>
  );
}
