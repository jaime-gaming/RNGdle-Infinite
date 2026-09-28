import React from "react";

// Hand-drawn game marks.
//
// The interface used stock emoji artwork for companions and for a few call to
// actions, which reads as clip art next to the rest of the interface. These are
// original line icons instead: one 24×24 grid, a 2px optical margin, one stroke
// weight, round caps and joins, and a single filled accent per glyph at most
// (the `tone` class), so a companion, a badge or a shelf looks like part of the
// same product at any size from 16px to 28px.
function Mark({ children, size = 20, className = "", title, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ---- Product marks --------------------------------------------------------
// Used for page headings, the catalogue strip and the shop shelves.
export const RollMark = (props) => (
  <Mark {...props}>
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.6" />
    <path d="M7.4 8.6c0-1 .8-1.8 1.8-1.8M7.4 15.4v-1.2" />
    <circle className="tone" cx="9.1" cy="9.1" r="1.35" />
    <circle className="tone" cx="14.9" cy="14.9" r="1.35" />
    <circle className="tone" cx="14.9" cy="9.1" r="1.05" />
    <circle className="tone" cx="9.1" cy="14.9" r="1.05" />
  </Mark>
);

export const BadgeMark = (props) => (
  <Mark {...props}>
    <path d="M9.4 14.2 8.2 21l3.8-2.1L15.8 21l-1.2-6.8" />
    <circle cx="12" cy="9.4" r="5.6" />
    <path
      className="tone"
      d="m12 6.6.95 1.98 2.15.32-1.56 1.54.37 2.16L12 11.58l-1.91 1.02.37-2.16-1.56-1.54 2.15-.32Z"
    />
  </Mark>
);

export const SkillMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.4 18.9 7.3v9.4L12 20.6 5.1 16.7V7.3Z" />
    <path d="M12 7.6 15.6 9.7v4.6L12 16.4l-3.6-2.1V9.7Z" />
    <path className="tone" d="m12 10.4 1.9 1.5-1.9 2.2-1.9-2.2Z" />
  </Mark>
);

export const AuraMark = (props) => (
  <Mark {...props}>
    <circle className="tone" cx="12" cy="12" r="2.9" />
    <path d="M4.9 9.3A7.8 7.8 0 0 1 16.7 4.7M19.1 14.7a7.8 7.8 0 0 1-11.8 4.6" />
    <path d="M6.7 17.2A7.9 7.9 0 0 1 4.2 12M19.8 12a7.9 7.9 0 0 1-2.5 5.2" />
  </Mark>
);

export const CompanionMark = (props) => (
  <Mark {...props}>
    <path d="M12 20.4c-4 0-7.2-1.5-7.2-4.4 0-2.2 1.9-3.8 4.4-4.5l1.4-3.4a2.6 2.6 0 0 1 2.5-1.6c1.5 0 2.6 1 2.8 2.3l.7 2.3c1.8.6 3 1.9 3 3.8 0 2.9-3.6 5.5-7.6 5.5Z" />
    <path d="M9.8 8.4 8.1 4.8m8.7 6.1 2.6-1.7" />
    <circle className="tone" cx="15.1" cy="10.1" r="1.05" />
    <path d="M12.4 15.6h2.4" />
  </Mark>
);

export const WalletMark = (props) => (
  <Mark {...props}>
    <path d="M20.6 10.9V8.6a2.6 2.6 0 0 0-2.6-2.6H6A2.6 2.6 0 0 0 3.4 8.6v7.8A2.6 2.6 0 0 0 6 19h12a2.6 2.6 0 0 0 2.6-2.6v-2.2" />
    <path d="M3.4 9.6h14.2a2.6 2.6 0 0 1 0 5.2H3.4" />
    <circle className="tone" cx="16.4" cy="12.2" r="1.05" />
  </Mark>
);

export const PaceMark = (props) => (
  <Mark {...props}>
    <path d="M4.2 17.2a8.8 8.8 0 1 1 15.6 0" />
    <path d="M6.6 12.4h1M8.9 8.9 9.6 9.6M12 7.6v1M15.1 8.9l-.7.7M17.4 12.4h-1" />
    <path d="m12 15 3.6-4.6" />
    <circle className="tone" cx="12" cy="15" r="1.35" />
  </Mark>
);

export const VaultMark = (props) => (
  <Mark {...props}>
    <rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3.2" />
    <circle className="tone" cx="11.4" cy="12" r="3.5" />
    <path d="M11.4 8.5V6.9M11.4 17.1v-1.6M14.9 12h1.6M6.4 7.2h.01M6.4 16.8h.01" />
  </Mark>
);

export const LensMark = (props) => (
  <Mark {...props}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m14.9 14.9 4.6 4.6M7.9 10.5h5.2M10.5 7.9v5.2" />
  </Mark>
);

export const AutomationMark = (props) => (
  <Mark {...props}>
    <path d="M4.2 12a7.8 7.8 0 0 1 13.3-5.5" />
    <path d="M19.8 12a7.8 7.8 0 0 1-13.3 5.5" />
    <path d="M17.9 3.6v3.3h-3.3M6.1 20.4v-3.3h3.3" />
  </Mark>
);

export const CoreMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.4 19.2 7.6v8.8L12 20.6 4.8 16.4V7.6Z" />
    <path d="M12 7.2a4.8 4.8 0 1 1-4.8 4.8" />
    <path className="tone" d="M12 16.8a4.8 4.8 0 1 1 4.8-4.8" />
  </Mark>
);

