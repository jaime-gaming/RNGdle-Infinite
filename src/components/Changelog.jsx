import React, { useEffect } from "react";
import { CHANGELOG, LATEST_VERSION, markSeen } from "../changelog.js";
import { badges } from "../badges";
import Emoji from "./Emoji";
import "../changelog.css";

const badgeById = new Map(badges.map((badge) => [badge.canonicalId, badge]));

function linkBadges(text, ids, onBadge) {
  const named = (ids ?? [])
    .map((id) => badgeById.get(id))
    .filter((badge) => badge && text.includes(badge.name));
  if (!named.length) return text;
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${named.map((b) => escape(b.name)).join("|")})`);

  const icons = new Set(named.map((badge) => badge.emoji));
  const withIcons = new RegExp(`(${[...icons].map(escape).join("|")})`);
  return text.split(pattern).flatMap((part, index) => {
    const badge = named.find((entry) => entry.name === part);
    if (!badge)
      return part
        .split(withIcons)
        .map((piece, i) =>
          icons.has(piece) ? (
            <Emoji key={`${index}-${i}`} text={piece} />
          ) : (
            piece
          ),
        );
    return (
      <button
        key={index}
        type="button"
        className="changelog-badge-link"
        onClick={() => onBadge?.(badge)}
        title={badge.description}
      >
        {part}
      </button>
    );
  });
}

function releaseDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Changelog({ onSeen, onBadge }) {
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
            <span className="changelog-title">
              {entry.title.charAt(0).toUpperCase() + entry.title.slice(1)}
            </span>
            {entry.date && (
              <time className="changelog-date" dateTime={entry.date}>
                {releaseDate(entry.date)}
              </time>
            )}
          </h2>
          {entry.body.map((paragraph, index) => (
            <p key={index}>
              {linkBadges(
                paragraph.charAt(0).toUpperCase() + paragraph.slice(1),
                entry.badges,
                onBadge,
              )}
            </p>
          ))}
        </article>
      ))}
      <p className="changelog-note">
        Rolls stay uniform over 0–1,000,000 and EP scoring never changed.
      </p>
    </div>
  );
}
