import React, { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpToLine,
  Trash2,
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
  Ticket,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  BATTLE_PASS_LEVELS,
  PASS_ACTIVE,
  PASS_CADENCES,
  PASS_DAILY_REROLLS,
  activePassMissions,
  battlePassSeason,
  passDateLabel,
  passLevelForXp,
  passMissionProgress,
  passNextReset,
} from "../battle-pass.js";
import {
  CADENCE_NAME,
  LIST_BONUS,
  SKIP_WINDOW_LIMIT,
  SKIP_WINDOW_MS,
  TASK_CADENCES,
  activeTasks,
  listBonusState,
  nextReset,
  skipStatus,
  taskProgress,
  taskSummary,
  waitText,
} from "../tasks.js";
import { formatEP } from "../roll-data.js";
import "../tasks.css";

function resetCountdown(ms) {
  return waitText(ms);
}

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
  anomaly: { name: "Rarity", icon: Sparkles },
  trash: { name: "Bad luck", icon: Trash2 },
  high: { name: "High roll", icon: ArrowUpToLine },
  low: { name: "Low roll", icon: ArrowDownToLine },
  low1k: { name: "Low roll", icon: ArrowDownToLine },
  badges: { name: "Badges", icon: Medal },
};

const count = (n) => n.toLocaleString("en-US");

const PASS_SECTION_NAME = {
  daily: "Daily pass missions",
  weekly: "Weekly pass missions",
  season: "Season milestones",
};