export const OfflineMark = (props) => (
  <Mark {...props}>
    <path d="M19.8 14.6A8.2 8.2 0 0 1 9.4 4.2a7.8 7.8 0 1 0 10.4 10.4Z" />
    <path d="M15.9 7.1v4.2M18.4 7.1v4.2" />
  </Mark>
);

export const StreakMark = (props) => (
  <Mark {...props}>
    <path d="M13 3.4c1.4 2.6 5.4 5.4 5.4 9.1a6.4 6.4 0 1 1-12.8 0c0-1.8.7-3.2 1.8-4.4" />
    <path
      className="tone"
      d="M12 19.2a3.2 3.2 0 0 0 3.2-3.2c0-1.6-1.4-2.6-2.3-4-1 1.4-2.4 2.4-2.4 4a3.2 3.2 0 0 0 1.5 3.2Z"
    />
  </Mark>
);

export const TimerMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="13.4" r="6.8" />
    <path d="M12 9.8v3.6l2.4 1.7M9.6 3.8h4.8M12 3.8v2.8" />
    <circle className="tone" cx="12" cy="13.4" r="1.1" />
  </Mark>
);

export const InfinityMark = (props) => (
  <Mark {...props}>
    <path d="M8.2 8.5C5.5 8.5 3.6 10 3.6 12s1.9 3.5 4.6 3.5c2.4 0 4-1.7 5.8-3.5-1.8-1.8-3.4-3.5-5.8-3.5Z" />
    <path d="M15.8 8.5c2.7 0 4.6 1.5 4.6 3.5s-1.9 3.5-4.6 3.5c-2.4 0-4-1.7-5.8-3.5 1.8-1.8 3.4-3.5 5.8-3.5Z" />
  </Mark>
);

export const LegendMark = (props) => (
  <Mark {...props}>
    <path
      className="tone"
      d="M12 4.2l2.2 4.9 5.3.5-4 3.5 1.2 5.2L12 15.6l-4.7 2.7 1.2-5.2-4-3.5 5.3-.5Z"
    />
    <path d="M4.4 8.1 3 12l1.4 3.9M19.6 8.1 21 12l-1.4 3.9" />
  </Mark>
);

// ---- Pace, tools and skill marks ------------------------------------------
export const SpeedMark = (props) => (
  <Mark {...props}>
    <path d="M3.6 8.4h9.2M3.6 12h6.4M3.6 15.6h4.2" />
    <path d="m15.4 6.8 4.6 5.2-4.6 5.2" />
  </Mark>
);

export const ClockMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="6.6" />
    <path d="M12 4.2v1.4M12 18.4v1.4M4.2 12h1.4M18.4 12h1.4M6.5 6.5l1 1M16.5 16.5l1 1M17.5 6.5l-1 1M7.5 16.5l-1 1" />
    <path className="tone" d="M12 12l3.2-2.4-1.6 4Z" />
  </Mark>
);

export const FlywheelMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="7.2" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 4.8V9.6M18.2 16.4l-4.1-2.4M5.8 16.4l4.1-2.4" />
    <path d="M19.2 7.4a8.4 8.4 0 0 1 1.4 4.6" />
  </Mark>
);

export const SurgeMark = (props) => (
  <Mark {...props}>
    <path d="M13.4 3.6 6.8 13h4.6l-1.2 7.4L17.8 11h-4.8Z" />
    <path className="tone" d="M18.4 5.6h2.6v2.6h-2.6Z" />
  </Mark>
);

