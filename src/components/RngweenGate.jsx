import React from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import ReaperFigure from "./ReaperFigure.jsx";
import ReaperDialog from "./ReaperDialog.jsx";
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
          <button
            className="secondary-button"
            onClick={() => onOpenChange(true)}
            aria-haspopup="dialog"
          >
            <KeyRound size={16} />
            Speak to The Reaper <ArrowRight size={14} />
          </button>
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
