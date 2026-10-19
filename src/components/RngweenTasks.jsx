// CLEANUP Nov 4, 2026: delete this file. Aura missions are not claimable after
// the event and owned auras are shown by the wardrobe, not by this panel.
import React, { useRef, useState } from "react";
import { ArrowUpRight, Check, Gift, KeyRound, Timer } from "lucide-react";
import { missionWorldDetail, rngweenState } from "../rngween.js";
import { productById } from "../shop-data.js";
import { waitText } from "../tasks.js";
import { formatEP } from "../roll-data.js";
import NumberBox from "./NumberBox";
import { PumpkinMark } from "./game-icons.jsx";
import "../rngween.css";

function countText(mission) {
  if (mission.metric === "banked")
    return `${formatEP(mission.count)} / ${formatEP(mission.goal)} EP`;
  const unit =
    mission.metric === "rare"
      ? "Rare+"
      : mission.metric === "taskClaims"
        ? "tasks"
        : "rolls";
  return `${mission.count} / ${mission.goal} ${unit}`;
}

export default function RngweenTasks({
  progress,
  now,
  onAction,
  notify,
  openAuraFamily,
  openWorld,
}) {
  const event = rngweenState(progress.tasks, now, progress.rngweenLimited);
  const [pending, setPending] = useState("");
  const busy = useRef(false);
  if (event.phase !== "active") return null;
  const hasCollection = progress.owned.some(
    (id) => productById.get(id)?.eventOnly,
  );

  async function collect(mission) {
    if (busy.current) return;
    busy.current = true;
    setPending(mission.id);
    try {
      const outcome = await onAction({
        type: "claim-rngween-aura",
        id: mission.id,
      });
      notify?.(
        outcome?.ok
          ? {
              kind: "reward",
              title: `${productById.get(mission.auraId).name} collected`,
              text: `+${mission.pumpkoins} Pumpkoins. Aura added to your collection. Pumpkoins expire after November 3 UTC.`,
            }
          : {
              kind: "error",
              text:
                outcome?.message ??
                "That Halloween aura could not be collected yet.",
            },
      );
    } finally {
      busy.current = false;
      setPending("");
    }
  }

  return (
    <section
      className="rngween-event"
      data-event-phase="active"
      aria-labelledby="rngween-event-title"
    >
      <header className="rngween-event-head">
        <span className="rngween-event-icon" aria-hidden="true">
          <PumpkinMark size={34} />
        </span>
        <div>
          <span className="rngween-eyebrow">
            One-time Halloween event · Oct 25–31, 2026 · UTC
          </span>
          <h2 id="rngween-event-title">RNGween</h2>
          <p>Complete four tasks for Halloween auras.</p>
        </div>
        <span className="rngween-live">Live</span>
      </header>
      <div className="rngween-event-intro">
        <p>
          Complete and claim these tasks by October 31 UTC for their auras and
          Pumpkoins. Missing auras go on sale in Limited Shop November 1–3.
          Collected auras survive resets and will not return after this event.
          World badges are separate; speak to The Reaper below Roll to play.
        </p>
        {hasCollection && (
          <button
            className="secondary-button"
            onClick={() => openAuraFamily?.("rngween")}
          >
            Your Halloween collection{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="rngween-event-progress">
        <span>
          <strong>
            {event.collected} / {event.total}
          </strong>{" "}
          auras collected
        </span>
        <span>
          <Timer size={13} aria-hidden="true" /> Ends in{" "}
          {waitText(event.endsAt - now)}
        </span>
        <progress
          max={event.total}
          value={event.collected}
          aria-label="RNGween event progress"
        />
      </div>
      <ul className="rngween-missions" aria-label="Halloween tasks">
        {event.missions.map((mission, index) => {
          const aura = productById.get(mission.auraId);
          const state = mission.collected
            ? "collected"
            : mission.claimable
              ? "claimable"
              : "open";
          return (
            <li
              key={mission.id}
              className="rngween-mission"
              data-event-mission={mission.id}
              data-state={state}
              style={{
                "--treat-a": aura.swatch[0],
                "--treat-b": aura.swatch[1],
              }}
            >
              <div className="rngween-mission-top">
                <span>Task {String(index + 1).padStart(2, "0")}</span>
                <span>
                  {mission.collected
                    ? "Collected"
                    : mission.claimable
                      ? "Ready to collect"
                      : "In progress"}
                </span>
              </div>
              <div className="rngween-mission-preview" aria-hidden="true">
                <NumberBox value="131031" tier="rare" aura={aura.id} compact />
              </div>
              <h3>{mission.title}</h3>
              <p>
                {mission.detail} {missionWorldDetail(mission)}
              </p>
              <div className="rngween-mission-meter">
                <span>
                  {mission.collected
                    ? "Collected · yours forever"
                    : countText(mission)}
                </span>
                <progress
                  max={mission.goal}
                  value={mission.collected ? mission.goal : mission.count}
                  aria-label={`${mission.title} progress`}
                />
              </div>
              {/* The World half: the matching zone's key fragment. */}
              <div
                className="rngween-mission-world"
                data-done={mission.worldDone ? "true" : "false"}
              >
                {mission.worldDone ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <KeyRound size={13} aria-hidden="true" />
                )}
                <span>
                  {mission.zoneName} fragment
                  {mission.worldDone ? " · found" : " · not yet"}
                </span>
                {!mission.worldDone && openWorld && (
                  <button type="button" onClick={openWorld}>
                    Open the World <ArrowUpRight size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="rngween-mission-reward">
                <Gift size={14} aria-hidden="true" />
                <strong>
                  {aura.name} + {mission.pumpkoins} Pumpkoins
                </strong>
                <span>2026 exclusive</span>
              </div>
              <button
                className={
                  mission.claimable ? "primary-button" : "secondary-button"
                }
                disabled={!mission.claimable || !!pending}
                onClick={() => collect(mission)}
                aria-label={`Collect ${aura.name}`}
              >
                {mission.collected ? (
                  <>
                    <Check size={14} aria-hidden="true" /> In your collection
                  </>
                ) : pending === mission.id ? (
                  "Collecting…"
                ) : mission.claimable ? (
                  `Collect ${aura.name}`
                ) : (
                  "Complete task to collect"
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="rngween-event-note">
        Online rolls only. Claim each aura and its Pumpkoins together; no EP is
        spent. Finish and collect by 23:59 UTC on October 31.
      </p>
    </section>
  );
}