export const TrailMark = (props) => (
  <Mark {...props}>
    <ellipse cx="12" cy="15.4" rx="4.6" ry="3.8" />
    <circle cx="7.4" cy="10.6" r="1.5" />
    <circle cx="10.6" cy="8.4" r="1.5" />
    <circle cx="14.2" cy="8.6" r="1.5" />
    <circle cx="17" cy="11" r="1.4" />
  </Mark>
);

export const BounceMark = (props) => (
  <Mark {...props}>
    <path d="M3.8 19.6h16.4" />
    <path d="M4.4 12.6c1.6-4.6 4.6-7 7.6-7s6 2.4 7.6 7" />
    <path d="M4.4 12.6 7 16.4M19.6 12.6 17 16.4" />
    <circle className="tone" cx="12" cy="16.4" r="2.1" />
  </Mark>
);

export const TwiceMark = (props) => (
  <Mark {...props}>
    <rect x="3.6" y="6.4" width="10.4" height="11.2" rx="2.4" />
    <path d="M7.6 6.4V5.2a1.8 1.8 0 0 1 1.8-1.8h8a1.8 1.8 0 0 1 1.8 1.8v9.4a1.6 1.6 0 0 1-1.6 1.6h-1" />
    <path className="tone" d="M7.2 12.2h3.4v3.4H7.2Z" />
  </Mark>
);

export const BedrockMark = (props) => (
  <Mark {...props}>
    <path d="M2.8 17.4 8.6 8l3.4 5.4L14.8 9l6.4 8.4Z" />
    <path d="M2.8 19.8h18.4" />
    <path className="tone" d="M8.6 8 6.6 11.2h4Z" />
  </Mark>
);

export const TurboMark = (props) => (
  <Mark {...props}>
    <path d="M6.6 17.4 12 13.4l5.4 4M6.6 13.4 12 9.4l5.4 4M9.4 9.6 12 7.6l2.6 2" />
  </Mark>
);

export const QuarryMark = (props) => (
  <Mark {...props}>
    <circle cx="11.2" cy="11.2" r="7.4" />
    <circle cx="11.2" cy="11.2" r="3" />
    <path d="m16.4 16.4 4.2 4.2" />
    <circle className="tone" cx="11.2" cy="11.2" r="1" />
  </Mark>
);

export const BayMark = (props) => (
  <Mark {...props}>
    <rect x="3.6" y="3.6" width="7" height="16.8" rx="2" />
    <rect x="13.4" y="3.6" width="7" height="7" rx="2" />
    <rect className="tone" x="13.4" y="13.4" width="7" height="7" rx="2" />
  </Mark>
);

// ---- Aura marks -----------------------------------------------------------
// One glyph per cosmetic, drawn from the same vocabulary as the box layers so
// the shelf preview and the worn aura describe the same effect.
export const StarfallMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.8c.7 3.3 1.9 4.5 5.2 5.2-3.3.7-4.5 1.9-5.2 5.2-.7-3.3-1.9-4.5-5.2-5.2 3.3-.7 4.5-1.9 5.2-5.2Z" />
    <path
      className="tone"
      d="M17.4 14.6c.4 1.6.9 2.1 2.5 2.5-1.6.4-2.1.9-2.5 2.5-.4-1.6-.9-2.1-2.5-2.5 1.6-.4 2.1-.9 2.5-2.5Z"
    />
  </Mark>
);

export const AuroraMark = (props) => (
  <Mark {...props}>
    <path d="M3.6 9.4c2.4-3 4.8-3 7.2 0s4.8 3 7.2 0" />
    <path d="M3.6 14.6c2.4-3 4.8-3 7.2 0s4.8 3 7.2 0" />
    <path className="tone" d="M6 6.2h2.4v2.4H6Z" />
  </Mark>
);

export const OrbitMark = (props) => (
  <Mark {...props}>
    <circle className="tone" cx="12" cy="12" r="3.1" />
    <ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(-24 12 12)" />
    <circle cx="19.4" cy="8.4" r="1.2" />
  </Mark>
);

export const FrostglassMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.4 18.6 8v8L12 20.6 5.4 16V8Z" />
    <path d="M12 3.4v7M12 10.4 5.4 8M12 10.4l6.6-2.4M12 10.4v10.2" />
    <path className="tone" d="M10.2 12.6h3.6v3.6h-3.6Z" />
  </Mark>
);

