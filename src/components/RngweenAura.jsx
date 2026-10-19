// KEEP after Nov 4, 2026: the four event auras and Hexbound stay owned forever;
// this art is permanent. Only the event that handed them out goes away.
import React from "react";
import {
  BatMark,
  BloodMoonMark,
  HexboundMark,
  PhantomMark,
  PumpkinMark,
  WitchfireMark,
} from "./game-icons.jsx";

const ART = {
  "jack-o-glow": { Mark: PumpkinMark, side: PumpkinMark, label: "lantern" },
  "phantom-veil": { Mark: PhantomMark, side: PhantomMark, label: "spectral" },
  witchfire: { Mark: WitchfireMark, side: WitchfireMark, label: "alchemy" },
  "blood-moon": { Mark: BloodMoonMark, side: BatMark, label: "eclipse" },
  hexbound: { Mark: HexboundMark, side: PhantomMark, label: "hexbound" },
};

// Permanent collectible art, shared by previews and live numbers;
// no calendar dependency, random sampling or change to the rarity/number itself.
export default function RngweenAura({ aura }) {
  const art = ART[aura];
  if (!art) return null;
  const { Mark, side: SideMark, label } = art;
  return (
    <span className={`rngween-aura aura-${label}`}>
      <span className="aura-atmosphere" />
      <svg
        className="aura-seal"
        viewBox="0 0 160 160"
        fill="none"
        stroke="currentColor"
      >
        <circle className="aura-seal-outer" cx="80" cy="80" r="71" />
        <circle
          cx="80"
          cy="80"
          r="62"
          strokeDasharray="1 8"
          strokeLinecap="round"
        />
        <path d="m80 4 4 8-4 8-4-8ZM80 140l4 8-4 8-4-8ZM4 80l8-4 8 4-8 4ZM140 80l8-4 8 4-8 4Z" />
        <path d="m34 34 7 1 1 7-7-1ZM118 118l7 1 1 7-7-1ZM34 126l1-7 7-1-1 7ZM118 42l1-7 7-1-1 7Z" />
      </svg>
      <svg
        className="aura-filigree"
        viewBox="0 0 220 100"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
      >
        <path d="M2 30V10q0-8 8-8h20M190 2h20q8 0 8 8v20M218 70v20q0 8-8 8h-20M30 98H10q-8 0-8-8V70" />
        <path d="m5 18 6-7 7-6M202 5l7 6 6 7M215 82l-6 7-7 6M18 95l-7-6-6-7" />
        <path d="M48 99q18-12 31 0M141 99q18-12 31 0" />
      </svg>
      {aura === "hexbound" && (
        <svg
          className="hexbound-crown"
          viewBox="0 0 200 120"
          fill="none"
          stroke="currentColor"
        >
          <path d="M22 30 42 42 56 12 78 36 100 4 122 36 144 12 158 42 178 30M22 88 42 76 56 106 78 82 100 114 122 82 144 106 158 76 178 88" />
          {[28, 56, 84, 116, 144, 172].map((x, i) => (
            <g key={x} transform={`translate(${x},${i % 2 ? 100 : 16})`}>
              <path d="m0-5 4 5-4 5-4-5ZM-6 0H6" />
            </g>
          ))}
        </svg>
      )}
      <span className="aura-crest">
        <Mark size={30} />
      </span>
      <span className="aura-guardian aura-guardian-left">
        <SideMark size={25} />
      </span>
      <span className="aura-guardian aura-guardian-right">
        <SideMark size={25} />
      </span>
      <span className="aura-orbit-dot" />
      <span className="aura-orbit-dot aura-orbit-dot-second" />
      <span className="aura-motes">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <i key={i} style={{ "--mote": i }} />
        ))}
      </span>
    </span>
  );
}
