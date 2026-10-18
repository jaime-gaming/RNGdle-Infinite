// CLEANUP Nov 4, 2026: delete this file with the World. The opening is pure
// presentation: it awards nothing, reads nothing from the save and can be
// skipped at any moment. A local receipt keeps it to the first visit.
import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  DoorClosed,
  Flame,
  KeyRound,
  MoonStar,
  Skull,
  X,
} from "lucide-react";
import ReaperFigure from "./ReaperFigure.jsx";
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

// Four scenes, about fifteen seconds in all. Each entry is how long the
// scene stays before the next one starts; the last waits for the player.
const SCENES = [
  {
    ms: 3800,
    kicker: "The Reaper's Gate",
    title: "RNGween World",
    text: "The gate opens for one week. Inside, the numbers are different.",
  },
  {
    ms: 4600,
    kicker: "One path",
    title: "Five zones, in order",
    text: "Each zone opens the next. Start among the pumpkins and walk the path to the Valley.",
  },
  {
    ms: 3600,
    kicker: "Four fragments",
    title: "Every zone hides a piece of a key",
    text: "Clear a zone's three objectives to earn its fragment. Four fragments forge the Valley key.",
  },
  {
    ms: 0,
    kicker: "Beyond the key",
    title: "One number waits in the Valley",
    text: "6666. Roll it once, without repeats, and Hexbound is yours for good. Your badges along the way earn World points for the World shop.",
  },
];

export default function WorldIntro({ onDone }) {
  const reduced = useMotionPreference();
  // Reduced motion skips straight to the last scene with every line listed.
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
    >
      <button
        type="button"
        className="world-intro-skip"
        onClick={onDone}
        aria-label={last ? "Close the opening" : "Skip the opening"}
      >
        <X size={15} /> {last ? "Close" : "Skip"}
      </button>
      <div className="world-intro-stage" aria-hidden="true">
        <span className="world-intro-moon" />
        <span className="world-intro-stars" />
        {scene === 0 && (
          <div className="world-intro-gate">
            <span className="world-intro-gate-bar" />
            <span className="world-intro-gate-bar" />
            <ReaperFigure className="world-intro-reaper" speaking />
          </div>
        )}
        {scene === 1 && (
          <ol className="world-intro-path">
            {ZONES.map(([name, Icon, accent], i) => (
              <li key={name} style={{ "--i": i, "--accent": accent }}>
                <span>
                  <Icon size={22} />
                </span>
                <small>{name}</small>
              </li>
            ))}
          </ol>
        )}
        {scene === 2 && (
          <div className="world-intro-key">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ "--i": i }}>
                <KeyRound size={34} />
              </span>
            ))}
          </div>
        )}
        {scene === 3 && (
          <div className="world-intro-valley">
            <span className="world-intro-number">6666</span>
            <HexboundMark size={28} />
          </div>
        )}
      </div>
      <div className="world-intro-copy" key={scene}>
        <span className="world-eyebrow">{current.kicker}</span>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        {reduced && (
          <ul className="world-intro-recap">
            {SCENES.slice(0, -1).map((item) => (
              <li key={item.title}>{item.text}</li>
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