export const EmberwakeMark = (props) => (
  <Mark {...props}>
    <path d="M12 20.4c-3 0-5.2-1.9-5.2-4.6 0-3.4 4-4.8 5.2-9 1.2 4.2 5.2 5.6 5.2 9 0 2.7-2.2 4.6-5.2 4.6Z" />
    <circle className="tone" cx="10.4" cy="6.6" r="1.2" />
    <circle className="tone" cx="15.4" cy="4.8" r=".9" />
  </Mark>
);

export const EclipseMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="6.4" />
    <path
      className="tone"
      d="M12 5.6a6.4 6.4 0 0 1 0 12.8 3.4 3.4 0 0 0 0-12.8Z"
    />
    <path d="M12 2.6v1.6M12 19.8v1.6M2.6 12h1.6M19.8 12h1.6M5.4 5.4l1.1 1.1M17.5 17.5l1.1 1.1M18.6 5.4l-1.1 1.1M6.5 17.5l-1.1 1.1" />
  </Mark>
);

export const PrismMark = (props) => (
  <Mark {...props}>
    <path d="M10.6 6.4 14 15.4H7.2Z" />
    <path d="M3.4 15.4h3.8M4.4 5.6l4.6 8.2" />
    <path d="m15.6 9.8 4.4-2.2M15.4 12.6l4.8 1.2M15 15.2l4 4" />
  </Mark>
);

export const TidepoolMark = (props) => (
  <Mark {...props}>
    <path d="M3.4 10.4c1.4-1.6 2.8-1.6 4.2 0s2.8 1.6 4.2 0 2.8-1.6 4.2 0 2.8 1.6 4.2 0" />
    <path d="M3.4 15.6c1.4-1.6 2.8-1.6 4.2 0s2.8 1.6 4.2 0 2.8-1.6 4.2 0 2.8 1.6 4.2 0" />
    <circle className="tone" cx="16.6" cy="5.8" r="1.6" />
  </Mark>
);

export const VerdantMark = (props) => (
  <Mark {...props}>
    <path d="M20 4.4c0 8-4 12-9.8 12H4.6c0-7.4 4-11.6 10-11.6Z" />
    <path d="M4.6 20.4c.8-4 2.6-7 5.8-9.2" />
    <path className="tone" d="M14.4 8.4c-1.4 1.2-2.4 2.8-3 4.6" />
  </Mark>
);

export const CircuitMark = (props) => (
  <Mark {...props}>
    <path d="M4.4 6.6h6.2v4.2h5M15.6 10.8v6.4M8.4 13.6v3.8h7.2" />
    <circle className="tone" cx="18.6" cy="17.4" r="1.8" />
    <circle className="tone" cx="6.4" cy="17.4" r="1.4" />
    <circle className="tone" cx="6.4" cy="6.6" r="1.4" />
  </Mark>
);

export const ObsidianMark = (props) => (
  <Mark {...props}>
    <path d="M12 2.8 19.4 9v6.6L12 21.2 4.6 15.6V9Z" />
    <path d="M4.6 9 12 12.4l7.4-3.4M12 12.4v8.8" />
    <path className="tone" d="M12 2.8 19.4 9l-7.4 3.4Z" />
  </Mark>
);

export const SingularityMark = (props) => (
  <Mark {...props}>
    <circle className="tone" cx="12" cy="12" r="2.6" />
    <path d="M12 4.6a7.4 7.4 0 1 1-7.4 7.4" />
    <path d="M12 8a4 4 0 0 0 0 8" />
    <path d="M4.6 12 2.8 9.6M19.4 12l1.8 2.4" />
  </Mark>
);

export const NebulaMark = (props) => (
  <Mark {...props}>
    <path d="M4.8 14.6c0-4 3.4-7 7.6-6.8 3 .1 5 1.5 5.6 3.4" />
    <path d="M3.6 11.2c1.2-2 3.4-3 5.6-2.6M20 12.6c-.6-1.6-2.2-2.6-4-2.6" />
    <circle className="tone" cx="10" cy="9.4" r="1" />
    <circle className="tone" cx="15.4" cy="14.2" r=".85" />
    <circle className="tone" cx="7.6" cy="16.6" r=".75" />
  </Mark>
);

export const SolsticeMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="4.6" />
    <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
    <circle className="tone" cx="12" cy="12" r="1.5" />
  </Mark>
);

