import React, { useEffect, useState } from "react";
import "../loading-screen.css";

const SLOW_LOAD_DELAY_MS = 6_000;
const INFINITY_PATH =
  "M3.5 12 C3.5 7.2 9.1 7.1 12 12 C14.9 16.9 20.5 16.8 20.5 12 C20.5 7.2 14.9 7.1 12 12 C9.1 16.9 3.5 16.8 3.5 12";

export function LoadingEmblem() {
  return (
    <span className="loading-emblem" role="img" aria-label="Loading">
      <svg className="loading-infinity" viewBox="0 0 24 24" aria-hidden="true">
        <path className="loading-infinity-line" d={INFINITY_PATH} />
        <circle className="loading-orbit-light" r="1.35">
          <animateMotion
            dur="3.4s"
            repeatCount="indefinite"
            path={INFINITY_PATH}
          />
        </circle>
      </svg>
    </span>
  );
}

export default function LoadingScreen() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), SLOW_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="loading-screen">
      <LoadingEmblem />
      {showHint && <p className="loading-hint">wait for it...</p>}
    </div>
  );
}
