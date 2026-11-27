import PetIcon from "./PetIcon.jsx";
import WinterFestival from "./WinterFestival.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Radio,
  Check,
  ChevronRight,
  ChevronDown,
  Coins,
  ShoppingBag,
  Zap,
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
  ACTIVE_WINTER_MARKET,
  winterChapterCount,
  SNOWCOIN_EXCHANGE_EP,
  SNOWCOIN_EXCHANGE_CAP,
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
  rngmasDateLabel,
  rngmasRangeLabel,
} from "../rngmas.js";
import { passBoostById } from "../battle-pass.js";
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
            <ShoppingBag size={14} aria-hidden="true" /> The winter trail
          </h3>
          <p>
            Each chapter has a different activity: the Christmas market, the
            Snowcoin exchange, Golem Smash, the gift workshop and a New Year
            countdown. Complete and claim each activity during its week for a
            permanent aura, Snowcoins and a different boost bundle.
          </p>
          <p className="rngmas-note">
            From December 1 to 8, prepare a strike for{" "}
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
            From December 1 until January 2 UTC, the Appearance menu offers{" "}
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

function WinterGolem({ record, goal }) {
  return (
    <div
      className="winter-golem-scene"
      data-armed={record.armed}
      data-finished={record.damage >= goal}
      aria-hidden="true"
    >
      <svg
        key={`${record.strikes}:${record.lastNumber}`}
        data-hit={record.lastNumber != null}
        viewBox="0 0 240 180"
        fill="none"
      >
        <ellipse
          cx="120"
          cy="166"
          rx="74"
          ry="7"
          fill="currentColor"
          opacity=".12"
        />
        <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path
            d="m80 65-22 9-12 50 22 6 18-33m74-32 22 9 12 50-22 6-18-33"
            fill="var(--surface)"
          />
          <path
            d="m84 58 14-22h44l14 22 7 70-22 16H99l-22-16Z"
            fill="var(--surface)"
          />
          <path
            d="m89 138-5 24h28l4-18m35-6 5 24h-28l-4-18"
            fill="var(--surface)"
          />
          <path d="m98 36-8-11 19 4 11-15 11 15 19-4-8 11M94 65h17m18 0h17" />
          <path
            d="m120 83 15 18-15 23-15-23Z"
            className="winter-golem-heart"
            fill="currentColor"
          />
          <path d="m90 83 9 12-8 16m59-28-9 12 8 16m-47-60h36" opacity=".5" />
        </g>
        <path
          d="m54 48 3-7 3 7 7 3-7 3-3 7-3-7-7-3Zm130-23 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z"
          fill="currentColor"
          opacity=".6"
        />
      </svg>
      <span>
        {record.damage >= goal
          ? "Golem defeated · collect your reward"
          : record.armed
            ? "Strike prepared · your next number lands here"
            : `${formatEP(Math.max(0, goal - record.damage))} damage remaining`}
      </span>
    </div>
  );
}

