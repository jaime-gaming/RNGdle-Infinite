import React, { memo } from "react";
import { Target, ArrowRight, Check } from "lucide-react";
import { currentGoal, rollReceipt } from "../gameplay-loop.js";
import { useFormatEP } from "../use-settings.jsx";
import { MEDIAN_ROLL_EP } from "../probability.js";
import "../goal-recap.css";

// Shown after a settled reveal: how much closer that roll brought you to the
// goal you already chose. It is a view over the existing wallet and catalogue
// price — never a second reward, a discount, or a change to any odds.
export default memo(function GoalRecap({ progress, runId, navigate }) {
  const goal = currentGoal(progress);
  if (!goal) return null;
  const receipt = rollReceipt(progress, runId);
  const earned = receipt?.roll?.ep ?? 0;
  const saved = Math.min(progress.balance, goal.price);
  const remaining = Math.max(0, goal.price - progress.balance);
  const percent = Math.min(100, (progress.balance / goal.price) * 100);
  const affordable = remaining === 0;
  const blocked = goal.requiresProfile && !progress.profile;
  const formatEP = useFormatEP();
  // A median-roll estimate, not a prediction: rolls are independent and can repeat.
  const estimate = remaining ? Math.ceil(remaining / MEDIAN_ROLL_EP) : 0;
  return (
    <section
      className={`goal-recap ${affordable ? "is-ready" : ""}`}
      aria-label="Goal progress"
    >
      <div className="goal-recap-head">
        <span className="goal-recap-icon" aria-hidden="true">
          {affordable ? <Check size={15} /> : <Target size={15} />}
        </span>
        <div className="goal-recap-title">
          <span className="eyebrow">
            {affordable ? "GOAL REACHED" : "SAVING TOWARDS"}
          </span>
          <strong>{goal.name}</strong>
        </div>
        {earned > 0 && (
          <span className="goal-recap-gain">+{formatEP(earned)} EP</span>
        )}
      </div>
      <progress
        className="goal-recap-bar"
        aria-label={`${goal.name} savings progress`}
        aria-valuetext={`${formatEP(saved)} of ${formatEP(goal.price)} EP saved`}
        value={saved}
        max={goal.price}
      />
      <p className="goal-recap-figures">
        <span>
          <strong>{formatEP(saved)}</strong> / {formatEP(goal.price)} EP
        </span>
        <span className="goal-recap-percent">{percent.toFixed(0)}%</span>
      </p>
      <p className="goal-recap-note">
        {blocked
          ? "Create a local profile to buy this one."
          : affordable
            ? "You can buy it now. Your EP is already in your wallet."
            : `${formatEP(remaining)} EP to go · about ${estimate.toLocaleString(
                "en-US",
              )} median ${estimate === 1 ? "roll" : "rolls"}`}
      </p>
      <button
        className="goal-recap-link"
        onClick={() => navigate("shop", goal.id)}
      >
        {affordable ? "Open the shop" : "Change goal"} <ArrowRight size={13} />
      </button>
      {!affordable && (
        <small className="goal-recap-disclaimer">
          An estimate from the median roll. Every roll is independent; it is not
          a schedule or a guarantee.
        </small>
      )}
    </section>
  );
});
