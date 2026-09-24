import React from "react";

// Hand-drawn game marks.
//
// The interface used stock emoji artwork for companions and for a few call to
// actions, which reads as clip art next to the rest of the interface. These are
// original line icons instead: one 24×24 grid, one stroke weight (inherited from
// the global `svg` rule), round caps and joins, and no filled areas, so a
// companion, a badge or a shelf looks like part of the same product.
function Mark({ children, size = 20, className = "", title, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
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
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <circle cx="9" cy="9.4" r="1.25" />
    <circle cx="15" cy="14.6" r="1.25" />
    <path d="M14.6 9.4h.01M9.4 14.6h.01" />
  </Mark>
);

export const BadgeMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="9.5" r="5.5" />
    <path d="M9.2 14.3 8 21l4-2.2L16 21l-1.2-6.7" />
    <path d="m12 7 1 2.1 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2L8.8 9.4l2.2-.3Z" />
  </Mark>
);

export const SkillMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.2 19 7.3v9.4l-7 4.1-7-4.1V7.3Z" />
    <path d="M12.6 8.4 9.9 12.6h3.4l-2.5 3.6" />
  </Mark>
);

export const AuraMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M4.6 8.6c1.4-2.3 3.9-3.9 6.9-4.3M19.4 15.4c-1.4 2.3-3.9 3.9-6.9 4.3" />
    <path d="M5.2 15.6A8.4 8.4 0 0 1 4 12M18.8 8.4A8.4 8.4 0 0 1 20 12" />
  </Mark>
);

export const CompanionMark = (props) => (
  <Mark {...props}>
    <path d="M12 20c-4.2 0-7.5-1.6-7.5-4.6 0-2.3 2-3.9 4.6-4.6l1.5-3.5A2.6 2.6 0 0 1 13.2 6c1.6 0 2.7 1.1 2.9 2.4l.7 2.4c1.9.6 3.2 1.9 3.2 3.9 0 3-3.8 5.3-8 5.3Z" />
    <path d="M9.6 8.2 8 4.5m8.8 6.4 2.6-1.6M15.5 9.5h.01" />
  </Mark>
);

export const WalletMark = (props) => (
  <Mark {...props}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10.5h18M16 14.6h1.6" />
  </Mark>
);

export const PaceMark = (props) => (
  <Mark {...props}>
    <path d="M4.4 17a9 9 0 1 1 15.2 0" />
    <path d="m12 13.6 4.2-4.4" />
    <circle cx="12" cy="14.6" r="1.4" />
  </Mark>
);

export const VaultMark = (props) => (
  <Mark {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="3" />
    <circle cx="11.5" cy="12" r="3.6" />
    <path d="M11.5 8.4V6.8M11.5 17.2v-1.6M17.5 12h1.6" />
  </Mark>
);

export const LensMark = (props) => (
  <Mark {...props}>
    <circle cx="10.6" cy="10.6" r="6.1" />
    <path d="m15.2 15.2 4.3 4.3M8.4 8.6h4M8.4 11.4h2.6" />
  </Mark>
);

export const AutomationMark = (props) => (
  <Mark {...props}>
    <path d="M4.6 10.2A7.6 7.6 0 0 1 18 7.6M19.4 13.8A7.6 7.6 0 0 1 6 16.4" />
    <path d="M4.2 5.4v4.8h4.8M19.8 18.6v-4.8h-4.8" />
  </Mark>
);

export const CoreMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.4 19.2 7.6v8.8L12 20.6 4.8 16.4V7.6Z" />
    <path d="M10 10.4c-1.5 1.7-1.4 4.4 2 4.5 2.6.1 3.3-1.1 3.6-1.9M14 13.6c1.5-1.7 1.4-4.4-2-4.5-2.6-.1-3.3 1.1-3.6 1.9" />
  </Mark>
);

export const OfflineMark = (props) => (
  <Mark {...props}>
    <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7Z" />
    <path d="M15.4 7.6h4.2M17.5 5.5v4.2" />
  </Mark>
);

export const StreakMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.5c3.4 3.4 5.6 5.9 5.6 9.2A5.6 5.6 0 0 1 12 18.3a5.6 5.6 0 0 1-5.6-5.6c0-1.9.7-3.3 1.9-4.6" />
    <path d="M12 18.3c-1.4-1.7-1.6-3.4-.9-4.7.6-1.2 1.9-1.9 2.4-3.5" />
  </Mark>
);

export const TimerMark = (props) => (
  <Mark {...props}>
    <circle cx="12" cy="13" r="7.4" />
    <path d="M12 9.4V13l2.6 1.8M9.4 3.6h5.2" />
  </Mark>
);

export const InfinityMark = (props) => (
  <Mark {...props}>
    <path d="M8.4 8.6c-2.4 0-4.4 1.5-4.4 3.4s2 3.4 4.4 3.4c2.2 0 3.6-1.7 5.6-3.4-2-1.7-3.4-3.4-5.6-3.4Z" />
    <path d="M15.6 15.4c2.4 0 4.4-1.5 4.4-3.4s-2-3.4-4.4-3.4c-2.2 0-3.6 1.7-5.6 3.4 2 1.7 3.4 3.4 5.6 3.4Z" />
  </Mark>
);

export const LegendMark = (props) => (
  <Mark {...props}>
    <path d="M12 3.6 14.4 9l5.8.5-4.4 3.8 1.3 5.7L12 16l-5.1 2.9 1.3-5.7L3.8 9.5 9.6 9Z" />
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
