import React from "react";
import { Cog } from "lucide-react";
import { FLYWHEEL_CHARGES } from "../flywheel";
export default function FlywheelMeter({ progress, boosted }) {
  if (!progress.owned.includes("flywheel")) return null;
  const charge = progress.flywheelCharge ?? 0,
    ready = charge === FLYWHEEL_CHARGES;
  return (
    <section
      className={`flywheel-meter ${ready ? "is-charged" : ""} ${boosted ? "is-spinning" : ""}`}
      aria-label="Flywheel status"
    >
      <Cog size={24} aria-hidden="true" />
      <div className="flywheel-copy">
        <div>
          <strong>Flywheel</strong>
          <span>
            {boosted
              ? "Boost in use"
              : ready
                ? "Charged"
                : `${charge} / ${FLYWHEEL_CHARGES}`}
          </span>
        </div>
        <progress
          aria-label="Flywheel charge"
          value={charge}
          max={FLYWHEEL_CHARGES}
        />
        <p>
          {boosted
            ? "This roll has a full reveal and no cooldown afterward."
            : ready
              ? "Your next roll has no cooldown. The full reveal still plays."
              : "Four completed online rolls charge your next roll. Offline rolls do not count."}
        </p>
      </div>
    </section>
  );
}
