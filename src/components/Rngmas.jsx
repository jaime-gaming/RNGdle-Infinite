import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ADVENT_CATCH_UP_DAYS,
  ADVENT_DAYS,
  ADVENT_DOORS,
  ADVENT_FINALE,
  GOLEM_SMASH_COST,
  GOLEM_SMASH_BASE_DAMAGE,
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
              ? `${opened} / ${ADVENT_DAYS} doors · ${defeated} / ${RNGMAS_WEEKS.length} golems`
              : `Advent calendar, five golems and a winter theme · ${whenLine(status)}`}
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
              Five weeks of doors, golems and winter light.
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
            <strong>{RNGMAS_WEEKS.length} golems</strong>
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
            A new door opens every day from December 1. Missed doors stay open
            for {ADVENT_CATCH_UP_DAYS} days, so a quiet week never costs you the
            whole calendar. The last door holds the Gingerbread aura, and on
            December 25 the RNGmas Star opens its own door.
          </p>
        </section>

        <section className="rngmas-block">
          <h3>
            <Hammer size={14} aria-hidden="true" /> Golem Smash
          </h3>
          <p>
            Each week a golem wakes with a pool of EP for a health bar. Spend{" "}
            {formatEP(GOLEM_SMASH_COST)} EP on a strike: the strike rolls a
            random multiplier, from a ×1 chip to a ×100 RNGmas miracle. Defeat
            the golem and its permanent aura is yours. The damage carries
            between strikes, and the golem keeps its progress until its week
            ends.
          </p>
          <p className="rngmas-note">
            A strike deals {formatEP(GOLEM_SMASH_BASE_DAMAGE)} damage before its
            multiplier. Nothing here changes roll odds, scoring or badge values.
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
            <Star size={14} aria-hidden="true" /> The weekly golems
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
            One door a day from December 1. A missed door stays open for{" "}
            {ADVENT_CATCH_UP_DAYS} days.
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

function lastStrikeOf(progress, golemId) {
  const history = progress?.history ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.type === "golem-smash" && entry.golemId === golemId) return entry;
  }
  return null;
}

export function GolemSmash({ progress, status, onSmash, pending }) {
  const [hit, setHit] = useState(false);
  const hitTimer = useRef(0);
  useEffect(
    () => () => {
      clearTimeout(hitTimer.current);
    },
    [],
  );
  const week = status.week;
  if (!week) {
    return (
      <section className="golem-card is-empty">
        <div className="rngmas-section-heading">
          <div>
            <h3>
              <Hammer size={16} /> Golem Smash
            </h3>
            <p>
              No golem is awake this week. The next one arrives with its week.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const record = golemProgress(progress?.rngmas, week);
  const aura = RNGMAS_COSMETICS_BY_ID.get(week.reward);
  const lastStrike = lastStrikeOf(progress, week.id);
  const affordable = progress.balance >= GOLEM_SMASH_COST;
  const ended = status.now >= week.end;
  return (
    <section
      className={`golem-card ${record.defeated ? "is-defeated" : ""} ${
        hit ? "is-hit" : ""
      }`}
      style={{ "--golem-accent": week.accent }}
      aria-labelledby="golem-title"
    >
      <div className="rngmas-section-heading">
        <div>
          <span className="golem-kicker">
            Golem Smash · Week {week.index} of {RNGMAS_WEEKS.length}
          </span>
          <h3 id="golem-title">{week.name}</h3>
          <p>{week.blurb}</p>
        </div>
        <span className="rngmas-section-stat">
          {rngmasDateLabel(week.start)} – {rngmasDateLabel(week.end)}
        </span>
      </div>

      <div className="golem-stage">
        <div className="golem-figure" aria-hidden="true">
          <span className="golem-eye" />
          <span className="golem-eye" />
          <span className="golem-mouth" />
        </div>
        <div className="golem-body">
          <div
            className="golem-hp"
            role="img"
            aria-label={`${Math.round(record.fraction * 100)}% of ${week.name} damaged`}
          >
            <i style={{ width: `${record.fraction * 100}%` }} />
          </div>
          <div className="golem-hp-label">
            <span>
              {record.defeated
                ? "Defeated"
                : `${formatEP(record.remaining)} EP left`}
            </span>
            <span>
              {formatEP(record.damage)} / {formatEP(week.hp)}
            </span>
          </div>
          {lastStrike && !record.defeated && (
            <p className="golem-strike" role="status">
              <strong>{lastStrike.label}</strong> · ×{lastStrike.multiplier} ·{" "}
              {formatEP(lastStrike.damage)} damage
            </p>
          )}
          {record.defeated ? (
            <p className="golem-defeated">
              <Check size={15} /> {week.name} defeated.{" "}
              <strong>{aura.name}</strong> is yours forever.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="primary-button golem-smash-button"
                disabled={pending || !affordable}
                onClick={() => {
                  setHit(true);
                  clearTimeout(hitTimer.current);
                  hitTimer.current = setTimeout(() => setHit(false), 460);
                  onSmash?.();
                }}
              >
                <Hammer size={16} />
                {affordable
                  ? `Smash for ${formatEP(GOLEM_SMASH_COST)} EP`
                  : `${formatEP(GOLEM_SMASH_COST - progress.balance)} EP to go`}
              </button>
              <p className="rngmas-note">
                Each strike rolls a random multiplier, from ×1 to ×100. The
                golem keeps its damage between strikes
                {ended ? ", but this week is over." : "."}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="golem-reward">
        <span className="golem-reward-art" aria-hidden="true">
          <NumberBox
            value={record.defeated ? "GG" : "??"}
            tier="rare"
            aura={aura.id}
            compact
          />
        </span>
        <span>
          <small>Weekly reward</small>
          <strong>{aura.name}</strong>
          <em>{record.defeated ? "Unlocked" : "Locked until defeated"}</em>
        </span>
      </div>
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
          <p>Five weeks, five golems, five permanent auras.</p>
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
                {state.defeated ? aura.name : "??? "}
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
      status.week ? `You struck the ${status.week.name}.` : "Strike landed.",
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
            Doors, golems and winter light. {rngmasRangeLabel()} · all times
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
        progress={progress}
        status={status}
        onSmash={smash}
        pending={pending}
      />
      <RngmasWeeks progress={progress} />

      <p className="rngmas-shelf-fine">
        The calendar and the golems pay EP and permanent auras. Nothing here
        changes roll odds, scoring tables, badge values or cooldowns.
      </p>
    </section>
  );
}
