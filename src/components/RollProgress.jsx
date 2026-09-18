import React, { memo } from "react";
import { currentGoal, rollReceipt } from "../gameplay-loop.js";
import { BADGE_TOTAL } from "../rebirth.js";
import { formatEP } from "../roll-data.js";
import "../progress-links.css";
// Keep progression as quiet links, outside the original reveal and breakdown.
export default memo(function RollProgress({ progress, runId, navigate }) {
  const goal = currentGoal(progress),
    receipt = rollReceipt(progress, runId);
  return (
    <section className="roll-progress-links" aria-label="Progress">
      <p>
        <button onClick={() => navigate("badges")}>
          {progress.discovered.length} / {BADGE_TOTAL} badges
        </button>
        {receipt?.unlocked.length > 0 && (
          <span>
            {" "}
            · {receipt.unlocked.length} new in {runId ? "this" : "your last"}{" "}
            roll
          </span>
        )}
        {!!progress.rebirths && (
          <span>
            {" "}
            · {progress.rebirths}{" "}
            {progress.rebirths === 1 ? "rebirth" : "rebirths"}
          </span>
        )}
      </p>
      {goal ? (
        <p>
          Goal:{" "}
          <button onClick={() => navigate("shop", goal.id)}>{goal.name}</button>
          <span>
            {" "}
            · {formatEP(Math.min(progress.balance, goal.price))} /{" "}
            {formatEP(goal.price)} EP
          </span>
          {goal.requiresProfile && !progress.profile && (
            <span> · Local profile required</span>
          )}
        </p>
      ) : (
        <p>
          All shop items owned.{" "}
          <button onClick={() => navigate("shop")}>Shop</button>
        </p>
      )}
    </section>
  );
});
