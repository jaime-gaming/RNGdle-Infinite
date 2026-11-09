import React, { useEffect, useState } from "react";
import "../loading-screen.css";

const SLOW_LOAD_DELAY_MS = 6_000;

export function LoadingCircle() {
  return <span className="loading-circle" aria-hidden="true" />;
}

export default function LoadingScreen() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), SLOW_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="loading-screen">
      <LoadingCircle />
      {showHint && <p className="loading-hint">wait for it...</p>}
    </div>
  );
}
