import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Dices, LayoutGrid } from "lucide-react";
import NumberBox from "./NumberBox";
import PaidNumbers from "./PaidNumbers";
import RankSummary from "./RankSummary";
import BadgeBreakdown from "./BadgeBreakdown";
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
// The overview is a takeover of the roll screen: one panel per draw, every draw
// rolling its digits and earning its badges in the open. When the last badge
// has landed the best draw is marked green, and every number stays on screen.
// Nothing behind the overview is visible or scrolls. Tapping a number opens its
// own stats in the page flow: the best one is the roll's own result, any other
// one is shown at the same size, with the roll's button in the middle.
// Nothing here scores anything: the numbers were drawn and scored before the
// roll was committed, and the worker re-reads them from the same verified index.
const NO_DRAWS = [];
const NO_SCORES = {};
const randomDigits = (count) =>
  Array.from({ length: count }, () => String(Math.floor(Math.random() * 10)));

// How many badge chips a panel lists before the rest becomes a count. The more
// panels are on screen, the fewer chips each one can take, so none is cut off.
function chipLimitFor(count) {
  if (count <= 2) return 6;
  if (count <= 4) return 4;
  if (count <= 6) return 3;
  return 2;
}

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

// The scored result of every draw a roll took, by number, read from the same
// verified index the settlement uses. The committed draw is already in
// `run.result`, so only the others are read. A run's draws never change, so each
// one is read once per run, and the result is only ever for the run it was read
// for.
export function useDrawScores(run) {
  const runId = run?.id ?? null;
  const [held, setHeld] = useState({ run: null, scores: NO_SCORES });
  useEffect(() => {
    if (!run || (run.draws ?? []).length < 2) return;
    let cancelled = false;
    for (const number of run.draws) {
      if (number === run.number) continue;
      restoreRoll(number)
        .then((scored) => {
          if (cancelled || !scored) return;
          setHeld((current) => {
            const base = current.run === runId ? current.scores : NO_SCORES;
            return base[number]
              ? current
              : { run: runId, scores: { ...base, [number]: scored } };
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [runId]);
  return held.run === runId ? held.scores : NO_SCORES;
}

// The skill that kept this particular draw, if one did: its name and tint.
// Numbers can repeat across independent draws, so the source is found within
// each skill's own consecutive draw budget instead of by number alone.
export function claimFor(run, drawIndex) {
  const draws = run?.draws ?? [];
  let start = 0;
  for (const pick of run?.picks ?? []) {
    const spent = Math.max(1, Math.trunc(pick.spent ?? 1));
    const end = Math.min(start + spent, draws.length);
    const chosen = draws.indexOf(pick.number, start);
    if (chosen >= start && chosen < end && chosen === drawIndex) {
      const definition = pick.skill ? skillById.get(pick.skill) : null;
      return {
        name: definition?.name ?? "",
        tint: definition?.tint ?? "green",
      };
    }
    start = end;
  }
  return null;
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

function BadgeChips({ groups, shown, limit }) {
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

// The roll's own number box, drawn still: the same box and the same digits the
// reveal ends on, with nothing left to scramble.
function StaticArtifact({ number, tier, aura }) {
  const target = String(number);
  const size =
    target.length <= 3
      ? 72
      : target.length === 4
        ? 60
        : target.length === 5
          ? 48
          : 36;
  return (
    <div className={`artifact-stage aura-${aura}`} data-aura={aura}>
      <NumberBox
        tier={tier}
        aura={aura}
        role="img"
        className={`number-artifact ${tier} is-breathing`}
        aria-label={`Number ${target}`}
      >
        <span
          className="artifact-digits"
          style={{ fontSize: `${size}px` }}
          aria-hidden="true"
        >
          {Array.from(target).map((digit, index) => (
            <span key={index} className="artifact-digit">
              {digit}
            </span>
          ))}
        </span>
      </NumberBox>
    </div>
  );
}

// One number that is not the committed one, shown the way the roll shows its
// own: the number, its rank and EP, the roll's button in the middle, and every
// badge it earned. It is in the page flow, so the page scrolls as it does for
// any result.
export function DrawDetail({
  number,
  index,
  count,
  scored,
  claim,
  aura,
  reducedMotion,
  scale,
  bankedMultiplier,
  stacked,
  paidItems,
  rollAgain,
  summary = null,
  openBadge,
  theme,
  onBack,
}) {
  const groups = useMemo(() => groupResultBadges(scored.badges), [scored]);
  const banked = Math.round(scored.totalEP * bankedMultiplier);
  return (
    <section
      className="draw-detail"
      aria-label={`Draw ${index + 1} of ${count}: ${number}`}
    >
      <div className="draw-detail-bar">
        <button
          type="button"
          className="secondary-button draw-detail-back"
          onClick={onBack}
        >
          <LayoutGrid size={13} aria-hidden="true" />
          All numbers
        </button>
        <span className="draw-detail-kicker">
          <Dices size={12} aria-hidden="true" />
          Draw {index + 1} of {count}
          <DecisionTag best={false} claim={claim} />
        </span>
      </div>
      <StaticArtifact number={number} tier={scored.tier} aura={aura} />
      <RankSummary
        result={scored}
        visible
        rankKnown
        instant={reducedMotion}
        scale={scale}
      />
      <div className={`roll-ep ${scored.tier}`} data-testid="draw-detail-ep">
        {formatEP(scored.totalEP)} EP
      </div>
      {claim && (
        <p className="draw-detail-paid">
          Paid with <b>{claim.name || "a draw skill"}</b> · banks{" "}
          {formatEP(banked)} EP
        </p>
      )}
      {rollAgain}
      {stacked && <PaidNumbers items={paidItems} />}
      {summary}
      <div className="breakdown-wrap">
        <BadgeBreakdown
          result={scored}
          groups={groups}
          visibleCount={groups.length}
          summaryVisible
          staged={false}
          openBadge={openBadge}
          reducedMotion={reducedMotion}
          theme={theme}
        />
      </div>
    </section>
  );
}

// The roll button in the middle of the overview, where the panels meet. Its
// radius is the button's plus a margin. It is only shown where it covers no
// digit, label, chip, hint or icon; anywhere else it stays in the strip below.
const HUB_RADIUS = 36;

// A text leaf is measured by its words, not by its box: a hint can span a whole
// panel while its words sit in the middle of it.
function inkBox(el) {
  const hasText = [...el.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );
  if (!hasText) return el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function hubIsClear(grid, x, y) {
  return ![...grid.querySelectorAll(".draw-panel *")].some((el) => {
    if (el.children.length > 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const box = inkBox(el);
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.left < x + HUB_RADIUS &&
      box.right > x - HUB_RADIUS &&
      box.top < y + HUB_RADIUS &&
      box.bottom > y - HUB_RADIUS
    );
  });
}

// The overview: every draw on one screen, with nothing behind it.
export default function DrawStage({
  run,
  elapsed,
  timeline,
  reducedMotion,
  aura,
  decided = false,
  scores = NO_SCORES,
  roll = null,
  onPick,
}) {
  const numbers = run.draws ?? NO_DRAWS;
  const winner = run.number;
  const winnerIndex =
    Number.isSafeInteger(run.winnerIndex) &&
    run.winnerIndex >= 0 &&
    run.winnerIndex < numbers.length
      ? run.winnerIndex
      : Math.max(0, numbers.indexOf(winner));
  const done = timeline.digitTimes.filter((time) => elapsed >= time).length;
  const spinning = done < timeline.slots;
  const rarityKnown = elapsed >= timeline.rarity;
  const scramble = useScramble(spinning, timeline.slots, reducedMotion);
  const [frame, setFrame] = useState({ top: 0, bottom: 0 });
  const stageRef = useRef(null);
  const gridRef = useRef(null);
  // Where the roll button sits in the middle, relative to the overview, or null
  // when it stays in the strip under the panels.
  const [hub, setHub] = useState(null);
  const hasRoll = roll !== null;

  // Decided once the reveal is over, and again when the window changes: the
  // panels are then final. The strip is hidden while this measures, so the grid
  // is measured at the height it has when the button is in the middle.
  useLayoutEffect(() => {
    if (!hasRoll) return undefined;
    const probe = () => {
      const stage = stageRef.current;
      const grid = gridRef.current;
      if (!stage || !grid) return;
      // The tap hint sits in the outer bottom corner of its panel: panels on the
      // left half of the grid keep it on the left, the others on the right. That
      // leaves the middle of the grid to the roll button.
      const cols = Math.max(
        1,
        Number.parseInt(
          getComputedStyle(grid).getPropertyValue("--cols"),
          10,
        ) || 1,
      );
      grid.querySelectorAll(".draw-panel").forEach((panel, index) => {
        const side = index % cols < cols / 2 ? "left" : "right";
        panel
          .querySelector(".draw-panel-more")
          ?.setAttribute("data-side", side);
      });
      stage.classList.add("is-probing");
      const box = grid.getBoundingClientRect();
      const origin = stage.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const clear = hubIsClear(grid, x, y);
      stage.classList.remove("is-probing");
      setHub(clear ? { x: x - origin.left, y: y - origin.top } : null);
    };
    probe();
    window.addEventListener("resize", probe);
    return () => window.removeEventListener("resize", probe);
  }, [decided, numbers.length, hasRoll, frame.top, frame.bottom]);

  // The overview is a takeover, not a panel: it starts under the header and
  // stops above the phone tab bar. Both are measured, and measured again when
  // the window changes size, so the panels never sit under either one.
  useLayoutEffect(() => {
    const measure = () => {
      const header = document.querySelector(".header");
      const bar = document.querySelector(".mobile-tabbar");
      setFrame({
        top: header
          ? Math.max(0, Math.round(header.getBoundingClientRect().bottom))
          : 0,
        bottom: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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
  // More than one number is paid: each paid number is a card of its own on its
  // stats screen, and no total EP is counted up on the overview.
  const paid = (run.picks ?? []).length + (run.winnerSkill == null ? 1 : 0);
  const chipLimit = chipLimitFor(numbers.length);

  return (
    <div
      className={`draw-stage ${decided ? "is-decided" : ""}`}
      ref={stageRef}
      style={{ top: `${frame.top}px`, bottom: `${frame.bottom}px` }}
      data-count={numbers.length}
      aria-hidden={decided ? undefined : "true"}
    >
      <p className="draw-stage-label">
        <Dices size={12} aria-hidden="true" />
        {decided
          ? paid > 1
            ? `${paid} numbers paid`
            : `Best of ${numbers.length} kept`
          : spinning
            ? `${numbers.length} independent draws`
            : `${numbers.length} draws, best kept`}
        {decided && (
          <button
            type="button"
            className="draw-stage-minimize"
            onClick={() => onPick?.(winnerIndex)}
          >
            Minimize
          </button>
        )}
      </p>
      <ol className="draw-grid" ref={gridRef}>
        {draws.map((draw, index) => {
          const isWinner = index === winnerIndex;
          const claim = claimFor(run, index);
          const shown = draw.beats.filter((time) => elapsed >= time).length;
          const epKnown = !spinning && !!draw.scored;
          const pickable = decided && !!draw.scored;
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
                <BadgeChips
                  groups={draw.groups}
                  shown={shown}
                  limit={chipLimit}
                />
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
              {pickable ? (
                <button
                  type="button"
                  className="draw-pick"
                  aria-label={`Draw ${index + 1}, ${draw.number}. Show its stats`}
                  onClick={() => onPick?.(index)}
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
      {roll &&
        (hub ? (
          <div
            className="draw-hub"
            style={{ left: `${hub.x}px`, top: `${hub.y}px` }}
          >
            {roll}
          </div>
        ) : (
          <div className="draw-stage-roll">{roll}</div>
        ))}
    </div>
  );
}
