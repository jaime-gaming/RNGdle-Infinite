import React, { useEffect, useRef, memo } from "react";
import { rankPopFrames } from "../roll-timeline";
import {
  formatPercentile,
  rankExplanation,
  chanceLabels,
} from "../probability";

export default memo(function RankSummary({
  result,
  visible,
  rankKnown,
  instant,
  scale = 1,
}) {
  const chance = chanceLabels(result.tierCount, result.rank.population);
  const row = useRef(null),
    pill = useRef(null),
    played = useRef(false);
  useEffect(() => {
    if (!visible) {
      played.current = false;
      return;
    }
    if (played.current) return;
    played.current = true;
    if (instant) return;
    const animations = [
      row.current.animate(rankPopFrames(1.7, 0.9, true), {
        duration: 500 * scale,
        fill: "both",
      }),
      pill.current.animate(rankPopFrames(3, 0.5), {
        duration: 400 * scale,
        delay: 100 * scale,
        fill: "both",
      }),
    ];
    return () => animations.forEach((a) => a.cancel());
  }, [visible, instant, scale]);
  return (
    <div
      ref={row}
      className={`result-rank ${visible ? "is-visible" : ""}`}
      aria-hidden={!visible}
    >
      <span
        ref={pill}
        className={`rank-pill ${rankKnown ? result.tier : "neutral"}`}
        title={
          rankKnown
            ? `${chance.percent} of all possible rolls are ${result.tier} — ${chance.outcomes}. ${chance.frequency} rolls; each roll is independent.`
            : undefined
        }
      >
        {rankKnown ? result.tier : "???"}
      </span>
      <span className="rank-dot">•</span>
      <span
        title={rankKnown ? rankExplanation(result) : undefined}
        className={`percentile ${result.percentile >= 95 ? "exceptional" : result.percentile >= 80 ? "excellent" : result.percentile >= 50 ? "above-average" : result.percentile >= 20 ? "below-average" : "low-roll"}`}
      >
        {rankKnown ? formatPercentile(result) : "???"}
      </span>
    </div>
  );
});
