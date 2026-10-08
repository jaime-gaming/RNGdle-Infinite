import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Check, Dices, LayoutGrid } from "lucide-react";
import NumberBox from "./NumberBox";
import PaidNumbers from "./PaidNumbers";
import RankSummary from "./RankSummary";
import Emoji from "./Emoji";
import { formatEP, groupResultBadges } from "../roll-data";
import { restoreRoll } from "../roll-client";
import { skillById } from "../skills.js";
import { SCRAMBLE_MS } from "../roll-timeline";
import "../draw-stage.css";

// A draw-modifying skill (Double Vision, Bedrock, Omen, Wish…) takes several
// ordinary, independent rolls and keeps the one that scores the most EP. The
// saving already commits exactly one of them — this is the part the player
// used to have to take on trust.
//
// The screen is split into one panel per draw: every draw rolls its digits and
// earns its badges in the open, on the same clock. When the last badge has
// landed the best draw is marked, and every number stays on screen. Nothing
// flies to the centre, nothing greys out, and nothing leaves by itself. Tapping
// a number minimizes the screen to a card with that number's stats, and "All
// numbers" opens the screen again. Nothing here scores anything: the numbers
// were drawn and scored before the roll was committed, and the worker re-reads
// them from the same verified index.
const NO_DRAWS = [];
const randomDigits = (count) =>
  Array.from({ length: count }, () => String(Math.floor(Math.random() * 10)));

// How many badge chips a panel lists before the rest becomes a count: eight
// panels can be on screen at once, and no panel may swallow the number.
const MAX_CHIPS = 6;

function useScramble(spinning, slots, reducedMotion) {
  const [scramble, setScramble] = useState(() => randomDigits(slots));
  useEffect(() => {
    if (!spinning || reducedMotion) return;
    const timer = setInterval(
      () => setScramble(randomDigits(slots)),
      SCRAMBLE_MS,
    );
    return () => clearInterval(timer);
  }, [spinning, slots, reducedMotion]);
  return scramble;
}

// Every panel fills its badges on the beats the winner's own breakdown uses,
// spread evenly across that window: a draw that earned three badges and one
// that earned fifteen both finish together, so the screen reads as one clock.
function laneBeats(beats, count) {
  if (!count || !beats.length) return [];
  if (count === beats.length) return beats;
  if (count === 1) return [beats[0]];
  return Array.from(
    { length: count },
    (_, index) => beats[Math.round((index * (beats.length - 1)) / (count - 1))],
  );
}

// One number, landing digit by digit exactly as the headline number does: the
// slots that have settled hold their digit, the rest keep scrambling.
function Digits({ number, slots, done, scramble, reducedMotion }) {
  const target = String(number);
  const pad = slots - target.length;
  return (
    <span className="draw-digits" aria-hidden="true">
      {Array.from({ length: slots }, (_, slot) => {
        const index = slot - pad;
        const blank = index < 0;
        const landed = !blank && index < done;
        return (
          <span
            key={slot}
            data-slot={slot}
            className={`draw-digit ${blank ? "is-blank" : ""} ${
              landed || blank ? "" : "is-scrambling"
            }`}
          >
            {blank
              ? "\u00a0"
              : landed
                ? target[index]
                : reducedMotion
                  ? "?"
                  : scramble[slot % scramble.length]}
          </span>
        );
      })}
    </span>
  );
}

function BadgeChips({ groups, shown, limit = MAX_CHIPS }) {
  const revealed = groups.slice(-shown || groups.length);
  const chips = revealed.slice(0, limit);
  const hidden = revealed.length - chips.length;
  if (!revealed.length) return null;
  return (
    <>
      {chips.map((group) => (
        <li
          key={group.lead.id}
          className={`draw-badge ${group.lead.rarity}`}
          title={`${group.lead.name} — +${formatEP(group.lead.ep)} EP`}
        >
          <Emoji text={group.lead.emoji} />
          <span className="draw-badge-name">{group.lead.name}</span>
          <span className="draw-badge-ep">+{formatEP(group.lead.ep)}</span>
        </li>
      ))}
      {hidden > 0 && <li className="draw-badge-more">+{hidden} more</li>}
    </>
  );
}

// What a draw was in the decision: the best one, one a draw skill kept and
// paid, or one that was thrown away.
function decisionTag(best, claim) {
  if (best) return { label: "Best", className: "is-best", icon: true };
  if (claim) return { label: "Paid", className: "is-paid", icon: false };
  return { label: "Discarded", className: "", icon: false };
}

