import React from "react";
import { Cog } from "lucide-react";
import { flywheelRequired } from "../flywheel";
export default function FlywheelMeter({ progress, boosted }) {
  if (!progress.owned.includes("flywheel")) return null;
  const required = flywheelRequired(progress.owned);
  const charge = progress.flywheelCharge ?? 0,
    ready = charge >= required;
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
                : `${charge} / ${required}`}
          </span>
        </div>
        <progress aria-label="Flywheel charge" value={charge} max={required} />
        <p>
          {boosted
            ? "This roll has a full reveal and no cooldown afterward."
            : ready
              ? "Your next roll has no cooldown. The full reveal still plays."
              : `${required} completed online ${required === 1 ? "roll charges" : "rolls charge"} your next roll. Offline rolls do not count.`}
        </p>
      </div>
    </section>
  );
}