export function GolemSmash({ progress, status, onSmash, onClaim, pending }) {
  const week = status.week;
  if (!week) return null;
  const record = progress.rngmas.golems[week.id];
  const isGolem = week.metric === "damage";
  const count = winterChapterCount(progress.rngmas, week);
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
          {isGolem && <WinterGolem record={record} goal={week.goal} />}
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
              {isGolem
                ? "damage"
                : week.metric === "purchases"
                  ? "stalls"
                  : week.metric === "exchanged"
                    ? "Snowcoins exchanged"
                    : "rolls"}
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
            · {week.coins} Snowcoins + {week.charges}{" "}
            {passBoostById(week.boost).name} charges
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
            {week.metric === "purchases"
              ? "Buy from three different stalls below, then collect this chapter's aura before December 15 UTC. Each stall can be bought once."
              : week.metric === "exchanged"
                ? "Exchange 100 Snowcoins below, then claim this chapter's aura before December 22 UTC. Earned coins from rolls do not count toward the exchange goal."
                : "Progress comes from your main online roll only. Extra skill results and offline rolls do not count. Auto-Roll counts. Claim before this chapter ends; there is no catch-up."}{" "}
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

export function WinterEconomy({
  progress,
  status,
  onAction,
  pending,
  zone = "all",
}) {
  const [amount, setAmount] = useState("10");
  if (!status.active) return null;
  const record = progress.rngmas;
  const index = status.week?.index ?? 0;
  const exchanged = record.snowcoinsExchanged ?? 0;
  const count = Number(amount);
  return (
    <section
      className="advent-calendar"
      aria-label="Snowcoins and winter stalls"
    >
      {zone === "all" && (
        <div className="rngmas-section-heading">
          <div>
            <h3>
              Snowcoins · {(record.snowcoins ?? 0).toLocaleString("en-US")}
            </h3>
            <p>
              One Snowcoin per main online roll, including Auto-Roll. No coins
              from extra skill results or offline rolls. Spend before January 2
              UTC; coins have no EP cash-out.
            </p>
          </div>
        </div>
      )}
      <div className="winter-market-layout">
        {zone !== "exchange" && (
          <div className="winter-market">
            <h3>Christmas market</h3>
            <p>
              {index < 2
                ? "Opens December 8 UTC."
                : "Open until January 2 UTC. Each offer can be bought once. Charges stay in your inventory after the event."}
            </p>
            <div
              className="winter-stamps"
              aria-label={`${record.marketPurchases?.length ?? 0} of ${ACTIVE_WINTER_MARKET.length} stalls visited`}
            >
              {ACTIVE_WINTER_MARKET.map((item, index) => (
                <span
                  key={item.id}
                  data-earned={(record.marketPurchases ?? []).includes(item.id)}
                >
                  <Check size={15} aria-hidden="true" />
                  {index + 1}
                </span>
              ))}
              <p>
                Visit three stalls during Chapter 2 to collect Emberlight. Each
                offer is yours once.
              </p>
            </div>
            <div className="winter-stalls">
              {ACTIVE_WINTER_MARKET.map((item) => {
                const bought = (record.marketPurchases ?? []).includes(item.id);
                const boost =
                  item.aura || item.cosmetic ? null : passBoostById(item.boost);
                return (
                  <article
                    className="winter-stall"
                    key={item.id}
                    data-bought={bought}
                  >
                    <span className="winter-stall-tag">
                      {bought
                        ? "Collected"
                        : item.cosmetic
                          ? "Companion skin"
                          : item.aura
                            ? "Exclusive aura"
                            : item.charges
                              ? "Winter bundle"
                              : "Single charge"}
                    </span>
                    {item.cosmetic ? (
                      <PetIcon pet="axolotl" skin="polar" size={72} />
                    ) : item.aura ? (
                      <NumberBox
                        value="2026"
                        tier="rare"
                        aura={item.aura}
                        compact
                      />
                    ) : (
                      <Zap size={24} aria-hidden="true" />
                    )}
                    <h4>{item.name}</h4>
                    <p>
                      {item.aura || item.cosmetic
                        ? "Exclusive to this winter market. Kept forever, including after resets."
                        : boost.blurb}
                    </p>
                    <p>
                      {item.aura || item.cosmetic
                        ? "Permanent cosmetic · no effect on odds"
                        : `${item.charges ?? 1} charges · kept after the event`}
                    </p>
                    <button
                      className="secondary-button"
                      disabled={
                        pending ||
                        index < 2 ||
                        bought ||
                        (record.snowcoins ?? 0) < item.price
                      }
                      onClick={() =>
                        onAction(
                          { type: "winter-market-buy", id: item.id },
                          `${item.name} collected.`,
                        )
                      }
                    >
                      {item.name}
                      {item.aura || item.cosmetic
                        ? ""
                        : ` ×${item.charges ?? 1}`}{" "}
                      · {item.price} Snowcoins
                      {bought ? " · Bought" : ""}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
        {zone !== "market" && (
          <div className="winter-exchange-desk">
            <h3>EP → Snowcoins</h3>
            <p>
              {index < 3
                ? "Opens December 15 UTC."
                : "Open until January 2 UTC."}{" "}
              1 Snowcoin costs {formatEP(SNOWCOIN_EXCHANGE_EP)} EP. One-way
              conversion, no refunds. Maximum {SNOWCOIN_EXCHANGE_CAP} exchanged
              across the event.
            </p>
            <label>
              Snowcoins to exchange
              <input
                type="number"
                min="1"
                max={SNOWCOIN_EXCHANGE_CAP - exchanged}
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={
                  pending || index < 3 || exchanged >= SNOWCOIN_EXCHANGE_CAP
                }
              />
            </label>
            <p>
              {exchanged} / {SNOWCOIN_EXCHANGE_CAP} exchanged · cost{" "}
              {formatEP(
                Number.isSafeInteger(count) &&
                  count > 0 &&
                  count <= SNOWCOIN_EXCHANGE_CAP
                  ? count * SNOWCOIN_EXCHANGE_EP
                  : 0,
              )}{" "}
              EP
            </p>
            <button
              className="secondary-button"
              disabled={
                pending ||
                index < 3 ||
                !Number.isSafeInteger(count) ||
                count < 1 ||
                count + exchanged > SNOWCOIN_EXCHANGE_CAP ||
                progress.balance < count * SNOWCOIN_EXCHANGE_EP
              }
              onClick={() =>
                onAction(
                  { type: "winter-exchange", amount: count },
                  "EP exchanged for Snowcoins.",
                )
              }
            >
              Exchange EP for Snowcoins
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function WinterChapter({ week, progress, status, onAction, onSmash, pending }) {
  const current = status.week?.id === week.id;
  const past = status.now >= week.end;
  const unlocked = status.now >= week.start && status.active;
  const collected = progress.rngmas.golems[week.id].defeated;
  const count = winterChapterCount(progress.rngmas, week);
  const aura = RNGMAS_COSMETICS_BY_ID.get(week.reward);
  const [open, setOpen] = useState(current);
  useEffect(() => setOpen(current), [current]);
  const availableService =
    unlocked && (week.metric === "purchases" || week.metric === "exchanged");
  const label = collected
    ? "Collected"
    : current
      ? count >= week.goal
        ? "Reward ready"
        : "Live now"
      : past
        ? availableService
          ? "Stalls still open"
          : "Chapter ended"
        : "Coming next";
  return (
    <details
      className="winter-chapter"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-current={current}
      data-collected={collected}
      style={{ "--chapter-accent": week.accent }}
    >
      <summary>
        <span className="winter-chapter-number" aria-hidden="true">
          {collected ? (
            <Check size={20} />
          ) : (
            String(week.index).padStart(2, "0")
          )}
        </span>
        <span className="winter-chapter-heading">
          <small>
            CHAPTER {week.index} · {rngmasDateLabel(week.start)} –{" "}
            {rngmasDateLabel(week.end)} UTC
          </small>
          <strong>{week.name}</strong>
          <span>{label}</span>
        </span>
        <span className="winter-chapter-prize">
          {aura.name}
          <small>+ {week.coins} Snowcoins</small>
        </span>
        <ChevronDown
          className="winter-chapter-chevron"
          size={20}
          aria-hidden="true"
        />
      </summary>
      <div className="winter-chapter-content">
        {current ? (
          <GolemSmash
            progress={progress}
            status={status}
            onSmash={onSmash}
            pending={pending}
            onClaim={() =>
              onAction(
                { type: "claim-winter-week" },
                `${aura.name}, ${week.coins} Snowcoins and boost charges collected.`,
              )
            }
          />
        ) : (
          <div className="winter-chapter-preview">
            <NumberBox value="2026" tier="rare" aura={aura.id} compact />
            <div>
              <h3>{week.name}</h3>
              <p>{week.blurb}</p>
              <p>
                <strong>{aura.name}</strong> · {week.coins} Snowcoins ·{" "}
                {week.charges} {passBoostById(week.boost).name} charges
                {week.ep ? ` · ${formatEP(week.ep)} EP` : ""}
              </p>
              <p>
                {collected
                  ? "Your aura is kept forever. This chapter cannot be claimed twice."
                  : past
                    ? "This chapter's aura claim has ended. Existing rewards and progress are kept."
                    : `Opens ${rngmasDateLabel(week.start)} UTC. Explore the rewards now; play when the chapter opens.`}
              </p>
            </div>
          </div>
        )}
        {availableService && (
          <WinterEconomy
            zone={week.metric === "purchases" ? "market" : "exchange"}
            progress={progress}
            status={status}
            onAction={onAction}
            pending={pending}
          />
        )}
      </div>
    </details>
  );
}

export function WinterChapters({
  progress,
  status,
  onAction,
  onSmash,
  pending,
}) {
  return (
    <section
      id="winter-chapters"
      className="winter-trail"
      aria-labelledby="winter-trail-title"
    >
      <div className="rngmas-section-heading">
        <div>
          <p className="eyebrow">THE WINTER TRAIL</p>
          <h3 id="winter-trail-title">A new stop each week.</h3>
          <p>
            Open a zone to see its activity and rewards. Weekly aura claims
            expire; unlocked stalls stay open until January 2 UTC.
          </p>
        </div>
      </div>
      <div className="winter-passport" aria-label="Chapter collection">
        <Gift size={20} aria-hidden="true" />
        <div>
          <strong>
            {
              RNGMAS_WEEKS.filter(
                (week) => progress.rngmas.golems[week.id].defeated,
              ).length
            }{" "}
            / 5 chapter auras collected
          </strong>
          <p>
            Earn Snowcoins from main online rolls and chapter rewards. Spend
            them at the market; no real money.
          </p>
        </div>
      </div>
      {RNGMAS_WEEKS.map((week) => (
        <WinterChapter
          key={week.id}
          week={week}
          progress={progress}
          status={status}
          onAction={onAction}
          onSmash={onSmash}
          pending={pending}
        />
      ))}
    </section>
  );
}

export default function RngmasShelf({ progress, onAction, notify }) {
  const status = useRngmasStatus();
  const [pending, setPending] = useState(false);
  const [zone, setZone] = useState("calendar");
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

      <nav className="winter-wayfinding" aria-label="RNGmas zones">
        {[
          ["calendar", "Advent square", CalendarDays],
          ["festival", "Festival board", Radio],
          ["chapters", "Winter trail", ShoppingBag],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className="secondary-button"
            aria-pressed={zone === id}
            aria-controls={`rngmas-zone-${id}`}
            onClick={() => setZone(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <span>
          <Coins size={16} /> {formatEP(progress.rngmas.snowcoins ?? 0)}{" "}
          Snowcoins
        </span>
      </nav>
      <div id="rngmas-zone-calendar" hidden={zone !== "calendar"}>
        <div id="winter-calendar" className="winter-calendar-zone">
          <AdventCalendar
            record={progress.rngmas}
            status={status}
            onClaim={claim}
            pending={pending}
          />
        </div>
      </div>
      <div id="rngmas-zone-festival" hidden={zone !== "festival"}>
        <WinterFestival
          progress={progress}
          status={status}
          onAction={run}
          pending={pending}
        />
      </div>
      <div id="rngmas-zone-chapters" hidden={zone !== "chapters"}>
        <WinterChapters
          progress={progress}
          status={status}
          onAction={run}
          onSmash={smash}
          pending={pending}
        />
      </div>
      <p className="rngmas-shelf-fine">
        The calendar and weekly activities award EP and permanent auras. Nothing
        here changes roll odds, scoring tables, badge values or cooldowns.
      </p>
    </section>
  );
}