export default function Tasks({
  progress,
  cloudUser = false,
  now,
  onAction,
  notify,
  openSignup,
}) {
  const [pending, setPending] = useState("");
  const [confirming, setConfirming] = useState("");
  const summary = taskSummary(progress.tasks, now);
  const pass = progress.battlePass ?? null;
  const passSeason = battlePassSeason(now);
  const passLive = !!pass?.seasonId && pass.seasonId === passSeason.id;
  const passLevel = passLevelForXp(pass?.xp ?? 0);
  const passSections = PASS_CADENCES.map((cadence) => {
    const missions = activePassMissions(pass ?? {}, cadence, now);
    return {
      cadence,
      missions: missions.map((mission) => ({
        mission,
        ...passMissionProgress(pass ?? {}, mission, now),
      })),
      rerolls: pass?.missions?.[cadence]?.rerolls ?? 0,
      reset: passNextReset(cadence, now) - now,
    };
  });
  const passReady = passSections.reduce(
    (total, section) =>
      total +
      section.missions.filter((view) => view.state === "claimable").length,
    0,
  );
  const skips = skipStatus(progress.tasks, now);
  const skipsFull = skips.tokens >= skips.limit;
  const skipNote = skipsFull
    ? "Full. Use one to swap a task."
    : skips.waitMs > 0
      ? `Next purchase in ${waitText(skips.waitMs)}`
      : "Buy one in the Shop, Tools shelf";

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
  const guestHasTaskProgress = lists.some(
    (list) =>
      list.views.some((view) => view.count > 0 || view.state !== "open") ||
      list.bonus.done > 0 ||
      list.bonus.state !== "open",
  );
  const readyEP = lists.reduce(
    (sum, list) =>
      sum +
      list.readyEP +
      (list.bonus.state === "claimable" ? list.bonus.reward : 0),
    0,
  );
  const busy = !!pending;

  async function claim(list, task) {
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

  async function claimPass(mission) {
    setPending(`pass-${mission.id}`);
    const outcome = await onAction?.({
      type: "claim-pass-mission",
      id: mission.id,
    });
    setPending("");
    if (outcome?.ok)
      notify?.({
        kind: "reward",
        title: `+${count(mission.reward)} BPEP`,
        text: mission.title,
      });
    else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "That pass mission could not be claimed.",
      });
  }

  async function swapPass(mission) {
    setPending(`pass-${mission.id}`);
    const outcome = await onAction?.({
      type: "reroll-pass-mission",
      id: mission.id,
    });
    setPending("");
    if (outcome?.ok)
      notify?.({
        kind: "done",
        title: "Pass mission swapped",
        text: "The new mission is on your list.",
      });
    else
      notify?.({
        kind: "error",
        text: outcome?.message ?? "That pass mission could not be swapped.",
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
      {!cloudUser && !progress.profile && guestHasTaskProgress && (
        <div className="guest-save-notice">
          <p>Guest task progress is temporary. Name a profile to keep it.</p>
          <button className="secondary-button" onClick={openSignup}>
            Name profile
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
          <span className="tasks-stat-label">Pass</span>
          <strong>
            {passLevel} <small>of {BATTLE_PASS_LEVELS} levels</small>
          </strong>
          <small className="tasks-stat-note">
            {passReady > 0
              ? `${passReady} pass mission${passReady === 1 ? "" : "s"} ready · +BPEP`
              : "BPEP missions pay the pass, never the wallet"}
          </small>
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
                  {cadence === "daily"
                    ? "Three tasks a day, new ones at reset"
                    : "Four tasks a week, new ones on Monday"}
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
                <span
                  className="task-reset"
                  title="Tasks refresh at the same time worldwide."
                >
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
      <section className="task-pass" aria-labelledby="task-pass-title">
        <header className="task-pass-head">
          <div>
            <h2 id="task-pass-title">
              <Ticket size={17} aria-hidden="true" /> Battle Pass missions
            </h2>
            <p className="task-group-sub">
              Every pass mission lives here. They pay BPEP, spend it on the pass
              track, and share the same online rolls as the tasks above.
            </p>
          </div>
          <div className="task-group-meta">
            <span className="task-reset">
              <Ticket size={13} aria-hidden="true" />
              {passLive
                ? `Season ${passSeason.index} · level ${passLevel} of ${BATTLE_PASS_LEVELS}`
                : passSeason.upcoming
                  ? `Season ${passSeason.index} starts ${passDateLabel(passSeason.start)}`
                  : "No open pass season"}
            </span>
          </div>
        </header>
        {!passLive && (
          <p className="task-pass-closed">
            Pass missions open with the season. Until then, the tasks above keep
            paying EP into your wallet.
          </p>
        )}
        {passSections.map((section) => {
          const { cadence, missions } = section;
          const swapped =
            cadence === "daily"
              ? Math.max(0, PASS_DAILY_REROLLS - section.rerolls)
              : 0;
          return (
            <section
              className="task-group task-group-pass"
              key={cadence}
              aria-labelledby={`task-pass-${cadence}`}
            >
              <header className="task-group-head">
                <div>
                  <h3 id={`task-pass-${cadence}`}>
                    {PASS_SECTION_NAME[cadence]}
                  </h3>
                  <p className="task-group-sub">
                    {cadence === "season"
                      ? "Long goals that stay with the season."
                      : `Resets in ${resetCountdown(section.reset)} UTC.`}
                    {cadence === "daily" &&
                      ` Free swaps left today: ${swapped}.`}
                  </p>
                </div>
                <div className="task-group-meta">
                  <span className="task-segments" aria-hidden="true">
                    {missions.map((view) => (
                      <span
                        key={view.mission.id}
                        className={`task-seg is-${view.state}`}
                      />
                    ))}
                  </span>
                  <span className="task-reset">
                    {missions.length} of {PASS_ACTIVE[cadence]} active
                  </span>
                </div>
              </header>
              <ul className={`task-list task-list-pass-${cadence}`}>
                {missions.map((view) => {
                  const { mission } = view;
                  const shown = Math.min(view.count, view.goal);
                  const percent = Math.round((shown / view.goal) * 100);
                  return (
                    <li
                      key={mission.id}
                      className={`task-card is-${view.state}`}
                      data-pass-mission={mission.id}
                      data-state={view.state}
                    >
                      <div className="task-card-top">
                        <span className="task-icon" aria-hidden="true">
                          <Ticket size={18} />
                        </span>
                        <div className="task-card-title">
                          <span className="task-kind">
                            {PASS_SECTION_NAME[cadence]}
                          </span>
                          <h3>{mission.title}</h3>
                          <p>{mission.detail}</p>
                        </div>
                        <span className="task-reward">
                          +{count(mission.reward)} BPEP
                        </span>
                      </div>
                      <div className="task-progress">
                        <progress
                          className="task-bar"
                          max={view.goal}
                          value={shown}
                          aria-label={mission.title}
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
                            disabled={busy || !passLive}
                            aria-label={`Claim BPEP for ${mission.title}`}
                            onClick={() => claimPass(mission)}
                          >
                            {pending === `pass-${mission.id}`
                              ? "Claiming…"
                              : "Claim"}
                          </button>
                        )}
                        {view.state === "open" &&
                          cadence === "daily" &&
                          passLive && (
                            <button
                              className="secondary-button task-skip"
                              disabled={
                                busy || section.rerolls >= PASS_DAILY_REROLLS
                              }
                              aria-label={`Swap ${mission.title}`}
                              onClick={() => swapPass(mission)}
                            >
                              <ArrowRightLeft size={13} aria-hidden="true" />{" "}
                              Swap
                            </button>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </section>

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
