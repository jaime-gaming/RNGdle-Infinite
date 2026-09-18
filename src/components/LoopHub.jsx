import React, { memo } from "react";
import { ArrowUpRight, Check, Compass, Target, Sparkles } from "lucide-react";
import { currentGoal, goalBenefit, rollReceipt } from "../gameplay-loop.js";
import { allBadgeMetadata } from "../infinite-badges.js";
import { badgeMetadata, formatEP } from "../roll-data.js";
import Emoji from "./Emoji";
import "../loop.css";

export default memo(function LoopHub({
  progress,
  runId,
  stage,
  navigate,
  openBadge,
}) {
  const goal = currentGoal(progress),
    receipt =
      stage === "revealing" || stage === "settling"
        ? null
        : rollReceipt(progress, runId);
  const newBadges = (receipt?.unlocked ?? [])
    .map((id) => badgeMetadata.get(id))
    .filter(Boolean);
  const collected = progress.discovered.length,
    total = allBadgeMetadata.length;
  const funded = goal && progress.balance >= goal.price;
  const needsProfile = goal?.requiresProfile && !progress.profile;
  const ready = funded && !needsProfile;
  return (
    <section className="loop-hub" aria-label="Your next steps">
      <div className="loop-receipt" data-receipt={receipt?.roll.id ?? ""}>
        <span className="loop-symbol" aria-hidden="true">
          {receipt ? <Check size={18} /> : <Compass size={18} />}
        </span>
        <div>
          <p className="loop-kicker">
            {receipt
              ? runId
                ? "ROLL COMPLETE"
                : "LAST ONLINE ROLL"
              : stage === "revealing"
                ? "REVEAL IN PROGRESS"
                : stage === "settling"
                  ? "RESULT PENDING"
                  : "ROLL · DISCOVER · UPGRADE"}
          </p>
          <p className="loop-receipt-copy">
            {receipt ? (
              <>
                <strong>+{formatEP(receipt.roll.ep)} EP</strong> added to your
                balance{" "}
                <span>
                  · {newBadges.length} new{" "}
                  {newBadges.length === 1 ? "badge" : "badges"}
                </span>
              </>
            ) : stage === "revealing" ? (
              "Your number is committed. Explore your progress while it reveals."
            ) : stage === "settling" ? (
              "Your number is safe. Finish settlement to update your progress."
            ) : (
              "Collect number stories. Spend your EP on a pace and style of your own."
            )}
          </p>
        </div>
      </div>
      <div className="loop-grid">
        <article
          className={`loop-card goal-card ${ready ? "goal-ready" : ""}`}
          aria-label="Upgrade goal"
        >
          <div className="loop-card-label">
            <Target size={15} />
            <span>
              {progress.goalId ? "YOUR CHOSEN GOAL" : "SUGGESTED NEXT UPGRADE"}
            </span>
            {funded && (
              <span className="goal-ready-tag">
                {needsProfile ? "Profile needed" : "Ready to buy"}
              </span>
            )}
          </div>
          {goal ? (
            <>
              <h2>{goal.name}</h2>
              <p className="loop-description">{goalBenefit(goal)}</p>
              <progress
                aria-label={`Savings for ${goal.name}`}
                max={goal.price}
                value={Math.min(progress.balance, goal.price)}
                aria-valuetext={`${formatEP(Math.min(progress.balance, goal.price))} of ${formatEP(goal.price)} EP`}
              />
              <div className="loop-progress-copy">
                <span>
                  {formatEP(Math.min(progress.balance, goal.price))} /{" "}
                  {formatEP(goal.price)} EP
                </span>
                <strong>
                  {funded
                    ? "Goal reached"
                    : `${formatEP(goal.price - progress.balance)} to go`}
                </strong>
              </div>
              <button
                className="loop-action"
                onClick={() => navigate("shop", goal.id)}
              >
                {ready ? "Review upgrade" : "View goal in shop"}
                <ArrowUpRight size={15} />
              </button>
            </>
          ) : (
            <>
              <h2>Your workshop is complete.</h2>
              <p className="loop-description">
                Every upgrade and aura is yours. Equip a favourite and keep
                exploring your collection.
              </p>
              <button className="loop-action" onClick={() => navigate("shop")}>
                Open your workshop
                <ArrowUpRight size={15} />
              </button>
            </>
          )}
        </article>
        <article
          className="loop-card collection-card"
          aria-label="Collection progress"
        >
          <div className="loop-card-label">
            <Sparkles size={15} />
            <span>NUMBER STORIES</span>
          </div>
          <h2>
            {collected}
            <small> / {total} badges</small>
          </h2>
          <progress
            aria-label="Your discovered badges"
            max={total}
            value={collected}
          />
          <div className="loop-discoveries">
            {newBadges.length ? (
              <>
                <p className="loop-description">New in this roll</p>
                <div className="loop-badge-chips">
                  {newBadges.slice(0, 2).map((b) => (
                    <button
                      key={b.id}
                      onClick={() => openBadge(b)}
                      aria-label={`View new badge ${b.name}`}
                    >
                      <Emoji text={b.emoji} />
                      <span>{b.name}</span>
                    </button>
                  ))}
                  {newBadges.length > 2 && (
                    <span className="loop-more">
                      +{newBadges.length - 2} more
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="loop-description">
                {collected === total
                  ? "Every badge discovered. Your collection is complete."
                  : receipt
                    ? "No new badges this time. You still keep the EP from your roll."
                    : collected
                      ? "Only your discoveries are shown. There are more stories to find."
                      : "Your first roll starts the collection. Undiscovered badges stay a surprise."}
              </p>
            )}
          </div>
          <button className="loop-action" onClick={() => navigate("badges")}>
            Explore collection
            <ArrowUpRight size={15} />
          </button>
        </article>
      </div>
    </section>
  );
});
