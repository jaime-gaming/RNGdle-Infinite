import React, { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Gift,
  Hammer,
  Lock,
  Snowflake,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  ADVENT_DAYS,
  ADVENT_DOORS,
  ADVENT_FINALE,
  GOLEM_SMASH_COST,
  RNGMAS_COSMETICS_BY_ID,
  RNGMAS_TEMPORARY_THEMES,
  RNGMAS_WEEKS,
  adventClaimableDays,
  adventDoorAt,
  adventFinaleAt,
  adventRewardFor,
  golemProgress,
  rngmasDateLabel,
  rngmasRangeLabel,
} from "../rngmas.js";
import { formatEP } from "../roll-data.js";
import { waitText } from "../tasks.js";
import { useModalDialog } from "../use-modal-dialog.js";
import { useRngmasStatus } from "../use-rngmas.js";
import NumberBox from "./NumberBox";
import "../rngmas.css";
import "../winter-missions.css";

function whenLine(status) {
  if (status.active)
    return `Live now · ends in ${waitText(status.endsInMs)} (UTC)`;
  return `${rngmasDateLabel(status.start, {
    year: "numeric",
  })} · starts in ${waitText(status.startsInMs)} (UTC)`;
}

export function RngmasEventNotice({ progress, onOpenShelf, navigate }) {
  const status = useRngmasStatus();
  const [open, setOpen] = useState(false);
  const dialog = useModalDialog(open);
  const record = progress?.rngmas ?? null;
  const opened = record?.claimed?.length ?? 0;
  const defeated = Object.values(record?.golems ?? {}).filter(
    (entry) => entry.defeated,
  ).length;
  const finale = record?.finale === true;
  if (!status.shown) return null;
  return (
    <>
      <button
        type="button"
        className={`rngmas-flag ${status.active ? "is-live" : "is-soon"}`}
        data-testid="rngmas-event-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="rngmas-flag-art" aria-hidden="true">
          <Gift size={24} />
          <i>2026</i>
        </span>
        <span className="rngmas-flag-tag">
          <Snowflake size={13} aria-hidden="true" />
          Event
        </span>
        <span className="rngmas-flag-copy">
          <strong>RNGmas 2026</strong>
          <small>
            {status.active
              ? `${opened} / ${ADVENT_DAYS} doors · ${defeated} / ${RNGMAS_WEEKS.length} chapters`
              : `Advent calendar, weekly activities and a winter theme · ${whenLine(status)}`}
          </small>
        </span>
        <span className="rngmas-flag-when" aria-hidden="true">
          <Clock3 size={13} />
          {status.active
            ? waitText(status.endsInMs)
            : waitText(status.startsInMs)}
        </span>
      </button>
      <dialog
        className="rngmas-dialog"
        ref={dialog}
        aria-labelledby="rngmas-dialog-title"
        aria-describedby="rngmas-dialog-when"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        data-testid="rngmas-event-dialog"
      >
        <button
          type="button"
          className="rngmas-dialog-close icon-button"
          aria-label="Close the event explanation"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <div className="rngmas-dialog-hero">
          <div>
            <p className="eyebrow rngmas-eyebrow">
              <Snowflake size={13} aria-hidden="true" /> RNGMAS 2026
            </p>
            <h2 id="rngmas-dialog-title">
              RNGmas <span>2026</span>
            </h2>
            <p className="rngmas-hero-subtitle">
              Daily doors and a different activity each week.
            </p>
          </div>
          <div className="rngmas-hero-art" aria-hidden="true">
            <Gift size={34} />
            <small>
              DEC 1
              <br />
              JAN 2
            </small>
          </div>
        </div>
        <p className="rngmas-when" id="rngmas-dialog-when">
          {rngmasRangeLabel()} · {status.active ? "live now" : "starts soon"} ·
          all times UTC
        </p>

        <div className="rngmas-dialog-highlights" aria-label="Event highlights">
          <span>
            <strong>{ADVENT_DAYS} doors</strong>
            <small>one each day</small>
          </span>
          <span>
            <strong>{RNGMAS_WEEKS.length} chapters</strong>
            <small>one each week</small>
          </span>
          <span>
            <strong>{RNGMAS_TEMPORARY_THEMES.length} theme</strong>
            <small>winter look</small>
          </span>
        </div>

        <section className="rngmas-block">
          <h3>
            <CalendarDays size={14} aria-hidden="true" /> The advent calendar
          </h3>
          <p>
            A new door opens every day from December 1. Claim it before midnight
            UTC or lose it forever. No catch-up. The last door holds the
            Gingerbread aura, and on December 25 the RNGmas Star opens its own
            door.
          </p>
        </section>

        <section className="rngmas-block">
          <h3>
            <Hammer size={14} aria-hidden="true" /> Golem Smash
          </h3>
          <p>
            Each chapter has a different activity: even numbers, winter lights,
            Golem Smash, the gift workshop and a New Year countdown. Complete
            and claim each activity during its week for a permanent aura and one
            Surge Capacitor charge.
          </p>
          <p className="rngmas-note">
            During Golem Smash, prepare a strike for{" "}
            {formatEP(GOLEM_SMASH_COST)} EP, then roll normally. The number you
            roll is the damage. No critical multipliers. Prepared strikes
            survive reloads.
          </p>
        </section>

        <section className="rngmas-block">
          <h3>
            <Sparkles size={14} aria-hidden="true" /> The winter look
          </h3>
          <p>
            While RNGmas is on, the Appearance menu offers{" "}
            {RNGMAS_TEMPORARY_THEMES.map((entry) => entry.label).join(" and ")},
            with snow drifting past the page edges. It leaves the menu when the
            season ends and falls back to the regular dark theme.
          </p>
        </section>

        <section className="rngmas-block">
          <h3>
            <Star size={14} aria-hidden="true" /> Weekly activities
          </h3>
          <ul className="rngmas-week-list">
            {RNGMAS_WEEKS.map((week) => {
              const aura = RNGMAS_COSMETICS_BY_ID.get(week.reward);
              return (
                <li key={week.id}>
                  <span
                    className="aura-swatch"
                    aria-hidden="true"
                    style={{
                      "--swatch-a": aura.swatch[0],
                      "--swatch-b": aura.swatch[1],
                    }}
                  />
                  <span>
                    <strong>{week.name}</strong>
                    <small>
                      {rngmasDateLabel(week.start)} –{" "}
                      {rngmasDateLabel(week.end)}
                    </small>
                  </span>
                  <em>{aura.name}</em>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="rngmas-fine">
          The event is a calendar and cosmetics event. It never touches the
          draw, the scoring tables, badge values or cooldowns. Every aura you
          earn is permanent, so a rebirth, a prestige, a Rollback or a fresh
          start can never take it away.
        </p>
        <div className="rngmas-dialog-actions">
          {onOpenShelf && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setOpen(false);
                onOpenShelf("rngmas");
              }}
            >
              <CalendarDays size={15} /> Open RNGmas
            </button>
          )}
          {navigate && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setOpen(false);
                navigate("shop");
              }}
            >
              Back to the shop
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}

function doorRewardLabel(door) {
  const reward = adventRewardFor(door.day);
  if (!reward) return "??";
  if (reward.ep) return formatEP(reward.ep);
  return reward.item?.name ?? "Aura";
}

export function AdventCalendar({ record, status, onClaim, pending }) {
  const now = status.now;
  const claimed = new Set(record?.claimed ?? []);
  const claimable = useMemo(
    () => new Set(adventClaimableDays(record, now)),
    [record, now],
  );
  const finale = adventFinaleAt(now);
  const finaleClaimed = record?.finale === true;
  const opened = claimed.size;
  return (
    <section className="advent-calendar" aria-labelledby="advent-title">
      <div className="rngmas-section-heading">
        <div>
          <h3 id="advent-title">
            <CalendarDays size={16} /> Advent calendar
          </h3>
          <p>
            One door a day from December 1. Claim before midnight UTC or lose
            it.
          </p>
        </div>
        <span className="rngmas-section-stat">
          {opened} / {ADVENT_DAYS} opened
          {finaleClaimed ? " · star claimed" : ""}
        </span>
      </div>

      <div className="advent-grid">
        {ADVENT_DOORS.map((door) => {
          const state = adventDoorAt(door.day, now);
          const isClaimed = claimed.has(door.day);
          const canClaim = claimable.has(door.day);
          const reward = adventRewardFor(door.day);
          return (
            <button
              type="button"
              key={door.day}
              className={`advent-door ${isClaimed ? "is-claimed" : ""} ${
                canClaim ? "is-open is-ready" : ""
              } ${state.missed && !isClaimed ? "is-missed" : ""}`}
              disabled={!canClaim || pending}
              onClick={() => onClaim(door.day)}
              aria-label={`Advent door ${door.day}${
                isClaimed
                  ? ", opened"
                  : canClaim
                    ? ", open now"
                    : state.missed
                      ? ", missed"
                      : ", opens " + rngmasDateLabel(state.open)
              }`}
            >
              <span className="advent-door-top" aria-hidden="true">
                <em>{door.day}</em>
                {isClaimed ? (
                  <Check size={14} />
                ) : canClaim ? (
                  <Gift size={14} />
                ) : (
                  <Lock size={12} />
                )}
              </span>
              <span className="advent-door-reward" aria-hidden="true">
                {isClaimed || canClaim ? doorRewardLabel(door) : "???"}
              </span>
              <span className="advent-door-kind" aria-hidden="true">
                {reward?.ep ? "EP" : reward?.aura ? "Aura" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`advent-star ${finaleClaimed ? "is-claimed" : ""} ${
          finale.openNow && !finaleClaimed ? "is-open" : ""
        }`}
        disabled={!finale.openNow || finaleClaimed || pending}
        onClick={() => onClaim(ADVENT_FINALE.day)}
        aria-label={`Christmas Day star${
          finaleClaimed
            ? ", claimed"
            : finale.openNow
              ? ", open now"
              : finale.missed
                ? ", missed"
                : ", opens December 25"
        }`}
        data-testid="advent-star"
      >
        <span className="advent-star-art" aria-hidden="true">
          <Star size={26} />
        </span>
        <span className="advent-star-copy">
          <strong>Christmas Day · RNGmas Star</strong>
          <small>
            {finaleClaimed
              ? "The star is yours. Kept forever."
              : finale.openNow
                ? "Open the star and claim the limited aura."
                : finale.missed
                  ? "Missed · this door closed at midnight UTC."
                  : `Opens December 25 · ${waitText(
                      Math.max(0, finale.open - now),
                    )}`}
          </small>
        </span>
        <span className="advent-star-aura" aria-hidden="true">
          <NumberBox
            value="25"
            tier="rare"
            aura="rngmas-star"
            compact
            className="advent-star-number"
          />
        </span>
      </button>
    </section>
  );
}

export function GolemSmash({ progress, status, onSmash, onClaim, pending }) {
  const week = status.week;
  if (!week) return null;
  const record = progress.rngmas.golems[week.id];
  const isGolem = week.metric === "damage";
  const count = isGolem ? record.damage : (record.count ?? 0);
  const ready = count >= week.goal;
  const aura = RNGMAS_COSMETICS_BY_ID.get(week.reward);
  return (
    <section aria-label="Weekly winter activity">
      <ul className="winter-missions">
        <li
          className="winter-mission"
          data-state={
            record.defeated ? "collected" : ready ? "claimable" : "open"
          }
          style={{ "--treat-a": aura.swatch[0], "--treat-b": aura.swatch[1] }}
        >
          <div className="winter-mission-top">
            <span>
              Chapter {week.index} · {rngmasDateLabel(week.start)} –{" "}
              {rngmasDateLabel(week.end)} UTC
            </span>
            <span>
              {record.defeated
                ? "Collected"
                : ready
                  ? "Ready to collect"
                  : "In progress"}
            </span>
          </div>
          <div className="winter-mission-preview" aria-hidden="true">
            <NumberBox
              value={record.lastNumber ?? "2026"}
              tier="rare"
              aura={aura.id}
              compact
            />
          </div>
          <h3>{week.name}</h3>
          <p>{week.blurb}</p>
          <div className="winter-mission-meter">
            <span>
              {formatEP(count)} / {formatEP(week.goal)}{" "}
              {isGolem ? "damage" : "rolls"}
            </span>
            <progress
              max={week.goal}
              value={count}
              aria-label={`${week.name} progress`}
            />
          </div>
          {isGolem && !ready && !record.defeated && (
            <>
              <p className="rngmas-note">
                One prepared strike uses your next normal roll: 0–1,000,000
                damage, averaging 500,000. No multipliers or critical hits.
                About 50 strikes (5,000,000 EP) on average. Skills and offline
                rolls do not add damage.
              </p>
              {record.lastNumber != null && (
                <p role="status">
                  Last strike: <strong>{formatEP(record.lastNumber)}</strong>{" "}
                  damage · {record.strikes} strikes
                </p>
              )}
              {record.armed ? (
                <p role="status">
                  Strike prepared.{" "}
                  <a href={import.meta.env.BASE_URL}>Go to Roll</a> to land it.
                  Saved across reloads; land it before this chapter ends.
                </p>
              ) : (
                <button
                  className="secondary-button"
                  disabled={
                    pending ||
                    progress.balance < GOLEM_SMASH_COST ||
                    !!progress.pendingRoll
                  }
                  onClick={onSmash}
                >
                  Prepare strike · {formatEP(GOLEM_SMASH_COST)} EP
                </button>
              )}
            </>
          )}
          <p className="winter-mission-reward">
            <Gift size={14} aria-hidden="true" />{" "}
            <strong>
              {aura.name}
              {week.ep ? ` + ${formatEP(week.ep)} EP` : ""}
            </strong>{" "}
            · permanent aura + 1 Surge Capacitor charge
          </p>
          <button
            className={ready ? "primary-button" : "secondary-button"}
            disabled={pending || !ready || record.defeated}
            onClick={onClaim}
          >
            {record.defeated
              ? "In your collection"
              : ready
                ? `Collect ${aura.name}`
                : "Complete activity to collect"}
          </button>
        </li>
        <li className="winter-mission">
          <h3>This week's rules</h3>
          <p>
            Progress comes from your main online roll only. Extra skill results
            and offline rolls do not count. You can play normally, including
            Auto-Roll. Claim before this chapter ends; there is no catch-up.
            Collected auras survive resets.
          </p>
          <p>
            The calendar is separate: each door must be claimed on its own UTC
            day.
          </p>
        </li>
      </ul>
    </section>
  );
}

export function RngmasWeeks({ progress }) {
  const now = useRngmasStatus().now;
  const record = progress?.rngmas;
  return (
    <section className="rngmas-weeks" aria-labelledby="rngmas-weeks-title">
      <div className="rngmas-section-heading">
        <div>
          <h3 id="rngmas-weeks-title">
            <Sparkles size={16} /> The season
          </h3>
          <p>Different weekly activities. Five permanent auras.</p>
        </div>
      </div>
      <ol className="rngmas-week-timeline">
        {RNGMAS_WEEKS.map((week) => {
          const state = golemProgress(record, week);
          const aura = RNGMAS_COSMETICS_BY_ID.get(week.reward);
          const current = now >= week.start && now < week.end;
          const past = now >= week.end;
          return (
            <li
              key={week.id}
              className={`${current ? "is-current" : ""} ${
                past ? "is-past" : ""
              } ${state.defeated ? "is-defeated" : ""}`}
              style={{ "--week-accent": week.accent }}
            >
              <span className="rngmas-week-dot" aria-hidden="true" />
              <span className="rngmas-week-copy">
                <strong>
                  {week.name}
                  {current && (
                    <span className="rngmas-week-live">This week</span>
                  )}
                </strong>
                <small>
                  {rngmasDateLabel(week.start)} – {rngmasDateLabel(week.end)}
                </small>
              </span>
              <span className="rngmas-week-reward">
                <span
                  className="aura-swatch"
                  aria-hidden="true"
                  style={{
                    "--swatch-a": aura.swatch[0],
                    "--swatch-b": aura.swatch[1],
                  }}
                />
                {aura.name}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function RngmasShelf({ progress, onAction, notify }) {
  const status = useRngmasStatus();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function run(action, message) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const result = await onAction(action);
      if (result.ok) notify?.({ kind: "done", text: message });
      else notify?.({ kind: "error", text: result.message });
      return result.ok;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const claim = (day) =>
    run(
      { type: "claim-advent", day },
      day === ADVENT_FINALE.day
        ? "The RNGmas Star is yours."
        : `Advent door ${day} opened.`,
    );
  const smash = () =>
    run(
      { type: "golem-smash", golemId: status.week?.id },
      "Strike prepared. Your next normal roll will deal damage.",
    );

  return (
    <section
      className="shop-category rngmas-shelf"
      id="shop-rngmas"
      tabIndex={-1}
    >
      <div className="rngmas-hero">
        <div className="rngmas-hero-copy">
          <p className="eyebrow rngmas-eyebrow">
            <Snowflake size={13} aria-hidden="true" /> WINTER EVENT
          </p>
          <h2>
            RNGmas <span>2026</span>
          </h2>
          <p>
            Daily doors and weekly activities. {rngmasRangeLabel()} · all times
            UTC.
          </p>
        </div>
        <div className="rngmas-hero-badge" aria-hidden="true">
          <Gift size={30} />
          <small>
            {status.active
              ? `${waitText(status.endsInMs)} left`
              : "Coming soon"}
          </small>
        </div>
      </div>

      <AdventCalendar
        record={progress.rngmas}
        status={status}
        onClaim={claim}
        pending={pending}
      />
      <GolemSmash
        onClaim={() =>
          run({ type: "claim-winter-week" }, "Weekly reward collected.")
        }
        progress={progress}
        status={status}
        onSmash={smash}
        pending={pending}
      />
      <RngmasWeeks progress={progress} />

      <p className="rngmas-shelf-fine">
        The calendar and weekly activities award EP and permanent auras. Nothing
        here changes roll odds, scoring tables, badge values or cooldowns.
      </p>
    </section>
  );
}
