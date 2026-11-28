import React from "react";
import WinterMotif from "./WinterMotif.jsx";
import WinterCountdown from "./WinterCountdown.jsx";
import { WINTER_GATHERINGS } from "../winter-festival.js";
import { WINTER_ROTATIONS } from "../winter-rotation.js";
import "../winter-village.css";

export default function WinterEventHeader({
  status,
  title = "RNGmas 2026",
  titleId,
  heading = "h2",
  subtitle = "Christmas in the village · Light the tree. Stock the kitchen. Keep the sleigh moving.",
  stats = true,
}) {
  const Heading = heading;
  return (
    <>
      <header className="winter-village-header" data-live={status.active}>
        <div className="winter-village-lights" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ "--bulb": i }} />
          ))}
        </div>
        <WinterMotif motif="tree" size={76} aria-hidden="true" />
        <div>
          <p className="eyebrow">DECEMBER 1, 2026 — JANUARY 2, 2027 · UTC</p>
          <Heading id={titleId}>{title}</Heading>
          <p>{subtitle}</p>
        </div>
        <div className="winter-village-status">
          <strong>
            {status.active
              ? "The village is open"
              : status.over
                ? "The season has ended"
                : "Opens December 1"}
          </strong>
          {!status.over && (
            <WinterCountdown
              until={status.active ? status.end : status.start}
              label={status.active ? "Season ends in" : "Opens in"}
            />
          )}
        </div>
      </header>
      {stats && (
        <div className="winter-village-stats" aria-label="Winter itinerary">
          <span>
            <strong>24</strong> daily doors + Christmas star
          </span>
          <span>
            <strong>5</strong> weekly chapters
          </span>
          <span>
            <strong>
              {WINTER_GATHERINGS.length} + {WINTER_ROTATIONS.length}
            </strong>{" "}
            gatherings + commissions
          </span>
        </div>
      )}
    </>
  );
}
