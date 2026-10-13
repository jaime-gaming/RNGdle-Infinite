import React, { useState } from "react";
import { Check, Download, Trophy } from "lucide-react";
import {
  renderRngweenCardBlob,
  rngweenRecord,
  rngweenRecordFileName,
} from "../rngween-record.js";

// The "Record" tab: your event in numbers, and a PNG card of it to keep or
// share. Figures come from the save and the log; the card is paint only, so
// nothing can read it back into a game.
export default function WorldRecord({ progress, now }) {
  const record = rngweenRecord(progress, new Date(now));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function saveCard() {
    if (saving) return;
    setSaving(true);
    setNote("");
    try {
      const blob = await renderRngweenCardBlob(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = rngweenRecordFileName(record);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote("Card saved as a PNG.");
    } catch {
      setNote("The card could not be drawn in this browser.");
    } finally {
      setSaving(false);
    }
  }
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
    ["Graveyard fragment", record.fragments.graveyard],
    ["Haunted House fragment", record.fragments["haunted-house"]],
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
      <div className="world-record-actions">
        <button
          type="button"
          data-testid="world-record-save"
          onClick={saveCard}
          disabled={saving}
        >
          <Download size={14} aria-hidden="true" />{" "}
          {saving ? "Drawing the card…" : "Save PNG card"}
        </button>
        {note && (
          <small role="status" className="world-record-note">
            {note}
          </small>
        )}
      </div>
    </section>
  );
}
