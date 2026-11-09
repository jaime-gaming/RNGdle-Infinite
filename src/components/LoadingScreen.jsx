import React from "react";
import "../loading-screen.css";

export function LoadingCircle() {
  return <span className="loading-circle" aria-hidden="true" />;
}

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <LoadingCircle />
    </div>
  );
}
