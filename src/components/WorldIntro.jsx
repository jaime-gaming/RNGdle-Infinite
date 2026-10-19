// CLEANUP Nov 4, 2026: delete this file with the World. The opening is pure
// presentation: it awards nothing, reads nothing from the save and can be
// skipped at any moment. A local receipt keeps it to the first visit.
import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  DoorClosed,
  Flame,
  MoonStar,
  Skull,
  X,
} from "lucide-react";
import ReaperFigure from "./ReaperFigure.jsx";
import WorldScenery from "./WorldScenery.jsx";
import { PumpkinMark, HexboundMark } from "./game-icons.jsx";
import { useMotionPreference } from "../use-settings.jsx";
import "../rngween-world-intro.css";

const ZONES = [
  ["Pumpkin Patch", PumpkinMark, "#f29f4a"],
  ["Graveyard", Skull, "#8fd3c3"],
  ["Blood Moon Ridge", MoonStar, "#ff6b7a"],
  ["Haunted House", DoorClosed, "#a7e3a0"],
  ["Valley of Horrors", Flame, "#f05b87"],
];
// Where each zone marker sits along the drawn path (viewBox 760×300).
const PATH_POINTS = [
  [70, 236],
  [220, 182],
  [380, 214],
  [540, 150],
  [690, 196],
];
const PATH_D =
  "M70 236C130 230 160 170 220 182S330 240 380 214 480 130 540 150 640 230 690 196";

// Four scenes, about fifteen seconds in all. Each entry is how long the
// scene stays before the next one starts; the last waits for the player.
// One short line each: the pictures carry the story.
const SCENES = [
  { ms: 4200, zone: "graveyard", accent: "#b7adf0", line: "RNGween World" },
  {
    ms: 4600,
    zone: "pumpkin-patch",
    accent: "#fbbf77",
    line: "Five zones. One path.",
  },
  {
    ms: 3600,
    zone: "haunted-house",
    accent: "#95dfa3",
    line: "Four fragments forge the key.",
  },
  {
    ms: 0,
    zone: "valley",
    accent: "#fb7185",
    line: "Roll 6666. Hexbound is yours for good.",
  },
];
const RECAP = [
  "Zones open one after another, from the Pumpkin Patch to the Valley.",
  "Each zone's three objectives earn a key fragment; four forge the key.",
  "6666 in the Valley grants Hexbound permanently.",
];
const BATS = [0, 1, 2];
const EMBERS = [0, 1, 2, 3, 4, 5, 6, 7];
const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

function Bat({ i }) {
  return (
    <svg
      className="world-intro-bat"
      style={{ "--i": i }}
      viewBox="0 0 48 20"
      aria-hidden="true"
    >
      <path
        className="world-intro-wing"
        d="M24 10C20 2 10 0 0 6c6 2 8 6 8 10 4-4 10-4 16 0"
      />
      <path
        className="world-intro-wing is-right"
        d="M24 10c4-8 14-10 24-4-6 2-8 6-8 10-4-4-10-4-16 0"
      />
      <circle cx="24" cy="10" r="3" />
    </svg>
  );
}

// One key drawn once; four clipped copies fly in from the corners and meet.
function KeyShape() {
  return (
    <svg viewBox="0 0 160 72" aria-hidden="true">
      <circle
        cx="30"
        cy="36"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
      />
      <path
        d="M52 36h98M118 36v18M138 36v24"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function WorldIntro({ onDone }) {
  const reduced = useMotionPreference();
  // Reduced motion skips straight to the last scene with a short recap.
  const [scene, setScene] = useState(reduced ? SCENES.length - 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const ms = SCENES[scene].ms;
    if (!ms) return;
    const timer = window.setTimeout(() => setScene(scene + 1), ms);
    return () => window.clearTimeout(timer);
  }, [scene, reduced]);
  const last = scene === SCENES.length - 1;
  const current = SCENES[scene];
  return (
    <div
      className={`world-intro${reduced ? " is-still" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="RNGween World opening"
      data-world-intro={scene}
      style={{ "--world-accent": current.accent }}
    >
      <button
        type="button"
        className="world-intro-skip"
        onClick={onDone}
        aria-label={last ? "Close the opening" : "Skip the opening"}
      >
        <X size={15} /> {last ? "Close" : "Skip"}
      </button>
      <div className="world-intro-stage" aria-hidden="true" key={scene}>
        <div className="world-intro-backdrop">
          <WorldScenery zone={current.zone} />
        </div>
        <span className="world-intro-fog" />
        <span className="world-intro-fog is-far" />
        {scene === 0 && (
          <div className="world-intro-gate">
            {BATS.map((i) => (
              <Bat key={i} i={i} />
            ))}
            <svg className="world-intro-arch" viewBox="0 0 300 260">
              <path
                d="M14 260V110Q14 20 150 20t136 90v150"
                fill="none"
                stroke="#6a5880"
                strokeWidth="10"
              />
              <path
                d="M150 20V0M14 110l-8-24 8-8 8 8zm272 0 8-24-8-8-8 8z"
                fill="#6a5880"
                stroke="#6a5880"
                strokeWidth="6"
              />
            </svg>
            <span className="world-intro-gate-bar">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} />
              ))}
            </span>
            <span className="world-intro-gate-bar is-right">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} />
              ))}
            </span>
            <span className="world-intro-gate-light" />
            <ReaperFigure className="world-intro-reaper" speaking />
          </div>
        )}
        {scene === 1 && (
          <div className="world-intro-path">
            {/* Stretched to the stage so the markers, placed in percentages
                of the same box, sit exactly on the trail. */}
            <svg viewBox="0 0 760 300" preserveAspectRatio="none">
              <path className="world-intro-trail-glow" d={PATH_D} />
              <path className="world-intro-trail" d={PATH_D} />
            </svg>
            {ZONES.map(([name, Icon, accent], i) => (
              <span
                key={name}
                className="world-intro-marker"
                style={{
                  "--i": i,
                  "--accent": accent,
                  "--x": PATH_POINTS[i][0] / 7.6,
                  "--y": PATH_POINTS[i][1] / 3,
                }}
              >
                <b>
                  <Icon size={22} />
                </b>
                <small>{name}</small>
              </span>
            ))}
          </div>
        )}
        {scene === 2 && (
          <div className="world-intro-key">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="world-intro-shard" style={{ "--i": i }}>
                <KeyShape />
              </span>
            ))}
            <span className="world-intro-flash" />
            {SPARKS.map((i) => (
              <i key={i} className="world-intro-spark" style={{ "--i": i }} />
            ))}
          </div>
        )}
        {scene === 3 && (
          <div className="world-intro-valley">
            {EMBERS.map((i) => (
              <i key={i} className="world-intro-ember" style={{ "--i": i }} />
            ))}
            <span className="world-intro-number">
              {["6", "6", "6", "6"].map((d, i) => (
                <b key={i} style={{ "--i": i }}>
                  {d}
                </b>
              ))}
            </span>
            <span className="world-intro-hexbound">
              <HexboundMark size={34} />
            </span>
          </div>
        )}
      </div>
      <div className="world-intro-copy" key={`copy-${scene}`}>
        <h2>{current.line}</h2>
        {reduced && (
          <ul className="world-intro-recap">
            {RECAP.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <div className="world-intro-dots">
          {SCENES.map((_, i) => (
            <i key={i} className={i <= scene ? "is-on" : ""} />
          ))}
        </div>
        {last ? (
          <button type="button" className="primary-button" onClick={onDone}>
            Enter the World <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScene(scene + 1)}
          >
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
