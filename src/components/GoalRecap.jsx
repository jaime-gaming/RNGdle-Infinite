import React, { memo } from "react";
import { Target, Check } from "lucide-react";
import { currentGoal } from "../gameplay-loop.js";
import { useFormatEP } from "../use-settings.jsx";
import "../goal-recap.css";

export default memo(function GoalRecap({ progress, runId, navigate }) {
  const goal = currentGoal(progress);
  if (!goal) return null;
  const saved = Math.min(progress.balance, goal.price);
  const percent = Math.min(100, (progress.balance / goal.price) * 100);
  const affordable = progress.balance >= goal.price;
  const formatEP = useFormatEP();
  const label = affordable
    ? `${goal.name} is affordable now.`
    : `Saving towards ${goal.name}: ${formatEP(saved)} of ${formatEP(
        goal.price,
      )} EP, ${percent.toFixed(0)}%.`;
  return (
    <div className={`goal-recap ${affordable ? "is-ready" : ""}`}>
      <span
        className="goal-recap-ring"
        style={{ "--fill": `${percent}%` }}
        role="img"
        aria-label={label}
        title={label}
      >
        {affordable ? <Check size={14} /> : <Target size={14} />}
      </span>
      <button
        className="goal-recap-link"
        onClick={() => navigate("shop", goal.id)}
      >
        {affordable ? "Open the shop" : "View in shop"}
      </button>
    </div>
  );
});
