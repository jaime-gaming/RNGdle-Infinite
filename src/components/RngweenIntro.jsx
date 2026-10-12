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
              Halloween has come to RNGdle. Until November 3 you can earn
              Pumpkoins, collect event auras and explore a haunted side of the
              game.
            </p>
            <ul>
              <li>
                <strong>Halloween tasks · Oct 25–31</strong>
                <span>
                  {calendar.phase === "active"
                    ? `Four tasks, four auras. Finish them all and you also take home ${coins} Pumpkoins.`
                    : calendar.phase === "upcoming"
                      ? "Four tasks that each unlock an aura. They open on October 25; until then, hourly tasks pay Pumpkoins."
                      : "The aura tasks are over. The auras you collected are yours to keep; the shop and the World stay open until November 3."}
                </span>
              </li>
              <li>
                <strong>Hourly tasks · Oct 21–24 & Nov 1–3</strong>
                <span>
                  Four small goals at a time, one hour each. Finish one, claim
                  it before the hour is up, and the next one takes its place. No
                  skips.
                </span>
              </li>
              <li>
                <strong>Limited Shop · Oct 21–Nov 3</strong>
                <span>
                  Trade EP for Pumpkoins and spend them on a pumpkin companion,
                  a seasonal skill and a key to the Valley. Any aura you missed
                  goes on sale November 1.
                </span>
              </li>
              <li>
                <strong>RNGween World · the Reaper at the foot of Roll</strong>
                <span>
                  Four haunted zones with their own badges. Clear the Graveyard
                  and the Haunted House to forge a key to the Valley of Horrors,
                  or buy one for{" "}
                  {RNGWEEN_WORLD_KEY.pumpkoinPrice.toLocaleString("en-US")}{" "}
                  Pumpkoins. Roll 6666 in the Valley and Hexbound is yours.
                </span>
              </li>
            </ul>
            <p className="rngween-story-note">
              All dates are UTC. When the event ends, the auras you collected
              stay. Everything else goes.
            </p>
            <button className="primary-button" onClick={close}>
              Let's play
            </button>
            <small>You will only see this once.</small>
          </div>
        </>
      )}
    </dialog>
  );
}
