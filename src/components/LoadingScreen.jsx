import React from "react";
import "../loading-screen.css";

// One circle, nothing else. While the game data, account or profile is still
// settling, this is the entire page: no header, copy, artwork, logo or labels
// alongside it, so a half-loaded save never looks ready to play.
export function LoadingCircle() {
  return <span className="loading-circle" aria-hidden="true" />;
}

export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-label="Loading">
      <LoadingCircle />
    </div>
  );
}