export const LumenMark = (props) => (
  <Mark {...props}>
    <path d="M4.6 9.4V6.8a2.2 2.2 0 0 1 2.2-2.2h2.6M14.6 4.6h2.6a2.2 2.2 0 0 1 2.2 2.2v2.6M19.4 14.6v2.6a2.2 2.2 0 0 1-2.2 2.2h-2.6M9.4 19.4H6.8a2.2 2.2 0 0 1-2.2-2.2v-2.6" />
    <path
      className="tone"
      d="M12 9.6l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z"
    />
  </Mark>
);

export const GlitchMark = (props) => (
  <Mark {...props}>
    <path d="M4.4 6.4h11.2M8.4 10h11.2M4.4 13.6h7.2M13.6 13.6h6M6.4 17.6h13.2" />
    <path d="M3.4 10h1.6M7.6 6.4h2.4M16 13.6h2.4" />
    <path className="tone" d="M15.6 4.6h4.8v3.2h-4.8Z" />
  </Mark>
);

export const MonolithMark = (props) => (
  <Mark {...props}>
    <path d="M8 3.6h8l1.6 16.8H6.4Z" />
    <path d="M12 3.6v16.8" />
    <path className="tone" d="M9.2 7.6h2.2v8H9.2Z" />
  </Mark>
);

export const ChronoMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="7.4" />
    <path d="M12 4.6v1.6M12 17.8v1.6M4.6 12h1.6M17.8 12h1.6M7.6 7.6l1.1 1.1M15.3 15.3l1.1 1.1M16.4 7.6l-1.1 1.1M8.7 15.3l-1.1 1.1" />
    <path className="tone" d="m12 12 3.4-2.6-1.8 4.2Z" />
  </Mark>
);

export const SparkMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.6l1.8 5.4 5.4 1.8-5.4 1.8L12 18l-1.8-5.4L4.8 10.8l5.4-1.8Z" />
    <path d="M18.6 16.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
  </Mark>
);

