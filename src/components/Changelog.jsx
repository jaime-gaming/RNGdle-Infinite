import React, { useEffect } from "react";
import { CHANGELOG, LATEST_VERSION, markSeen } from "../changelog.js";
import "../changelog.css";

export default function Changelog({ onSeen }) {
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
        </article>
      ))}
      <p className="changelog-note">
        Rolls stay uniform over 0–1,000,000 and EP scoring never changed.
      </p>
    </div>
  );
}
