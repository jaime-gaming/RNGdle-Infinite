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

const NO_DRAWS = [];
const NO_SCORES = {};
const randomDigits = (count) =>
  Array.from({ length: count }, () => String(Math.floor(Math.random() * 10)));

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

function laneBeats(beats, count) {
  if (!count || !beats.length) return [];
  if (count === beats.length) return beats;
  if (count === 1) return [beats[0]];
  return Array.from(
    { length: count },
    (_, index) => beats[Math.round((index * (beats.length - 1)) / (count - 1))],
  );
}

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

const HUB_RADIUS = 36;

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
    if (el.closest(".box-cosmetic, .box-gloss, .box-shimmer, .godly-particles"))
      return false;
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

  const [hub, setHub] = useState(null);
  const hasRoll = roll !== null;

  useLayoutEffect(() => {
    if (!hasRoll) return undefined;
    const probe = () => {
      const stage = stageRef.current;
      const grid = gridRef.current;
      if (!stage || !grid) return;

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

    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) probe();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", probe);
    };
  }, [decided, numbers.length, hasRoll, frame.top, frame.bottom]);

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

  const paid = (run.picks ?? []).length + (run.winnerSkill == null ? 1 : 0);

  const chipLimit =
    frame.bottom > 0 && numbers.length >= 5 ? 1 : chipLimitFor(numbers.length);

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
                  <span
                    className={`draw-panel-claim tint-${claim.tint}`}
                    title={claim.name}
                  >
                    {claim.name || "Kept"}
                  </span>
                )}
                {decided && (
                  <DecisionTag best={isWinner} claim={!isWinner && claim} />
                )}
              </span>
              <NumberBox
                compact
                auraLayout="contained"
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
