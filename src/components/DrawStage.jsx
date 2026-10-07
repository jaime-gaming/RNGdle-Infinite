import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Dices, MousePointerClick, Trophy } from "lucide-react";
import NumberBox from "./NumberBox";
import Emoji from "./Emoji";
import { formatEP, groupResultBadges } from "../roll-data";
import { restoreRoll } from "../roll-client";
import { SCRAMBLE_MS } from "../roll-timeline";
import "../draw-stage.css";

// A draw-modifying skill (Double Vision, Bedrock, Omen, Wish…) takes several
// ordinary, independent rolls and keeps the one that scores the most EP. The
// saving already commits exactly one of them — this is the part the player
// used to have to take on trust.
//
// The screen is split into one panel per draw: every draw rolls its digits and
// earns its badges in the open, on the same clock. When the last badge has
// landed the best draw flies to the centre of the screen and covers the rest
// with a grey filter; hovering it lifts the filter so the discarded draws can
// still be read. Nothing here scores anything — the numbers were drawn and
// scored before the roll was committed, and the worker re-reads them from the
// same verified index.
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

export default function DrawStage({
  run,
  elapsed,
  timeline,
  reducedMotion,
  aura,
  decided = false,
  leaving = false,
}) {
  const numbers = run.draws ?? NO_DRAWS;
  const winner = run.number;
  const winnerIndex = Math.max(0, numbers.indexOf(winner));
  const done = timeline.digitTimes.filter((time) => elapsed >= time).length;
  const spinning = done < timeline.slots;
  const rarityKnown = elapsed >= timeline.rarity;
  const scramble = useScramble(spinning, timeline.slots, reducedMotion);
  const [scores, setScores] = useState({});
  const [peeking, setPeeking] = useState(false);
  const [stageTop, setStageTop] = useState(0);
  const panels = useRef([]);
  const card = useRef(null);

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

  // The promotion: the winning panel's own card is measured where it sits and
  // animated from there to the centre, so the number the player watched land is
  // the same one that ends up covering the rest.
  useEffect(() => {
    if (!decided) return;
    setPeeking(false);
    const node = card.current,
      source = panels.current[winnerIndex];
    if (!node || !source || reducedMotion) return;
    const from = source.getBoundingClientRect(),
      to = node.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const flight = node.animate(
      [
        {
          transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${
            from.top + from.height / 2 - (to.top + to.height / 2)
          }px) scale(${Math.min(1, from.width / to.width)})`,
          opacity: 0.2,
        },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      ],
      {
        duration: 560 * (timeline.scale ?? 1),
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      },
    );
    return () => flight.cancel();
  }, [decided, winnerIndex, reducedMotion, timeline.scale]);

  if (numbers.length < 2) return null;
  const champ = draws[winnerIndex] ?? draws[0];

  return (
    <div
      className={`draw-stage ${decided ? "is-decided" : ""} ${
        peeking ? "is-peeking" : ""
      } ${leaving ? "is-leaving" : ""}`}
      style={{ top: `${stageTop}px` }}
      data-count={numbers.length}
      aria-hidden="true"
    >
      <p className="draw-stage-label">
        <Dices size={12} aria-hidden="true" />
        {decided
          ? `Best of ${numbers.length} kept`
          : spinning
            ? `${numbers.length} independent draws`
            : `${numbers.length} draws, best kept`}
      </p>
      <ol className="draw-grid">
        {draws.map((draw, index) => {
          const isWinner = index === winnerIndex;
          const shown = draw.beats.filter((time) => elapsed >= time).length;
          const epKnown = !spinning && !!draw.scored;
          return (
            <li
              key={`${run.id}-${index}`}
              ref={(node) => {
                panels.current[index] = node;
              }}
              className={`draw-panel ${decided ? (isWinner ? "is-winner" : "is-out") : ""}`}
            >
              <span className="draw-panel-head">
                <span className="draw-panel-label">Draw {index + 1}</span>
                {decided && (
                  <span
                    className={`draw-panel-tag ${isWinner ? "is-best" : ""}`}
                  >
                    {isWinner ? (
                      <>
                        <Check size={10} aria-hidden="true" /> Best
                      </>
                    ) : (
                      "Discarded"
                    )}
                  </span>
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
            </li>
          );
        })}
      </ol>
      {decided && (
        <div className="draw-finale">
          <article
            ref={card}
            className={`draw-winner ${peeking ? "is-peeking" : ""}`}
            // Movement, not mere presence: the button the player just clicked
            // sits under the middle of the screen, and the grey filter has to
            // survive a cursor that was already there. A tap counts as well,
            // because a touch screen has no hover to give.
            onPointerMove={() => setPeeking(true)}
            onPointerDown={() => setPeeking(true)}
            onPointerLeave={() => setPeeking(false)}
          >
            <span className="draw-winner-kicker">
              <Trophy size={13} aria-hidden="true" /> Best of {numbers.length} ·
              Draw {winnerIndex + 1}
            </span>
            <NumberBox
              aura={aura}
              tier={rarityKnown ? (champ.scored?.tier ?? "neutral") : "neutral"}
              className="draw-winner-box"
            >
              <Digits
                number={winner}
                slots={timeline.slots}
                done={timeline.slots}
                scramble={scramble}
                reducedMotion={reducedMotion}
              />
            </NumberBox>
            <span className="draw-winner-ep">
              {champ.scored ? `${formatEP(champ.scored.totalEP)} EP` : "—"}
            </span>
            <ul className="draw-winner-badges">
              <BadgeChips
                groups={champ.groups}
                shown={champ.groups.length}
                limit={12}
              />
            </ul>
            <span className="draw-winner-hint">
              <MousePointerClick size={12} aria-hidden="true" /> Hover to
              compare the {numbers.length - 1} discarded{" "}
              {numbers.length === 2 ? "draw" : "draws"}
            </span>
          </article>
        </div>
      )}
    </div>
  );
}
