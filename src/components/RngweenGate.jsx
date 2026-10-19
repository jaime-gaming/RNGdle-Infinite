import React from "react";
import { ArrowRight, DoorOpen, KeyRound } from "lucide-react";
import ReaperFigure from "./ReaperFigure.jsx";
import ReaperDialog from "./ReaperDialog.jsx";
import { worldState } from "../rngween-world-zones.js";
import { hasEnteredRngweenWorld } from "../rngween-intro.js";
import "../rngween-limited.css";

// CLEANUP Nov 4, 2026: remove the public footer entrance, not owned auras.
export default function RngweenGate({
  progress,
  now,
  open,
  onOpenChange,
  onAction,
  onWorld,
  onTasks,
  onShop,
  openSignup,
}) {
  // The Reaper introduces the World once. After the first visit the gate
  // opens straight into it; he stays one tap away for anyone who wants him.
  // A save with World rounds counts too, so other devices skip him as well.
  const visited =
    hasEnteredRngweenWorld() ||
    worldState(progress.rngweenLimited).visited.length > 0;
  return (
    <>
      <aside
        className="rngween-gate-line"
        aria-label="Halloween world entrance"
      >
        <div className="rngween-gate-inner">
          <ReaperFigure />
          <div>
            <span className="rngween-limited-kicker">
              The Reaper's Gate · until Nov 3 UTC
            </span>
            <strong>RNGween World</strong>
            <span>Five zones. Four fragments unlock the Valley challenge.</span>
          </div>
          <div className="rngween-gate-actions">
            {visited && (
              <button className="primary-button" onClick={onWorld}>
                <DoorOpen size={16} />
                Enter the World <ArrowRight size={14} />
              </button>
            )}
            <button
              className="secondary-button"
              onClick={() => onOpenChange(true)}
              aria-haspopup="dialog"
            >
              <KeyRound size={16} />
              Speak to The Reaper{!visited && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </aside>
      <ReaperDialog
        {...{
          progress,
          now,
          open,
          onAction,
          onWorld,
          onTasks,
          onShop,
          openSignup,
        }}
        onClose={() => onOpenChange(false)}
      />
    </>
  );
}
