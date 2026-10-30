import React from "react";
import { Bookmark, History, Sparkles } from "lucide-react";
import { BOOKMARK_LIMIT } from "../progress.js";
import { prestigeShown } from "../rebirth.js";
import NumberBox from "./NumberBox.jsx";

function formatStatEP(value) {
  return `${Math.round(value).toLocaleString("en-US")} EP`;
}

export function when(at) {
  if (!at) return "—";
  return new Date(at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The record block: best roll, key figures, pinned rolls and what the profile
// wears. It draws from a card (see profile-card.js), so the owner's profile
// page and a shared link render the exact same thing from the same data.
export default function ProfileRecord({
  record,
  shared = false,
  live = false,
}) {
  const best = record.best;
  const items = [
    ["Rolls completed", record.rolls.toLocaleString("en-US")],
    ["EP earned all-time", formatStatEP(record.earned)],
    ["Badges discovered", `${record.badges} of ${record.badgesTotal}`],
    prestigeShown({
      rebirths: record.rebirths,
      ultraRebirths: record.prestiges,
    })
      ? ["Rebirths · prestiges", `${record.rebirths} · ${record.prestiges}`]
      : ["Rebirths", `${record.rebirths}`],
  ];
  const owner = shared ? record.name : "Your";
  return (
    <section
      className="profile-history"
      aria-label={shared ? `${record.name}'s record` : "Your record"}
    >
      <h3>
        <History size={15} aria-hidden="true" />{" "}
        {shared ? `${record.name}'s record` : "Your record"}
      </h3>
      <div className="profile-best" data-best-roll={best?.number ?? ""}>
        <NumberBox
          compact
          value={best?.number ?? "??????"}
          tier={best?.tier ?? "neutral"}
          aria-label={best ? `Best roll ${best.number}` : "No best roll yet"}
        />
        <div className="profile-best-copy">
          <span className="profile-kicker">Best roll</span>
          {best ? (
            <>
              <strong>+{formatStatEP(best.ep)}</strong>
              <small>
                {best.tier.toUpperCase()} · {when(best.at)}
              </small>
            </>
          ) : (
            <small>
              {shared
                ? "No roll on record yet."
                : "Your biggest roll will sit here."}
            </small>
          )}
        </div>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="profile-pins">
        <span className="profile-kicker">
          <Bookmark size={12} aria-hidden="true" /> Pinned rolls
        </span>
        {record.pins.length ? (
          <ul aria-label="Pinned rolls">
            {record.pins.map((roll, index) => (
              <li key={`${roll.number}-${index}`}>
                <NumberBox
                  compact
                  value={roll.number}
                  tier={roll.tier}
                  aria-label={`Pinned roll ${roll.number}`}
                />
                <small>+{formatStatEP(roll.ep)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <small className="profile-pins-empty">
            {shared
              ? "No pinned rolls on this card."
              : `Bookmark up to ${BOOKMARK_LIMIT} rolls in History and they show here.`}
          </small>
        )}
      </div>
      <p className="profile-wearing">
        <Sparkles size={12} aria-hidden="true" />
        <span>
          {shared ? `${owner} wears` : "Wearing"}{" "}
          <strong>{record.aura ?? "the original look"}</strong>
          {record.companion ? (
            <>
              {" "}
              with <strong>{record.companion}</strong>
            </>
          ) : null}
          {record.favoriteTier ? (
            <>
              {" "}
              · most rolls land <strong>{record.favoriteTier}</strong>
            </>
          ) : null}
          .
        </span>
      </p>
      <p className="profile-history-note">
        {shared
          ? live
            ? `Latest public profile from ${when(record.at)}. Your full progress and email are private.`
            : `Saved copy from ${when(record.at)}. It may not include more recent progress.`
          : "These figures come from your progress. Clearing history does not change them."}
      </p>
    </section>
  );
}
