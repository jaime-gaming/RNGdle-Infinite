import { PROFILE_PIN_PREVIEW_LIMIT } from "../history-log.js";
import React, { useEffect, useState } from "react";
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

export default function ProfileRecord({ record, shared = false }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [record.name]);
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
      {record.description && (
        <p className="profile-description">{record.description}</p>
      )}
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
            {record.pins
              .slice(0, expanded ? BOOKMARK_LIMIT : PROFILE_PIN_PREVIEW_LIMIT)
              .map((roll, index) => (
                <li key={`${roll.number}-${index}`}>
                  <NumberBox
                    compact
                    value={roll.number}
                    tier={roll.tier}
                    dejaVu={roll.dejaVu === true}
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
        {record.pins.length > PROFILE_PIN_PREVIEW_LIMIT && (
          <button
            className="secondary-button profile-pins-more"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? "Show fewer pinned rolls"
              : `Show all ${Math.min(record.pins.length, BOOKMARK_LIMIT)} pinned rolls`}
          </button>
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
    </section>
  );
}
