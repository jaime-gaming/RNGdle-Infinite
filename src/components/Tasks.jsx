import React, { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCheck,
  Coins,
  Crown,
  Dices,
  Gem,
  Gift,
  Layers,
  Medal,
  PawPrint,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  ACTIVE_PER_PERIOD,
  CADENCE_NAME,
  LIST_BONUS,
  SKIP_WINDOW_LIMIT,
  SKIP_WINDOW_MS,
  TASKS,
  TASK_CADENCES,
  activeTasks,
  listBonusState,
  nextReset,
  skipStatus,
  taskProgress,
  taskSummary,
  auraEventState,
  waitText,
} from "../tasks.js";
import { formatEP } from "../roll-data.js";
import { productById } from "../shop-data.js";
import NumberBox from "./NumberBox";
import { gameNow } from "../game-clock.js";
import "../tasks.css";

// How long until a reset, in words short enough for a card header.
export function resetCountdown(ms) {
  return waitText(ms);
}

// Each kind of task has a short name and its own mark, so a list reads at a
// glance: what it asks for, not only how much it pays.
const KIND = {
  rolls: { name: "Volume", icon: Dices },
  rare: { name: "Rarity", icon: Sparkles },
  epic: { name: "Rarity", icon: Gem },
  mythic: { name: "Rarity", icon: Crown },
  multi: { name: "Draw", icon: Layers },
  discovered: { name: "Badges", icon: Medal },
  peakBadges: { name: "Badges", icon: BadgeCheck },
  banked: { name: "Income", icon: Coins },
  peakEP: { name: "Big roll", icon: TrendingUp },
  skills: { name: "Skills", icon: Zap },
  pets: { name: "Companion", icon: PawPrint },
};

const count = (n) => n.toLocaleString("en-US");
const POOL_SIZE = (cadence) =>
  TASKS.filter((task) => task.cadence === cadence).length;

function eventCountText(mission) {
  if (mission.metric === "banked")
    return `${formatEP(mission.count)} / ${formatEP(mission.goal)} EP`;
  const unit =
    mission.metric === "rare"
      ? "Rare+"
      : mission.metric === "taskClaims"
        ? "tasks"
        : "rolls";
  return `${count(mission.count)} / ${count(mission.goal)} ${unit}`;
}