function DecisionTag({ best, claim }) {
  const tag = decisionTag(best, claim);
  return (
    <span className={`draw-panel-tag ${tag.className}`}>
      {tag.icon && <Check size={10} aria-hidden="true" />}
      {tag.label}
    </span>
  );
}

// One number's stats, shown once the screen is minimized. It sits in the page
// flow, above the roll's own number, so the result under it stays readable.
function DrawCard({
  number,
  index,
  count,
  best,
  claim,
  scored,
  groups,
  aura,
  timeline,
  reducedMotion,
  scramble,
  paid,
  onExpand,
}) {
  return (
    <section
      className="draw-card"
      aria-label={`Draw ${index + 1} of ${count}: ${number}`}
    >
      <div className="draw-card-head">
        <span className="draw-card-kicker">
          <Dices size={12} aria-hidden="true" />
          Draw {index + 1} of {count}
          <DecisionTag best={best} claim={claim} />
        </span>
        <button
          type="button"
          className="secondary-button draw-card-expand"
          onClick={onExpand}
        >
          <LayoutGrid size={13} aria-hidden="true" />
          All numbers
        </button>
      </div>
      <div className="draw-card-main">
        <NumberBox
          compact
          aura={aura}
          tier={scored?.tier ?? "neutral"}
          className="draw-card-box"
        >
          <Digits
            number={number}
            slots={timeline.slots}
            done={timeline.slots}
            scramble={scramble}
            reducedMotion={reducedMotion}
          />
        </NumberBox>
        <div className="draw-card-stats">
          {scored ? (
            <>
              {/* The card is opened on purpose, after the decision, so the rank
                  it states is shown at once rather than on the reveal's beat. */}
              <RankSummary
                result={scored}
                visible
                rankKnown
                instant={reducedMotion}
                scale={timeline.scale}
              />
              <span className="draw-card-ep">
                {formatEP(scored.totalEP)} EP
              </span>
              <span className="draw-card-meta">
                {groups.length} {groups.length === 1 ? "badge" : "badges"}
                {claim ? ` · paid with ${claim.name || "a draw skill"}` : ""}
              </span>
            </>
          ) : (
            <span className="draw-card-meta">Reading this number…</span>
          )}
        </div>
      </div>
      {scored && groups.length > 0 && (
        <ul className="draw-card-badges">
          <BadgeChips groups={groups} shown={groups.length} limit={24} />
        </ul>
      )}
      {paid && <PaidNumbers items={paid} />}
    </section>
  );
}

