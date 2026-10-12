import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { rngweenCalendar, RNGWEEN_MISSIONS } from "../rngween.js";
import { RNGWEEN_WORLD_KEY } from "../rngween-limited.js";
import {
  hasSeenRngweenIntro,
  markRngweenIntroSeen,
  RNGWEEN_INTRO_KEY,
} from "../rngween-intro.js";
import { useModalDialog } from "../use-modal-dialog.js";
import ReaperFigure from "./ReaperFigure.jsx";
import "../rngween-limited.css";

// One welcome per browser, even for guests and across rebirth/settings resets.
// Appearance preferences never gate the event explanation or its rewards.
export default function RngweenIntro({ now, paused = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const dismissed = useRef(hasSeenRngweenIntro());
  const calendar = rngweenCalendar(now);
  const dialog = useModalDialog(open);
  useEffect(() => {
    if (calendar.limitedPhase !== "active") {
      setOpen(false);
      return;
    }
    if (!paused && !dismissed.current && !hasSeenRngweenIntro()) {
      dismissed.current = true;
      markRngweenIntroSeen();
      setOpen(true);
    }
  }, [calendar.limitedPhase, paused]);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    const seen = (event) => {
      if (event.key === RNGWEEN_INTRO_KEY && hasSeenRngweenIntro()) {
        dismissed.current = true;
        setOpen(false);
      }
    };
    window.addEventListener("storage", seen);
    return () => window.removeEventListener("storage", seen);
  }, []);
  function close() {
    dismissed.current = true;
    markRngweenIntroSeen();
    setOpen(false);
  }
  const coins = RNGWEEN_MISSIONS.reduce(
    (sum, mission) => sum + mission.pumpkoins,
    0,
  );
  return (
    <dialog
      className="rngween-story-dialog rngween-welcome"
      ref={dialog}
      aria-labelledby="rngween-welcome-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {open && (
        <>
          <button
            className="rngween-dialog-close"
            aria-label="Close event introduction"
            onClick={close}
          >
            <X size={19} />
          </button>
          <div className="rngween-welcome-art">
            <ReaperFigure />
            <span>RNGween 2026</span>
          </div>
          <div className="rngween-welcome-copy">
            <span className="rngween-limited-kicker">
              October 21–November 3 · UTC
            </span>
            <h1 id="rngween-welcome-title">Welcome to RNGween</h1>
            <p>
              Roll for Halloween badges, earn Pumpkoins and collect event auras.
            </p>
            <ul>
              <li>
                <strong>Halloween tasks · Oct 25–31</strong>
                <span>
                  {calendar.phase === "active"
                    ? `Complete four tasks for four auras and ${coins} Pumpkoins in total.`
                    : calendar.phase === "upcoming"
                      ? "The four aura trials begin October 25. Earn Pumpkoins from hourly commissions while you wait."
                      : "The trials have ended. Hourly commissions return; collected auras stay yours, and the shop and world are still open."}
                </span>
              </li>
              <li>
                <strong>Hourly commissions · Oct 21–24 & Nov 1–3</strong>
                <span>
                  Four at a time from a pool of 50. One hour, no skips: finish
                  for automatic Pumpkoins and a new task. World badge tasks are
                  available to everyone; no key is required.
                </span>
              </li>
              <li>
                <strong>Limited Shop & Halloween · Oct 21–Nov 3</strong>
                <span>
                  Exchange EP for Pumpkoins, or earn them from missions. Meet
                  the exclusive familiar and its skills; missing auras go on
                  sale November 1.
                </span>
              </li>
              <li>
                <strong>The Reaper's Gate · at the foot of Roll</strong>
                <span>
                  Explore four phases: Pumpkin Patch (1–9), Graveyard (1–99),
                  Haunted House (1–999) and Valley of Horrors (1–9999). Collect
                  event badges; Graveyard and Haunted House objectives award key
                  fragments. Forge a free Valley key, or buy the{" "}
                  {RNGWEEN_WORLD_KEY.pumpkoinPrice.toLocaleString("en-US")}{" "}
                  Pumpkoin shortcut. Valley of Horrors rolls 1–9999 without
                  repeats; 6666 earns permanent Hexbound. The internal World
                  shop speeds up result reveals.
                </span>
              </li>
            </ul>
            <p className="rngween-story-note">
              All dates are UTC. Event badges, points, coins, fragments, key,
              speed upgrades, familiar, skills and World retire after November
              3. Collected cosmetics stay. Halloween appearance is optional and
              dark-only.
            </p>
            <button className="primary-button" onClick={close}>
              Let's play
            </button>
            <small>This introduction appears once in this browser.</small>
          </div>
        </>
      )}
    </dialog>
  );
}