export default function Tasks({
  progress,
  onAction,
  notify,
  openSignup,
  openAuraFamily,
}) {
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
  const transmission = auraEventState(progress.tasks, now);
  const skips = skipStatus(progress.tasks, now);
  const skipsFull = skips.tokens >= skips.limit;
  const skipNote = skipsFull
    ? "Full. Use one to swap a task."
    : skips.waitMs > 0
      ? `Next purchase in ${waitText(skips.waitMs)}`
      : "Buy one in the Shop, Tools shelf";

  // Each list with what it shows: its tasks as views, and what is ready to pay.
  const lists = TASK_CADENCES.map((cadence) => {
    const tasks = activeTasks(progress.tasks, cadence, now);
    const views = tasks.map((task) => ({
      task,
      ...taskProgress(progress.tasks, task, now),
    }));
    const ready = views.filter((view) => view.state === "claimable");
    const bonus = listBonusState(progress.tasks, cadence, now);
    return {
      cadence,
      views,
      ready,
      readyEP: ready.reduce((sum, view) => sum + view.task.reward, 0),
      bonus,
      reset: nextReset(cadence, now) - now,
    };
  });
  const readyEP = lists.reduce(
    (sum, list) =>
      sum +
      list.readyEP +
      (list.bonus.state === "claimable" ? list.bonus.reward : 0),
    0,
  );
  const busy = !!pending;

  async function claim(list, task) {
    // This claim is the last one on the list when every other task is claimed.
    const finishes =
      list.bonus.state === "open" && list.bonus.done + 1 === list.bonus.total;
    setPending(task.id);
    const outcome = await onAction?.({ type: "claim-task", id: task.id });
    setPending("");
    if (outcome?.ok) {
      notify?.({
        kind: "reward",
        title: `+${formatEP(task.reward)} EP`,
        text: task.title,
      });
      if (finishes)
        notify?.({
          kind: "milestone",
          title: `${CADENCE_NAME[task.cadence]} list complete`,
          text: `+${formatEP(LIST_BONUS[task.cadence])} EP list bonus ready to collect.`,
        });
    } else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "That task could not be claimed.",
      });
  }

  async function collect(list) {
    setPending(`bonus-${list.cadence}`);
    const outcome = await onAction?.({
      type: "collect-list-bonus",
      cadence: list.cadence,
    });
    setPending("");
    if (outcome?.ok)
      notify?.({
        kind: "reward",
        title: `+${formatEP(LIST_BONUS[list.cadence])} EP`,
        text: `${CADENCE_NAME[list.cadence]} list bonus collected.`,
      });
    else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "The list bonus could not be collected yet.",
      });
  }

  async function collectAura(mission, aura) {
    const actionId = `event-${mission.id}`;
    setPending(actionId);
    const outcome = await onAction?.({
      type: "claim-event-aura",
      id: mission.id,
    });
    setPending("");
    if (outcome?.ok)
      notify?.({
        kind: "reward",
        title: `${aura?.name ?? "Event aura"} collected`,
        text: "Added to your collection. It stays with you through rebirths.",
      });
    else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "That aura could not be collected yet.",
      });
  }

  async function skip(task) {
    setConfirming("");
    setPending(task.id);
    const outcome = await onAction?.({ type: "skip-task", id: task.id });
    setPending("");
    if (outcome?.ok)
      notify?.({
        kind: "done",
        title: "Task Skip used",
        text: `${task.title} is swapped out. The new task is on your list.`,
      });
    else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "That task could not be skipped.",
      });
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
      <section
        className="signal-event"
        data-event-phase={transmission.phase}
        aria-labelledby="signal-event-title"
      >
        <header className="signal-event-head">
          <div className="signal-event-heading">
            <span className="signal-event-eyebrow">Limited event</span>
            <h2 id="signal-event-title">R4ND0MN3S5</h2>
          </div>
          <div className="signal-event-meta">
            <span className={`signal-event-status is-${transmission.phase}`}>
              <i aria-hidden="true" />
              {transmission.phase === "active"
                ? "Live"
                : transmission.phase === "upcoming"
                  ? "Starts soon"
                  : "Ended"}
            </span>
          </div>
        </header>
        <div className="signal-event-summary">
          <p>
            Finish a mission, then collect its matching aura here. Each one is
            free and stays in your collection through rebirths.
          </p>
          <button
            type="button"
            className="signal-event-link"
            onClick={() => openAuraFamily?.("randomness")}
          >
            View aura family <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="signal-event-progress">
          <div className="signal-event-progress-label">
            <span>Mission progress</span>
            <strong>
              {transmission.complete} / {transmission.total} auras
            </strong>
          </div>
          <progress
            max={transmission.total}
            value={transmission.complete}
            aria-label="R4ND0MN3S5 event progress"
          />
          <span className="signal-event-countdown">
            {transmission.phase === "active"
              ? `Ends in ${waitText(transmission.endsAt - now)}`
              : transmission.phase === "upcoming"
                ? `Starts in ${waitText(transmission.startsAt - now)}`
                : "Event ended"}
          </span>
        </div>
        <ul className="signal-mission-grid" aria-label="Event missions">
          {transmission.missions.map((mission, index) => {
            const aura = productById.get(mission.auraId);
            const isOwned = progress.owned.includes(mission.auraId);
            const status = mission.collected
              ? "Collected"
              : mission.claimable
                ? "Ready to collect"
                : mission.complete
                  ? "Complete"
                  : transmission.phase === "active"
                    ? "In progress"
                    : transmission.phase === "upcoming"
                      ? "Upcoming"
                      : "Event ended";
            return (
              <li
                className={`signal-mission ${mission.complete ? "is-complete" : ""}`}
                key={mission.id}
                data-event-mission={mission.id}
                data-state={
                  mission.collected
                    ? "collected"
                    : mission.claimable
                      ? "claimable"
                      : mission.complete
                        ? "complete"
                        : transmission.phase
                }
                style={{
                  "--signal-a": aura?.swatch?.[0] ?? "#74f0b4",
                  "--signal-b": aura?.swatch?.[1] ?? "#276a67",
                }}
              >
                <div className="signal-mission-preview" aria-hidden="true">
                  <NumberBox
                    value="R4ND"
                    tier="rare"
                    aura={mission.auraId}
                    compact
                  />
                </div>
                <div className="signal-mission-copy">
                  <div className="signal-mission-line">
                    <span>Mission {String(index + 1).padStart(2, "0")}</span>
                    <span
                      className={
                        mission.collected || mission.claimable
                          ? "is-recovered"
                          : ""
                      }
                    >
                      {status}
                    </span>
                  </div>
                  <h3>{mission.title}</h3>
                  <p>{mission.detail}</p>
                </div>
                <div className="signal-mission-reward">
                  <strong>{aura?.name ?? mission.auraId}</strong>
                  <span>
                    {mission.collected
                      ? "In collection"
                      : isOwned
                        ? "Already owned · collect to finish"
                        : "Free aura reward"}
                  </span>
                </div>
                <div className="signal-mission-meter">
                  <progress
                    max={mission.goal}
                    value={mission.count}
                    aria-label={`${mission.title} progress`}
                  />
                  <span>{eventCountText(mission)}</span>
                </div>
                {mission.claimable && (
                  <button
                    type="button"
                    className="signal-mission-claim"
                    disabled={busy}
                    onClick={() => collectAura(mission, aura)}
                  >
                    <Gift size={14} aria-hidden="true" />
                    {pending === `event-${mission.id}`
                      ? "Collecting…"
                      : `Collect ${aura?.name ?? "aura"}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
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
            {summary.ready} <small>to claim</small>
          </strong>
          <small className="tasks-stat-note">
            {readyEP > 0
              ? `Worth +${formatEP(readyEP)} EP together`
              : "Nothing waiting for you"}
          </small>
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
      {lists.map((list) => {
        const { cadence, views, bonus } = list;
        const allClaimed = bonus.state === "claimed";
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
                  {ACTIVE_PER_PERIOD[cadence]} of {POOL_SIZE(cadence)} tasks on
                  your list
                </p>
              </div>
              <div className="task-group-meta">
                <span className="task-segments" aria-hidden="true">
                  {views.map((view) => (
                    <span
                      key={view.task.id}
                      className={`task-seg is-${view.state}`}
                    />
                  ))}
                </span>
                <span className="task-reset">
                  <Timer size={13} aria-hidden="true" />
                  Resets in {resetCountdown(list.reset)}
                </span>
              </div>
            </header>
            <ul className={`task-list task-list-${cadence}`}>
              {views.map((view) => {
                const { task } = view;
                const shown = Math.min(view.count, view.goal);
                const kind = KIND[task.metric] ?? {
                  name: "Task",
                  icon: CalendarDays,
                };
                const Icon = kind.icon;
                const asking = confirming === task.id;
                const percent = Math.round((shown / view.goal) * 100);
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
                        <span className="task-kind">{kind.name}</span>
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
                        <span className="task-percent"> · {percent}%</span>
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
                          onClick={() => claim(list, task)}
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
                          <span>Swap it for another? Uses a Task Skip.</span>
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
            <div
              className={`task-bonus is-${bonus.state}`}
              data-bonus={cadence}
              data-state={bonus.state}
            >
              <span className="task-bonus-icon" aria-hidden="true">
                {allClaimed ? <CheckCheck size={16} /> : <Gift size={16} />}
              </span>
              <div className="task-bonus-text">
                <strong>
                  {CADENCE_NAME[cadence]} list bonus · +{formatEP(bonus.reward)}{" "}
                  EP
                </strong>
                <span>
                  {allClaimed
                    ? "Paid. Every task on this list is claimed."
                    : bonus.state === "claimable"
                      ? "Ready to collect."
                      : `${bonus.done} of ${bonus.total} claimed. Claim every task to unlock it.`}
                </span>
              </div>
              {bonus.state === "claimable" && (
                <button
                  className="primary-button task-claim"
                  disabled={busy}
                  aria-label={`Collect ${cadence} list bonus`}
                  onClick={() => collect(list)}
                >
                  {pending === `bonus-${cadence}` ? "Collecting…" : "Collect"}
                </button>
              )}
            </div>
          </section>
        );
      })}
      <p className="task-note">
        A reward is paid into your wallet once, when you claim it. Finishing
        every task on a list unlocks its list bonus, which you collect with its
        own button. Unclaimed rewards and bonuses expire when their reset comes.
        Offline rolls do not count, and task EP never counts towards a rebirth.
        A Task Skip swaps one open task for another from its pool. You can buy
        one a day in the Shop, no more than {SKIP_WINDOW_LIMIT} in any{" "}
        {SKIP_WINDOW_MS / 86400000} days, and hold up to three.
      </p>
    </>
  );
}
