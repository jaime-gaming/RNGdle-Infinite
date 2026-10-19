// CLEANUP Nov 4, 2026: delete this file with the Reaper gate and dialog.
import React, { useId } from "react";

// Keep the original silhouette, crescent scythe and emerald lantern. The
// portrait adds hand-written SVG pencil strokes, not a separate image asset.
export default function ReaperFigure({
  className = "",
  variant = "standard",
  speaking = false,
}) {
  const id = useId().replaceAll(":", "");
  const sketch = variant === "sketch";
  return (
    <svg
      className={`reaper-figure${sketch ? " reaper-figure-sketch" : ""}${speaking ? " is-speaking" : ""} ${className}`}
      viewBox="0 0 180 200"
      fill="none"
      aria-hidden="true"
      data-reaper-art="original-vector"
    >
      <defs>
        <linearGradient
          id={`reaper-cape-${id}`}
          x1="51"
          y1="41"
          x2="133"
          y2="176"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#645074" />
          <stop offset=".45" stopColor="#31263f" />
          <stop offset="1" stopColor="#141321" />
        </linearGradient>
        <linearGradient
          id={`reaper-bone-${id}`}
          x1="77"
          y1="64"
          x2="103"
          y2="99"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#faf0d6" />
          <stop offset="1" stopColor="#bcab91" />
        </linearGradient>
        <radialGradient id={`reaper-light-${id}`}>
          <stop stopColor="#9ae8b1" stopOpacity=".5" />
          <stop offset="1" stopColor="#73dcb7" stopOpacity="0" />
        </radialGradient>
        <pattern
          id={`reaper-hatch-${id}`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-28)"
        >
          <path d="M0 0v7" stroke="#d9c9de" strokeWidth=".7" opacity=".27" />
        </pattern>
      </defs>
      <circle
        className="reaper-orbit"
        cx="90"
        cy="97"
        r="70"
        stroke="currentColor"
        strokeDasharray="2 10"
      />
      <path
        className="reaper-orbit-arc"
        d="M37 44a72 72 0 0 1 105 8M25 128a73 73 0 0 0 101 32"
      />
      <ellipse className="reaper-shadow" cx="91" cy="185" rx="52" ry="5" />
      <path
        className="reaper-scythe"
        d="M143 34v148M142 38c-13-19-39-23-59-13 23-3 38 6 50 20l10-7Z"
      />
      <path
        className="reaper-steel-edge"
        d="M85 24c20-7 39-3 56 14m-1 18h6m-6 43h6m-6 60h6"
      />
      <path
        className="reaper-cloak"
        style={{ fill: `url(#reaper-cape-${id})` }}
        d="M89 39c-25 0-37 24-38 50l-12 80 24-7 15 14 12-9 16 9 20-10 14 2-13-80c-2-29-14-49-38-49Z"
      />
      <path
        className="reaper-cloak-grain"
        fill={`url(#reaper-hatch-${id})`}
        d="M62 54q-14 26-12 42l-10 69 18-8 15 12 14-7-10-38-15-70Zm45 18 10 19 9 74 11 2-13-79-17-16Z"
      />
      <path
        className="reaper-fold"
        d="m67 103-6 49M89 118v40M112 106l8 45M53 88c12-5 27-9 36-9 14 0 25 4 37 10"
      />
      <path
        className="reaper-cloak-seams"
        d="m55 101-8 50m18-16 8 24m32-34 6 35M68 52q19-14 38 7m-39 44 9 15 14 7 15-10 8-11"
      />
      <path
        className="reaper-hood"
        d="M88 48c-21 0-28 18-26 43 14-10 36-10 52 0 1-22-5-43-26-43Z"
      />
      <path
        className="reaper-hood-rim"
        d="M63 86c-1-20 6-34 25-35 18 0 24 15 24 35M65 88q23-14 47 0"
      />
      <path
        className="reaper-skull"
        style={{ fill: `url(#reaper-bone-${id})` }}
        d="M75 79c0-10 5-16 13-16s14 6 14 16c0 6-3 10-7 12v8H81v-8c-4-2-6-6-6-12Z"
      />
      <g className="reaper-face-details">
        <path d="M78 76q4-3 8 0v6q-5 2-8-2v-4Zm13 0q4-3 8 0v4q-3 4-8 2v-6Zm-5 10 2-4 3 4-5 1Z" />
        <path className="reaper-eye-light" d="M81 78h2m11 0h2" />
        <path
          className="reaper-teeth"
          d="M82 92h13M83 91v7m4-7v7m4-7v7m3-7v7M78 69l4 2m15-2-3 2"
        />
      </g>
      <path
        className="reaper-hand"
        d="m122 106 17 4m-15 2 15 4m-13 2 13 3m-1-13 8 2v14l-10-4"
      />
      <path
        className="reaper-hand-joints"
        d="m129 108 1 4m3-3 1 4m-3 2 1 4m3-2 1 4m-9-5 1 4"
      />
      <path
        className="reaper-hand"
        d="m59 110-17 3-2 10 11 4m-8-10 10-1m-9 7 10-2"
      />
      <path
        className="reaper-hand-joints"
        d="m45 113 1 4m4-5 1 5m-5 3 1 3m4-4 1 3"
      />
      <circle cx="92" cy="118" r="3" className="reaper-clasp" />
      <circle
        className="reaper-lantern-aureole"
        cx="45"
        cy="156"
        r="31"
        fill={`url(#reaper-light-${id})`}
      />
      <path className="reaper-lantern-chain" d="M45 128v13m-3-6h6" />
      <path
        className="reaper-lantern"
        d="m34 145 11-6 11 6v23l-11 6-11-6v-23Zm0 1h22m-22 20h22m-11-26v33"
      />
      <path
        className="reaper-flame"
        d="M41 160c-4-5 3-9 4-14 7 7 9 10 4 16-3 4-6 1-8-2Z"
      />
      <path className="reaper-lantern-shine" d="m37 148 1 11m14-11v11" />
      <path
        className="reaper-stars"
        d="m24 67 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm126 11 2-4 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"
      />
      {sketch && (
        <g className="reaper-pencil-strokes">
          <path d="M47 165 59 87q2-30 25-43m-3-3q25-7 41 27l18 99M42 169l18-6 17 15 13-8 16 8 22-11M137 32l-1 71m10 23-1 50M66 62l-9 8m10-1-10 9m67 57 9 10m-12-3 9 10m-12-3 11 11" />
          <path d="m59 144-9 13m18-9-9 14m17-18-10 18m52-16 9 17M104 48l8 10m-39-8-9 9M34 181h25m62 1h28" />
        </g>
      )}
    </svg>
  );
}