export default function DrawStage({
  run,
  elapsed,
  timeline,
  reducedMotion,
  aura,
  decided = false,
  open = true,
  picked = null,
  onPick,
  onExpand,
}) {
  const numbers = run.draws ?? NO_DRAWS;
  const winner = run.number;
  // Which draw skill kept which number. Stacking them does not only spend more
  // draws: each skill keeps its own number and the roll pays for every one, so
  // a panel that a skill kept is never a discarded draw.
  const picks = useMemo(
    () =>
      (run.picks ?? []).map((pick) => {
        const definition = pick.skill ? skillById.get(pick.skill) : null;
        return {
          number: pick.number,
          name: definition?.name ?? "",
          tint: definition?.tint ?? "green",
        };
      }),
    [run.picks],
  );
  const claimFor = (number) =>
    picks.find((pick) => pick.number === number) ?? null;
  // More than one number is paid: the cards name each number and its own EP,
  // and the single headline EP of the best one is left out, so no total reads
  // as the roll's worth while the numbers are still being revealed.
  const stacked = picks.length > 1;
  const winnerIndex = Math.max(0, numbers.indexOf(winner));
  const done = timeline.digitTimes.filter((time) => elapsed >= time).length;
  const spinning = done < timeline.slots;
  const rarityKnown = elapsed >= timeline.rarity;
  const scramble = useScramble(spinning, timeline.slots, reducedMotion);
  const [scores, setScores] = useState({});
  const [stageTop, setStageTop] = useState(0);

  // The split screen is a takeover: it starts under the header and stops above
  // the phone tab bar, whatever those happen to measure on this device.
  useLayoutEffect(() => {
    const header = document.querySelector(".header");
    setStageTop(
      header
        ? Math.max(0, Math.round(header.getBoundingClientRect().bottom))
        : 0,
    );
  }, []);

  // Each discarded draw is scored from the same verified index so its panel can
  // state what it was worth and list the badges it earned. The kept one is
  // already scored in `run.result`. One pass per committed roll: the draws of a
  // run never change.
  useEffect(() => {
    let cancelled = false;
    for (const number of numbers) {
      if (number === winner) continue;
      restoreRoll(number)
        .then((scored) => {
          if (cancelled || !scored) return;
          setScores((current) =>
            current[number] ? current : { ...current, [number]: scored },
          );
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [run.id]);

  const draws = useMemo(
    () =>
      numbers.map((number) => {
        const scored =
          number === winner ? run.result : (scores[number] ?? null);
        const groups = scored ? groupResultBadges(scored.badges) : [];
        return {
          number,
          scored,
          groups,
          beats: laneBeats(timeline.badgeTimes, groups.length),
        };
      }),
    [numbers, winner, run.result, scores, timeline],
  );

  if (numbers.length < 2) return null;
  const champ = draws[winnerIndex] ?? draws[0];
  const scoredFor = (number) =>
    number === winner ? (run.result ?? null) : (scores[number] ?? null);
  const paidItems = picks.map((pick) => {
    const scored = scoredFor(pick.number);
    return {
      key: `${pick.number}-${pick.name}`,
      skill: pick.name || "Kept",
      tint: pick.tint,
      number: pick.number,
      ep: scored ? `${formatEP(scored.totalEP)} EP` : "—",
      best: pick.number === winner,
    };
  });

  // Minimized: one number's stats, in the page flow. The number is the one the
  // player tapped, or the best one when they chose "Minimize" on the screen.
  if (decided && !open) {
    const shown = picked ?? winner;
    const index = Math.max(0, numbers.indexOf(shown));
    const draw = draws[index];
    const claim = claimFor(shown);
    return (
      <DrawCard
        number={shown}
        index={index}
        count={numbers.length}
        best={shown === winner}
        claim={shown === winner ? null : claim}
        scored={draw.scored}
        groups={draw.groups}
        aura={aura}
        timeline={timeline}
        reducedMotion={reducedMotion}
        scramble={scramble}
        paid={stacked ? paidItems : null}
        onExpand={onExpand}
      />
    );
  }

  return (
    <div
      className={`draw-stage ${decided ? "is-decided" : ""}`}
      style={{ top: `${stageTop}px` }}
      data-count={numbers.length}
      aria-hidden={decided ? undefined : "true"}
    >
      <p className="draw-stage-label">
        <Dices size={12} aria-hidden="true" />
        {decided
          ? picks.length > 1
            ? `${picks.length} numbers paid`
            : `Best of ${numbers.length} kept`
          : spinning
            ? `${numbers.length} independent draws`
            : `${numbers.length} draws, best kept`}
        {decided && (
          <button
            type="button"
            className="draw-stage-minimize"
            onClick={() => onPick?.(winner)}
          >
            Minimize
          </button>
        )}
      </p>
      <ol className="draw-grid">
        {draws.map((draw, index) => {
          const isWinner = index === winnerIndex;
          const claim = claimFor(draw.number);
          const shown = draw.beats.filter((time) => elapsed >= time).length;
          const epKnown = !spinning && !!draw.scored;
          const body = (
            <>
              <span className="draw-panel-head">
                <span className="draw-panel-label">Draw {index + 1}</span>
                {claim && (
                  <span className={`draw-panel-claim tint-${claim.tint}`}>
                    {claim.name || "Kept"}
                  </span>
                )}
                {decided && (
                  <DecisionTag best={isWinner} claim={!isWinner && claim} />
                )}
              </span>
              <NumberBox
                compact
                aura={aura}
                tier={
                  rarityKnown ? (draw.scored?.tier ?? "neutral") : "neutral"
                }
                className={`draw-box ${spinning ? "is-spinning" : ""}`}
              >
                <Digits
                  number={draw.number}
                  slots={timeline.slots}
                  done={done}
                  scramble={scramble}
                  reducedMotion={reducedMotion}
                />
              </NumberBox>
              <span className={`draw-ep ${epKnown ? "is-known" : ""}`}>
                {epKnown ? `${formatEP(draw.scored.totalEP)} EP` : "—"}
              </span>
              <ul className="draw-badges">
                <BadgeChips groups={draw.groups} shown={shown} />
              </ul>
              {decided && (
                <span className="draw-panel-more">Tap for stats</span>
              )}
            </>
          );
          return (
            <li
              key={`${run.id}-${index}`}
              className={`draw-panel ${decided ? (isWinner ? "is-winner" : "is-out") : ""}`}
            >
              {decided ? (
                <button
                  type="button"
                  className="draw-pick"
                  aria-label={`Draw ${index + 1}, ${draw.number}. Show its stats`}
                  onClick={() => onPick?.(draw.number)}
                >
                  {body}
                </button>
              ) : (
                <div className="draw-pick">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
