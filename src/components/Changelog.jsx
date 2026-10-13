import React, { useEffect } from "react";
import { Medal } from "lucide-react";
import { CHANGELOG, LATEST_VERSION, markSeen } from "../changelog.js";
import { badges } from "../badges";
import Emoji from "./Emoji";
import "../changelog.css";

const badgeById = new Map(badges.map((badge) => [badge.canonicalId, badge]));

export default function Changelog({ onSeen, onBadge }) {
  // Opening the page is the acknowledgement: the "New Version" flag clears.
  useEffect(() => {
    markSeen();
    onSeen?.();
  }, [onSeen]);
  return (
    <div className="changelog">
      {CHANGELOG.map((entry) => (
        <article
          key={entry.version}
          className={`changelog-entry ${
            entry.version === LATEST_VERSION ? "is-latest" : ""
          }`}
        >
          <h2>
            <span className="changelog-version">{entry.version}</span>
            <span className="changelog-dash">—</span>
            <span className="changelog-title">{entry.title}</span>
          </h2>
          {entry.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {entry.badges?.length > 0 && (
            <div className="changelog-badges">
              <span className="changelog-badges-label">
                <Medal size={12} aria-hidden="true" /> New badges
              </span>
              {entry.badges.map((id) => {
                const badge = badgeById.get(id);
                if (!badge) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`changelog-badge ${badge.rarity.toLowerCase()}`}
                    onClick={() => onBadge?.(badge)}
                    aria-label={`Open badge ${badge.name}`}
                    title={badge.description}
                  >
                    <Emoji text={badge.emoji} />
                    <span>{badge.name}</span>
                    <small>{badge.rarity}</small>
                  </button>
                );
              })}
            </div>
          )}
        </article>
      ))}
      <p className="changelog-note">
        Rolls stay uniform over 0–1,000,000 and EP scoring never changed.
      </p>
    </div>
  );
}
