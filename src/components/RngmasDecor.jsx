import React, { useEffect, useLayoutEffect, useState } from "react";
import { useMotionPreference } from "../use-settings.jsx";
import { useRngmasStatus } from "../use-rngmas.js";
import {
  BellMark,
  GiftMark,
  PineMark,
  SnowflakeMark,
  WinterStarMark,
} from "./game-icons.jsx";
import "../rngmas.css";

// Fixed snow decoration behind the page while RNGmas is on, in the RNGween
// style: a non-interactive layer under the app canvas, aligned under the
// header, with drift, snowfall and corner ornaments. Reduced motion keeps the
// picture and drops the movement.
const FLAKES = Array.from({ length: 22 }, (_, index) => {
  const wave = Math.sin((index + 1) * 12.9898) * 43758.5453;
  const spread = wave - Math.floor(wave);
  return {
    index,
    left: 2 + ((index * 37 + 11) % 96),
    size: 3 + Math.round(spread * 6),
    delay: -(index * 1.7 + spread * 4),
    duration: 14 + Math.round(spread * 16),
    drift: index % 2 ? 26 : -26,
  };
});

function SnowBank({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 140"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 96c34-26 62-30 92-16 22 10 34 26 58 26 30 0 44-22 74-26 36-5 66 8 96 34v26H0Z"
        fill="currentColor"
      />
      <path
        d="M0 112c40-18 70-18 104-4 26 11 44 20 70 18 34-3 52-18 82-18 26 0 46 8 64 22v10H0Z"
        fill="var(--rngmas-snow-shadow, #dbeafe)"
        opacity="0.55"
      />
    </svg>
  );
}

export default function RngmasDecor({ status: statusOverride } = {}) {
  const live = useRngmasStatus();
  const status = statusOverride ?? live;
  const reduced = useMotionPreference();
  const enabled = status.active;
  const [headerHeight, setHeaderHeight] = useState(48);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const header = document.querySelector(".header");
    if (!header) return undefined;
    const align = () => setHeaderHeight(header.getBoundingClientRect().height);
    align();
    const observer = new ResizeObserver(align);
    observer.observe(header);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.dataset.season = "rngmas";
    else delete root.dataset.season;
    return () => {
      delete root.dataset.season;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className={`rngmas-decor${reduced ? " is-reduced-motion" : ""}`}
      aria-hidden="true"
      style={{ top: headerHeight }}
    >
      <div className="rngmas-aurora" />
      <SnowBank className="rngmas-snowbank rngmas-snowbank-left" />
      <SnowBank className="rngmas-snowbank rngmas-snowbank-right" />
      <PineMark className="rngmas-pine rngmas-pine-left" size={86} />
      <PineMark className="rngmas-pine rngmas-pine-right" size={64} />
      <PineMark className="rngmas-pine rngmas-pine-low" size={48} />
      <GiftMark className="rngmas-gift rngmas-gift-left" size={44} />
      <GiftMark className="rngmas-gift rngmas-gift-right" size={34} />
      <BellMark className="rngmas-bell rngmas-bell-right" size={40} />
      <SnowflakeMark
        className="rngmas-flake-mark rngmas-flake-mark-left"
        size={52}
      />
      <SnowflakeMark
        className="rngmas-flake-mark rngmas-flake-mark-right"
        size={30}
      />
      <WinterStarMark
        className="rngmas-star-mark rngmas-star-mark-left"
        size={30}
      />
      <WinterStarMark
        className="rngmas-star-mark rngmas-star-mark-right"
        size={22}
      />
      <span className="rngmas-snowfield">
        {FLAKES.map((flake) => (
          <i
            key={flake.index}
            style={{
              "--left": `${flake.left}%`,
              "--size": `${flake.size}px`,
              "--delay": `${flake.delay}s`,
              "--duration": `${flake.duration}s`,
              "--drift": `${flake.drift}px`,
            }}
          />
        ))}
      </span>
      <span className="rngmas-garland rngmas-garland-left" />
      <span className="rngmas-garland rngmas-garland-right" />
    </div>
  );
}
