import React, { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  Coins,
  Dices,
  Gem,
  Layers,
  Medal,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import {
  ACTIVE_PER_PERIOD,
  CADENCE_NAME,
  SKIP_INTERVAL_MS,
  TASKS,
  TASK_CADENCES,
  activeTasks,
  nextReset,
  skipStatus,
  taskProgress,
  taskSummary,
  waitText,
} from "../tasks.js";
import { formatEP } from "../roll-data.js";
import { gameNow } from "../game-clock.js";
import "../tasks.css";

// How long until a reset, in words short enough for a card header.
export function resetCountdown(ms) {
  return waitText(ms);
}

// Each kind of task has its own mark, so a list reads at a glance.
const METRIC_ICON = {
  rolls: Dices,
  rare: Sparkles,
  epic: Gem,
  multi: Layers,
  discovered: Medal,
  banked: Coins,
  skills: Zap,
};

const count = (n) => n.toLocaleString("en-US");
const POOL_SIZE = (cadence) =>
  TASKS.filter((task) => task.cadence === cadence).length;

export default function Tasks({ progress, onAction, notify, openSignup }) {
  const [now, setNow] = useState(() => gameNow());
  // The one action in flight, and the one card asking to be confirmed.
  const [pending, setPending] = useState("");
  const [confirming, setConfirming] = useState("");
  // The countdowns and the reset itself stay honest while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(gameNow()), 30000);
    return () => clearInterval(timer);
  }, []);
  const summary = taskSummary(progress.tasks, now);
  const skips = skipStatus(progress.tasks, now);
  const skipsFull = skips.tokens >= skips.limit;
  const skipNote = skipsFull
    ? "Full. Use one to swap a task."
    : skips.waitMs > 0
      ? `Next purchase in ${waitText(skips.waitMs)}`
      : "Buy one in the Shop, Tools shelf";

  async function claim(task) {
    setPending(task.id);
    const outcome = await onAction?.({ type: "claim-task", id: task.id });
    setPending("");
    if (outcome?.ok)
      notify?.(`+${formatEP(task.reward)} EP claimed: ${task.title}.`);
    else notify?.(outcome?.message ?? "That task could not be claimed.");
  }

  async function skip(task) {
    setConfirming("");
    setPending(task.id);
    const outcome = await onAction?.({ type: "skip-task", id: task.id });
    setPending("");
    if (outcome?.ok)
      notify?.(
        `Task Skip used on ${task.title}. Check your list for the new task.`,
      );
    else notify?.(outcome?.message ?? "That task could not be skipped.");
  }

  function skipHint() {
    if (skips.tokens < 1)
      return skips.waitMs > 0
        ? `No Task Skip left. The next one can be bought in ${waitText(skips.waitMs)}.`
        : "No Task Skip left. Buy one in the Shop, Tools shelf.";
    return "Swap this task for another from its pool.";
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
        <div className="tasks-stat">
          <span className="tasks-stat-label">Available</span>
          <strong>
            <Coins size={15} aria-hidden="true" />
            {formatEP(progress.balance)} EP
          </strong>
        </div>
        <div className="tasks-stat">
          <span className="tasks-stat-label">Ready</span>
          <strong>
            {summary.ready} <small>ready to claim</small>
          </strong>
        </div>
        <div className="tasks-stat">
          <span className="tasks-stat-label">Claimed</span>
          <strong>
            {summary.claimed} <small>of {summary.total} this reset</small>
          </strong>
        </div>
        <div className="tasks-stat">
          <span className="tasks-stat-label">Task Skips</span>
          <strong>
            {skips.tokens} <small>of {skips.limit} held</small>
          </strong>
          <small className="tasks-stat-note">{skipNote}</small>
        </div>
      </section>
      {TASK_CADENCES.map((cadence) => {
        const list = activeTasks(progress.tasks, cadence, now);
        const views = list.map((task) =>
          taskProgress(progress.tasks, task, now),
        );
        const reset = nextReset(cadence, now) - now;
        return (
          <section
            className="task-group"
            key={cadence}
            aria-labelledby={`task-group-${cadence}`}
          >
            <header className="task-group-head">
              <div>
                <h2 id={`task-group-${cadence}`}>{CADENCE_NAME[cadence]}</h2>
                <p className="task-group-sub">
                  {ACTIVE_PER_PERIOD} of {POOL_SIZE(cadence)} tasks on your list
                </p>
              </div>
              <div className="task-group-meta">
                <span className="task-segments" aria-hidden="true">
                  {views.map((view, index) => (
                    <span key={index} className={`task-seg is-${view.state}`} />
                  ))}
                </span>
                <span className="task-reset">
                  <Timer size={13} aria-hidden="true" />
                  Resets in {resetCountdown(reset)}
                </span>
              </div>
            </header>
            <ul className="task-list">
              {list.map((task, index) => {
                const view = views[index];
                const shown = Math.min(view.count, view.goal);
                const Icon = METRIC_ICON[task.metric] ?? CalendarDays;
                const asking = confirming === task.id;
                const busy = !!pending;
                return (
                  <li
                    key={task.id}
                    className={`task-card is-${view.state}`}
                    data-task={task.id}
                    data-state={view.state}
                  >
                    <div className="task-card-top">
                      <span className="task-icon" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div className="task-card-title">
                        <h3>{task.title}</h3>
                        <p>{task.detail}</p>
                      </div>
                      <span className="task-reward">
                        +{formatEP(task.reward)} EP
                      </span>
                    </div>
                    <div className="task-progress">
                      <progress
                        className="task-bar"
                        max={view.goal}
                        value={shown}
                        aria-label={task.title}
                        aria-valuetext={`${count(shown)} of ${count(view.goal)}`}
                      />
                      <span className="task-count">
                        {count(shown)} / {count(view.goal)}
                      </span>
                    </div>
                    <div className="task-card-foot">
                      {view.state === "claimed" && (
                        <span className="task-claimed">
                          <Check size={14} aria-hidden="true" /> Claimed
                        </span>
                      )}
                      {view.state === "claimable" && (
                        <button
                          className="primary-button task-claim"
                          disabled={busy}
                          aria-label={`Claim reward for ${task.title}`}
                          onClick={() => claim(task)}
                        >
                          {pending === task.id ? "Claiming…" : "Claim"}
                        </button>
                      )}
                      {view.state === "open" && !asking && (
                        <button
                          className="secondary-button task-skip"
                          disabled={busy || skips.tokens < 1}
                          aria-label={`Skip ${task.title}`}
                          title={skipHint()}
                          onClick={() => setConfirming(task.id)}
                        >
                          <ArrowRightLeft size={13} aria-hidden="true" />
                          {pending === task.id ? "Swapping…" : "Skip"}
                        </button>
                      )}
                      {view.state === "open" && asking && (
                        <span className="task-confirm">
                          <span>Swap this task for another?</span>
                          <button
                            className="primary-button"
                            disabled={busy}
                            aria-label={`Confirm skip of ${task.title}`}
                            onClick={() => skip(task)}
                          >
                            Swap
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => setConfirming("")}
                          >
                            Keep
                          </button>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="task-note">
        A reward is paid into your wallet once, when you claim it. Unclaimed
        rewards expire when their reset comes. Offline rolls do not count, and
        task EP never counts towards a rebirth. A Task Skip swaps one open task
        for another from its pool. You can buy one every{" "}
        {SKIP_INTERVAL_MS / 86400000} days in the Shop, and hold up to three.
      </p>
    </>
  );
}
