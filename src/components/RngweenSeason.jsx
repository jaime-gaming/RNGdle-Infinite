import React, { useEffect, useLayoutEffect, useState } from "react";
import { useMotionPreference, useSettings } from "../use-settings.jsx";
import { rngweenCalendar } from "../rngween.js";
import {
  BatMark,
  BloodMoonMark,
  PhantomMark,
  PumpkinMark,
} from "./game-icons.jsx";
import RngweenSecrets from "./RngweenSecrets.jsx";
import "../rngween.css";

function Web({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
    >
      <path d="M0 0v100M0 0h100M0 0l71 71M0 0l38 92M0 0l92 38M0 24q10 0 9 9 10-5 13 4 0-12 15-7-4-12-13-6M0 50q22-4 19 19 19-11 23 8 1-21 24-17-12-19-16-10M0 78q29-4 30 30 28-16 36 6 4-29 36-20-20-24-24-16" />
    </svg>
  );
}

function Candle({ className }) {
  return (
    <span className={`rngween-candle ${className}`}>
      <span className="rngween-flame" />
      <span className="rngween-wax" />
    </span>
  );
}

// CLEANUP Nov 4, 2026: remove this mount, backdrop/secrets, seasonal palette and
// favicon. Keep the four permanent owned-aura renderers and their effects.
export default function RngweenSeason({
  now,
  theme,
  interactive = false,
  notify,
}) {
  const season = rngweenCalendar(now);
  const { settings } = useSettings();
  const reduced = useMotionPreference();
  const enabled =
    season.decorated && theme === "dark" && settings.halloweenMode;
  const [headerHeight, setHeaderHeight] = useState(48);
  useLayoutEffect(() => {
    if (!enabled) return;
    const header = document.querySelector(".header");
    if (!header) return;
    const align = () => setHeaderHeight(header.getBoundingClientRect().height);
    align();
    const observer = new ResizeObserver(align);
    observer.observe(header);
    return () => observer.disconnect();
  }, [enabled]);
  useEffect(() => {
    const root = document.documentElement;
    const favicon = document.querySelector('link[rel="icon"]');
    const originalIcon = favicon?.getAttribute("href");
    if (enabled) {
      root.dataset.season = "rngween";
      favicon?.setAttribute(
        "href",
        `${import.meta.env.BASE_URL}favicon-halloween.svg`,
      );
    } else delete root.dataset.season;
    return () => {
      delete root.dataset.season;
      if (originalIcon) favicon?.setAttribute("href", originalIcon);
    };
  }, [enabled]);
  if (!enabled) return null;
  return (
    <>
      <div
        className={`rngween-decor${reduced ? " is-reduced-motion" : ""}`}
        aria-hidden="true"
        style={{ top: headerHeight }}
      >
        <div className="rngween-mist" />
        <Web className="rngween-web" />
        <Web className="rngween-web rngween-web-right" />
        <svg
          className="rngween-spider"
          viewBox="0 0 30 110"
          fill="none"
          stroke="currentColor"
        >
          <path d="M15 0v77M11 85 3 80M11 88 2 89M11 91 4 99M19 85l8-5M19 88l9 1M19 91l7 8" />
          <ellipse cx="15" cy="88" rx="5" ry="7" fill="currentColor" />
          <circle cx="13" cy="85" r="0.8" fill="var(--bg)" stroke="none" />
          <circle cx="17" cy="85" r="0.8" fill="var(--bg)" stroke="none" />
        </svg>
        <PumpkinMark className="rngween-pumpkin" size={44} />
        <PumpkinMark
          className="rngween-pumpkin rngween-pumpkin-small"
          size={27}
        />
        <PumpkinMark
          className="rngween-pumpkin rngween-pumpkin-low"
          size={37}
        />
        <BloodMoonMark className="rngween-moon" size={58} />
        <BatMark className="rngween-bat" size={44} />
        <BatMark className="rngween-bat rngween-bat-second" size={28} />
        <BatMark className="rngween-bat rngween-bat-third" size={22} />
        <PhantomMark className="rngween-ghost" size={40} />
        <PhantomMark className="rngween-ghost rngween-ghost-low" size={31} />
        <Candle className="rngween-candle-left" />
        <Candle className="rngween-candle-right" />
        <span className="rngween-candy rngween-candy-left" />
        <span className="rngween-candy rngween-candy-right" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`rngween-spark rngween-spark-${i}`} />
        ))}
      </div>
      <RngweenSecrets
        reduced={reduced}
        interactive={interactive}
        notify={notify}
      />
    </>
  );
}
