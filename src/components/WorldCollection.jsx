// CLEANUP Nov 4, 2026: delete this file with the World.
import React, { useMemo } from "react";
import {
  Bone,
  Cat,
  Check,
  DoorClosed,
  Flame,
  Footprints,
  Ghost,
  Gem,
  KeyRound,
  Moon,
  PanelsTopLeft,
  Skull,
  Trophy,
  Bird,
} from "lucide-react";
import {
  WORLD_BADGES,
  WORLD_MINI_RANGES,
  scoreWorldNumber,
  worldBadgeOdds,
  worldPhaseGoals,
  worldMiniSummary,
} from "../rngween-world-badges.js";

const ICONS = {
  bones: Bone,
  cat: Cat,
  candle: Flame,
  door: DoorClosed,
  ghost: Ghost,
  hex: Gem,
  mirror: PanelsTopLeft,
  moon: Moon,
  skull: Skull,
  stairs: Footprints,
  crow: Bird,
  pumpkin: Flame,
};
export function WorldBadgeGlyph({ badge, size = 19 }) {
  const Icon = ICONS[badge.icon] ?? Ghost;
  return <Icon size={size} aria-hidden="true" />;
}
// `counts` are the zone's tallies after this roll, so a badge seen once is
// a first: it gets a "new" mark, which is most of the fun of a collection.
export function WorldResultBadges({ result, counts = null }) {
  return (
    <div className="world-result-badges" aria-label="Badges on this roll">
      {result.badges.map((badge) => {
        const first = counts ? (counts[badge.id] ?? 0) === 1 : false;
        return (
          <span
            key={badge.id}
            className={`world-badge-chip world-tier-${badge.tier}${first ? " is-new" : ""}`}
            data-result-badge={badge.id}
          >
            <WorldBadgeGlyph badge={badge} size={14} />
            {badge.name}
            <strong>+{badge.points}</strong>
            {first && <em>New</em>}
          </span>
        );
      })}
    </div>
  );
}

// Event collections never enter the ordinary badge index or its EP tables.
export default function WorldCollection({ zone, stats, fragmentOwned, drawn }) {
  const summary = worldMiniSummary(zone.id, stats);
  const goals = worldPhaseGoals(zone.id, stats);
  const complete = fragmentOwned || goals.every((goal) => goal.complete);
  const range = WORLD_MINI_RANGES[zone.id];
  const best = stats?.best
    ? scoreWorldNumber(zone.id, stats.best.number)
    : null;
  const chances = useMemo(() => {
    const initial = worldBadgeOdds(zone.id);
    if (zone.id !== "valley" || !drawn.length) return initial;
    const remaining = Object.fromEntries(
      Object.entries(initial).map(([id, odds]) => [
        id,
        { count: odds.count, total: odds.total - drawn.length },
      ]),
    );
    for (const number of drawn)
      for (const badge of scoreWorldNumber(zone.id, number).badges)
        remaining[badge.id].count--;
    return remaining;
  }, [zone.id, drawn]);
  return (
    <section
      className="world-collection"
      aria-label={`${zone.name} collection`}
    >
      <div className="world-mini-stats">
        <div>
          <span>{zone.name} points</span>
          <strong data-world-points>
            {summary.score.toLocaleString("en-US")}
          </strong>
        </div>
        <div>
          <span>Badges collected</span>
          <strong data-world-collected>
            {summary.unique}
            <small> / {summary.total}</small>
          </strong>
        </div>
        <div>
          <span>Best roll</span>
          <strong className="world-best-number">{best?.text ?? "—"}</strong>
          <small>
            {best
              ? `+${best.points.toLocaleString("en-US")} points`
              : "No rolls yet"}
          </small>
        </div>
      </div>
      {!!goals.length && (
        <div className={`world-objectives${complete ? " is-complete" : ""}`}>
          <div className="world-collection-heading">
            <div>
              <span className="world-eyebrow">
                {zone.fragment
                  ? `Earns key fragment ${zone.phase} of 4`
                  : "Valley milestones"}
              </span>
              <h3>{zone.name} objectives</h3>
            </div>
            {complete ? (
              <span className="world-fragment-owned">
                <Check size={15} />
                {zone.fragment ? "Fragment owned" : "Objectives cleared"}
              </span>
            ) : (
              <KeyRound size={23} />
            )}
          </div>
          <p>
            {zone.fragment
              ? fragmentOwned
                ? "Your fragment is saved. You can keep collecting badges for points and the Record."
                : "Finish all three and the fragment is yours, automatically. Progress here never resets."
              : complete
                ? "All Valley milestones done. Only 6666 is left to find."
                : "Milestones for the Record. Hexbound still needs the number 6666 itself."}
          </p>
          <div className="world-objective-grid">
            {goals.map((goal) => (
              <article
                key={goal.id}
                data-world-objective={goal.id}
                className={goal.complete ? "is-complete" : ""}
              >
                <span>
                  {goal.complete ? <Check size={15} /> : <Trophy size={15} />}
                  {goal.name}
                </span>
                <strong>
                  {Math.min(goal.count, goal.goal).toLocaleString("en-US")}
                  <small> / {goal.goal.toLocaleString("en-US")}</small>
                </strong>
                <progress
                  value={Math.min(goal.count, goal.goal)}
                  max={goal.goal}
                  aria-label={goal.name}
                />
              </article>
            ))}
          </div>
        </div>
      )}
      <details className="world-badge-book">
        <summary>
          <span>
            <Ghost size={19} />
            <strong>{zone.name} badges</strong>
          </span>
          <small>
            {summary.unique}/{summary.total} collected · RNGween only
          </small>
        </summary>
        <p>
          Every badge the number matches adds its points, repeats included;
          points count toward the objectives above. Numbers use {range.digits}{" "}
          {range.digits === 1 ? "digit" : "digits"}
          {range.digits === 1
            ? " (1–9)"
            : range.digits === 2
              ? " (01–99)"
              : range.digits === 3
                ? " (001–999)"
                : " (0001–9999)"}
          .{" "}
          {zone.id === "valley"
            ? "Chances below use the current unseen pool."
            : "Every roll has the same chances."}
        </p>
        <div className="world-badge-grid">
          {WORLD_BADGES[zone.id].map((badge) => {
            const count = stats?.counts?.[badge.id] ?? 0;
            const odds = chances[badge.id];
            const chance =
              odds.count === 0 || odds.total === 0
                ? "0%"
                : odds.count === 1
                  ? `1 / ${odds.total.toLocaleString("en-US")}`
                  : `${((100 * odds.count) / odds.total).toFixed(1)}%`;
            return (
              <article
                key={badge.id}
                data-world-badge={badge.id}
                className={`world-badge-card world-tier-${badge.tier}${count ? " is-collected" : ""}`}
              >
                <span className="world-badge-icon">
                  <WorldBadgeGlyph badge={badge} size={22} />
                  {count > 0 && <Check size={10} />}
                </span>
                <div>
                  <span className="world-badge-tier">{badge.tier}</span>
                  <h4>{badge.name}</h4>
                  <p>{badge.detail}</p>
                </div>
                <div className="world-badge-card-footer">
                  <strong>+{badge.points} points</strong>
                  <span
                    title={`${odds.count} of ${odds.total} available numbers match`}
                  >
                    {chance}
                  </span>
                  <small>
                    {count
                      ? `Collected ×${count.toLocaleString("en-US")}`
                      : "Not collected"}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
}
