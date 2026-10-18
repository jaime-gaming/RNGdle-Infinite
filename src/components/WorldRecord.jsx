import React from "react";
import { Check, Trophy } from "lucide-react";
import { rngweenRecord } from "../rngween-record.js";
import { WORLD_FRAGMENT_ZONES, worldZoneById } from "../rngween-world-zones.js";

// The "Record" tab: your event in numbers. Figures come from the save and
// the log, nothing is stored twice.
export default function WorldRecord({ progress, now }) {
  const record = rngweenRecord(progress, new Date(now));
  const figures = [
    [
      "Pumpkoins",
      record.pumpkoins.toLocaleString("en-US"),
      `${record.earned.toLocaleString("en-US")} earned`,
    ],
    [
      "World rolls",
      record.rolls.toLocaleString("en-US"),
      `${record.points.toLocaleString("en-US")} points`,
    ],
    [
      "Event badges",
      `${record.badges} / ${record.badgesTotal}`,
      `${record.commissions} commission${record.commissions === 1 ? "" : "s"} claimed`,
    ],
    [
      "Halloween auras",
      `${record.auras.length} / ${record.aurasTotal}`,
      record.hexbound ? "Hexbound unlocked" : "Hexbound waits in the Valley",
    ],
  ];
  const pieces = [
    ...WORLD_FRAGMENT_ZONES.map((id) => [
      `${worldZoneById.get(id).name} fragment`,
      record.fragments[id],
    ]),
    ["Key forged", record.key],
    ["6666 in the Valley", record.jackpot],
  ];
  return (
    <section className="world-record" aria-label="Your event record">
      <div className="world-record-head">
        <span className="world-eyebrow">
          <Trophy size={13} aria-hidden="true" /> Your RNGween 2026
        </span>
        <h3>{record.name}'s event record</h3>
      </div>
      <dl className="world-record-figures">
        {figures.map(([title, big, small]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>
              <strong>{big}</strong>
              <small>{small}</small>
            </dd>
          </div>
        ))}
      </dl>
      <div className="world-record-columns">
        <ul className="world-record-zones" aria-label="Zones">
          {record.zones.map((zone) => (
            <li key={zone.id} style={{ "--zone-accent": zone.accent }}>
              <i aria-hidden="true" />
              <span>{zone.name}</span>
              <small>
                {zone.rolls} rolls · {zone.badges}/{zone.badgesTotal} badges ·{" "}
                {zone.points} pts
              </small>
            </li>
          ))}
        </ul>
        <ul className="world-record-pieces" aria-label="The Valley key">
          {pieces.map(([text, done]) => (
            <li key={text} data-done={done ? "true" : "false"}>
              <span className="world-record-check" aria-hidden="true">
                {done && <Check size={12} />}
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <p className="world-record-auras">
        {record.auras.length || record.hexbound ? (
          <>
            Collected:{" "}
            <strong>
              {[...record.auras, ...(record.hexbound ? ["Hexbound"] : [])].join(
                " · ",
              )}
            </strong>
            .
          </>
        ) : (
          "No Halloween aura collected yet. Objectives and the tasks page hand them out."
        )}
      </p>
    </section>
  );
}
