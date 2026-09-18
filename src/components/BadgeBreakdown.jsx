import React, { memo, useEffect, useRef, useMemo } from "react";
import Emoji from "./Emoji";
import { formatEP } from "../roll-data";
import { buildChipPlan, chipLoopFrames, GROUP_PALETTES } from "../chip-motion";

const groupColors = GROUP_PALETTES.map((p) => p.border);

function DigitDiagram({ badge, number, reducedMotion, introIndex }) {
  const ref = useRef(null);
  const plan = useMemo(() => buildChipPlan(badge, number), [badge, number]);
  useEffect(() => {
    if (reducedMotion) return;
    const animations = [];
    const root = getComputedStyle(document.documentElement);
    const resting = {
      backgroundColor: root.getPropertyValue("--hover").trim(),
      borderColor: root.getPropertyValue("--border").trim(),
      color: root.getPropertyValue("--muted").trim(),
    };
    const start = 100 + introIndex * 300;
    const loopStart = start + plan.introDuration + 4000;
    for (const chip of plan.chips.filter((c) => c.active)) {
      const node = ref.current.children[chip.index];
      const lit = {
        backgroundColor: chip.background,
        borderColor: chip.border,
        color: "#000000",
      };
      animations.push(
        node.animate([resting, lit], {
          duration: 200,
          delay: start + chip.introAt,
          fill: "both",
          easing: "cubic-bezier(.33,1,.68,1)",
        }),
      );
      animations.push(
        node.animate(chipLoopFrames(chip, plan, resting, lit), {
          duration: plan.loopDuration,
          delay: loopStart,
          iterations: Infinity,
        }),
      );
    }
    return () => animations.forEach((a) => a.cancel());
  }, [plan, reducedMotion, introIndex]);
  return (
    <div
      ref={ref}
      className="digit-diagram"
      aria-label={`Digits contributing to ${badge.name}`}
      data-loop-duration={plan.loopDuration}
    >
      {plan.chips.map((chip) => (
        <span
          key={chip.index}
          className="digit-chip"
          data-active={chip.active}
          data-rank={chip.order}
          data-intro-at={chip.introAt}
          style={{
            "--chip-background": chip.background,
            "--chip-border": chip.border,
          }}
        >
          {chip.digit}
        </span>
      ))}
    </div>
  );
}

function BadgeFooter({ badge, result, reducedMotion, introIndex }) {
  const divisors = {
    ELEVEN: 11,
    DOZEN: 12,
    LUCKY_SEVEN_DIV: 7,
    HARSHAD: String(result.number)
      .split("")
      .reduce((s, d) => s + Number(d), 0),
  };
  const divisor = divisors[badge.id];
  if (divisor)
    return (
      <div className="badge-formula">
        {formatEP(result.number)} = <b>{divisor}</b> ×{" "}
        <strong>{formatEP(result.number / divisor)}</strong>
      </div>
    );
  if (badge.id === "PRONIC") {
    const k = Math.floor(Math.sqrt(result.number));
    return (
      <div className="badge-formula">
        {formatEP(result.number)} = <b>{k}</b> × <strong>{k + 1}</strong>
      </div>
    );
  }
  if (!badge.contributors) return null;
  return (
    <div className="badge-diagram-footer">
      <DigitDiagram
        {...{ badge, number: result.number, reducedMotion, introIndex }}
      />
      {badge.id === "EQUATION" && result.equation && (
        <div className="badge-formula equation">
          {result.equation.numbers.map((n, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span>
                  {" "}
                  {i === 2
                    ? "="
                    : { "*": "×", "/": "÷", "-": "−" }[result.equation.op] ||
                      result.equation.op}{" "}
                </span>
              )}
              <strong style={{ color: groupColors[i] }}>{formatEP(n)}</strong>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const BadgeGroup = memo(function BadgeGroup({
  group,
  result,
  openBadge,
  reducedMotion,
  introIndex,
  theme,
  staged,
}) {
  const b = group.lead;
  return (
    <div
      className={`result-badge-group ${staged ? "is-entering" : ""}`}
      data-badge-id={b.id}
    >
      <article className={`result-badge ${b.rarity}`}>
        <div className="result-badge-heading">
          <button onClick={() => openBadge(b)}>
            <Emoji text={b.emoji} />
            <span>{b.name}</span>
            <span className="result-rarity-label">{b.rarity}</span>
          </button>
          <span className="badge-ep">+{formatEP(b.ep)} EP</span>
        </div>
        <p>{b.description}</p>
        <BadgeFooter
          key={theme}
          {...{ badge: b, result, reducedMotion, introIndex }}
        />
      </article>
      {group.rest.map((b) => (
        <button
          className="superseded-badge"
          key={b.id}
          onClick={() => openBadge(b)}
          title={`Earned but superseded by ${group.lead.name}; adds 0 EP`}
        >
          <span className="branch-mark">└</span>
          <Emoji text={b.emoji} />
          <span>{b.name}</span>
          <em>(earned)</em>
        </button>
      ))}
    </div>
  );
});

export default memo(function BadgeBreakdown({
  result,
  groups,
  visibleCount,
  summaryVisible,
  staged,
  openBadge,
  reducedMotion,
  theme,
}) {
  const visible = groups.slice(-visibleCount || groups.length);
  return (
    <section className="badge-breakdown" aria-label="Badge breakdown">
      <h2>Badge Breakdown</h2>
      <p
        className={`badge-summary ${summaryVisible ? "is-visible" : ""}`}
        aria-hidden={!summaryVisible}
      >
        {result.badges.length} badges earned
      </p>
      <div className="result-badge-list">
        {visible.map((group, i) => (
          <BadgeGroup
            key={group.lead.id}
            {...{
              group,
              result,
              openBadge,
              reducedMotion,
              theme,
              staged,
              introIndex: staged ? 0 : i,
            }}
          />
        ))}
      </div>
    </section>
  );
});