// ---- Companion creatures --------------------------------------------------
// One glyph per companion, drawn on the same grid so a shelf of thirteen still
// looks like one collection rather than thirteen pasted images.
const CREATURES = {
  pebble: (
    <>
      <path d="M6.4 17.6c-2.2-2.3-1.9-7.1.9-9.8 2.4-2.3 7.6-2.5 9.9-.2 2 2 2.4 6.2.5 8.5-1.8 2.2-9 3.6-11.3 1.5Z" />
      <path d="m9 9.4 3.3 2.3-1.6 3.6" />
    </>
  ),
  moth: (
    <>
      <path d="M12 8.4v7.8" />
      <path d="m11.6 9.4 3.6-3.1 1.6 3.6M12.4 9.4 8.8 6.3 7.2 9.9" />
      <path d="M11.6 11.2C9 7.9 4.4 9 5.4 12.6c.8 2.9 4.6 2.7 6.2.6M12.4 11.2c2.6-3.3 7.2-2.2 6.2 1.4-.8 2.9-4.6 2.7-6.2.6" />
    </>
  ),
  kit: (
    <>
      <path d="M6.6 12.6 4.8 5.6l4.4 2.6M17.4 12.6l1.8-7-4.4 2.6" />
      <path d="M6.6 12.4c0-2.6 2.4-4.6 5.4-4.6s5.4 2 5.4 4.6c0 3.8-2.4 7.2-5.4 7.2s-5.4-3.4-5.4-7.2Z" />
      <path d="M12 14v1.6M14.6 11.4h.01M9.4 11.4h.01" />
    </>
  ),
  snail: (
    <>
      <path d="M13.6 15.4a4.6 4.6 0 1 0-3.4-7.7 4.6 4.6 0 0 0 3.4 7.7Z" />
      <path d="M13.6 12.4a1.9 1.9 0 1 0-1.4.9" />
      <path d="M3.4 17.6h13.2a2.8 2.8 0 0 0 2.8-2.6M9 9.6 7.6 6.2l2.6.6" />
    </>
  ),
  jelly: (
    <>
      <path d="M5.6 13.2a6.4 6.4 0 0 1 12.8 0Z" />
      <path d="M8.4 13.4c0 2.4.8 3.6.2 5.4M12 13.6v5.6M15.6 13.4c0 2.4-.8 3.6-.2 5.4" />
    </>
  ),
  bee: (
    <>
      <path d="M12 8.6a4.4 4.4 0 0 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z" />
      <path d="M9.2 10.6c-2.6-2.6-5.6-1.4-5 1.4.5 2.2 3.4 2.6 5.4 1M14.8 10.6c2.6-2.6 5.6-1.4 5 1.4-.5 2.2-3.4 2.6-5.4 1" />
      <path d="M8.6 11.4h6.8M8.6 14.6h6.8M9.8 8.8 8.6 6.4M14.2 8.8l1.2-2.4" />
    </>
  ),
  corvid: (
    <>
      <path d="M4.6 15.6c-.6-4.4 3.2-8 7.6-7.6l3.4 2.8-3.2.8c-.4 3.4-3 5.6-6.2 5.6-.9 0-1.4-.5-1.6-1.6Z" />
      <path d="M15.6 10.8c1-1 2.6-1.2 3.8-.6l1-2 .4 3.4c-.6 1.2-1.6 2-3 2.2M9.4 11.6h.01M8 18.6l4.4-2.4 4 2.4" />
    </>
  ),
  owl: (
    <>
      <path d="M6.4 9.2c0-2.6 2.5-4.6 5.6-4.6s5.6 2 5.6 4.6v3.4c0 3.4-2.5 5.8-5.6 5.8s-5.6-2.4-5.6-5.8Z" />
      <circle cx="9.6" cy="10.6" r="2.2" />
      <circle cx="14.4" cy="10.6" r="2.2" />
      <path d="m12 13.4 1.1 1.5-1.1 1.1-1.1-1.1ZM6.6 7.6 5.4 4.8l2.6 1M17.4 7.6l1.2-2.8-2.6 1" />
    </>
  ),
  turtle: (
    <>
      <path d="M4.4 15.6a7.6 7.6 0 0 1 15.2 0Z" />
      <path d="M12 8v7.6M8.2 9.4l2 6.2M15.8 9.4l-2 6.2M3.4 18.4l1.6-1.6M20.6 18.4l-1.6-1.6" />
      <path d="M19.6 15.6h1.8" />
    </>
  ),
  griffin: (
    <>
      <path d="M12 19.6V9.8" />
      <path d="M12 9.8C9.4 5.8 5.2 5.6 3.8 8.4c1.6 0 3.2.9 4.3 2.2M12 9.8c2.6-4 6.8-4.2 8.2-1.4-1.6 0-3.2.9-4.3 2.2" />
      <path d="M12 9.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" />
      <path d="m14.2 6.6 2.4.7-2.4 1.4M9 19.6h6l-1.4-2.4h-3.2Z" />
    </>
  ),
  unicorn: (
    <>
      <path d="M13.6 20.4v-3.2c0-1.4 1.6-2.6 1.6-4.8 0-2.4-1.8-4.4-4.4-4.4-1.3 0-2.5.5-3.3 1.4L5.4 12l2.8-6.6 1.6 3.4" />
      <path d="m10.6 9.4 2.2-4.8 1.8 2.6M8.2 20.4l1.2-3M15.4 20.4l-1-3M12 11.4h.01" />
    </>
  ),
  serpent: (
    <>
      <path d="M6.2 18.6c0-2 1.8-2.6 4-2.6s6.4.4 6.4-2.6-3.4-3-5.4-3-4.6.2-4.6-2.4 2-3.2 4-3.2" />
      <path d="M12.6 5.4a2 2 0 1 0 2.2 3.2M14.8 9.6l2.2-1.4-1.4-.8" />
    </>
  ),
  dragonet: (
    <>
      <path d="M9.4 20.4v-3c-2-1.2-3-3.2-3-5.8 0-3.4 2.6-6 6-6 2 0 3.8.8 5 2.2l-1.4 2.4c1 1 1.4 2.4 1.4 4 0 1.2-.4 2.2-1.1 3h-1.5v3.2" />
      <path d="m12.4 5.6-1.2-2.8 2.8 1.6M17.4 7.8l2.6-1.2-1.4 2.6M10.4 12.8h.01M15 12.8h.01" />
    </>
  ),
};

export function CreatureIcon({ pet, size = 22, className = "", ...rest }) {
  const art = CREATURES[pet];
  if (!art)
    return <CompanionMark size={size} className={className} {...rest} />;
  return (
    <Mark size={size} className={className} {...rest}>
      {art}
    </Mark>
  );
}

export const CREATURE_IDS = Object.keys(CREATURES);
