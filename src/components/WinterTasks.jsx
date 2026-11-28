import WinterEventHeader from "./WinterEventHeader.jsx";
import WinterEventGuide from "./WinterEventGuide.jsx";
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
    } catch (error) {
      notify?.({
        kind: "error",
        text:
          error?.message ||
          "The action could not be completed. Your saved progress is unchanged.",
      });
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className="winter-tasks winter-event" aria-label="RNGmas tasks">
      <WinterEventHeader status={status} />
      <WinterEventGuide status={status} />
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
