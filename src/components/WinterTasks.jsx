import { WINTER_GATHERINGS } from "../winter-festival.js";
import { WINTER_ROTATIONS, winterSchedule } from "../winter-rotation.js";
import WinterMotif from "./WinterMotif.jsx";
import React, { useRef, useState } from "react";
import WinterFestival from "./WinterFestival.jsx";
import { WinterChapters } from "./Rngmas.jsx";

import "../winter-village.css";

export default function WinterTasks({ progress, status, onAction, notify }) {
  const [view, setView] = useState("festival");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function run(action, message) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const result = await onAction(action);
      notify?.({
        kind: result.ok ? "done" : "error",
        text: result.ok ? message : result.message,
      });
      return result.ok;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className="winter-tasks" aria-label="RNGmas tasks">
      <header className="winter-village-header">
        <div className="winter-village-lights" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ "--bulb": i }} />
          ))}
        </div>
        <WinterMotif motif="tree" size={76} aria-hidden="true" />
        <div>
          <p className="eyebrow">DECEMBER 1 — JANUARY 2 · UTC</p>
          <h2>Christmas in the village</h2>
          <p>Light the tree. Stock the kitchen. Keep the sleigh moving.</p>
        </div>
        <div className="winter-village-status">
          <strong>
            {winterSchedule(WINTER_GATHERINGS, status.now).active.length}{" "}
            gathering live
          </strong>
          <span>New commission every four days</span>
        </div>
      </header>
      <div className="winter-village-stats" aria-label="Winter itinerary">
        <span>
          <strong>5</strong> weekly chapters
        </span>
        <span>
          <strong>{WINTER_GATHERINGS.length}</strong> gatherings
        </span>
        <span>
          <strong>{WINTER_ROTATIONS.length}</strong> rotating commissions
        </span>
      </div>
      <nav className="festival-tabs" aria-label="RNGmas task sections">
        <button
          className="secondary-button"
          aria-pressed={view === "festival"}
          onClick={() => setView("festival")}
        >
          Missions & live events
        </button>
        <button
          className="secondary-button"
          aria-pressed={view === "weekly"}
          onClick={() => setView("weekly")}
        >
          Weekly chapters
        </button>
      </nav>
      {view === "festival" ? (
        <WinterFestival
          progress={progress}
          status={status}
          onAction={run}
          pending={pending}
        />
      ) : (
        <WinterChapters
          showServices={false}
          progress={progress}
          status={status}
          onAction={run}
          onSmash={() =>
            run(
              { type: "golem-smash", golemId: status.week?.id },
              "Strike prepared. Your next main online roll supplies the damage.",
            )
          }
          pending={pending}
        />
      )}
    </section>
  );
}
