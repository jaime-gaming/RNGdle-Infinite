import { WINTER_EXCLUSIVES } from "../winter-festival.js";
import React from "react";
import {
  BellMark,
  GiftMark,
  PineMark,
  SnowflakeMark,
  WinterStarMark,
} from "./game-icons.jsx";

// Winter art for the seven permanent RNGmas auras, in the RNGween style: a
// turning seal, corner filigree, a crest, two guardians and rising motes.
const ART = {
  ...Object.fromEntries(
    WINTER_EXCLUSIVES.map((aura) => [
      aura.id,
      {
        Mark:
          aura.winterArt === "bell"
            ? BellMark
            : aura.winterArt === "gift"
              ? GiftMark
              : aura.winterArt === "snow"
                ? SnowflakeMark
                : WinterStarMark,
        side: PineMark,
        label: aura.winterArt,
      },
    ]),
  ),
  "pass-snowglobe": { Mark: SnowflakeMark, side: PineMark, label: "snowglobe" },
  "pass-carillon": { Mark: BellMark, side: SnowflakeMark, label: "carillon" },
  "pass-polar-crown": {
    Mark: WinterStarMark,
    side: PineMark,
    label: "polar-crown",
  },
  "rngmas-frost": {
    Mark: SnowflakeMark,
    side: PineMark,
    label: "frost",
  },
  "rngmas-ember": {
    Mark: BellMark,
    side: GiftMark,
    label: "ember",
  },
  "rngmas-hollow": {
    Mark: SnowflakeMark,
    side: PineMark,
    label: "hollow",
  },
  "rngmas-golem": {
    Mark: GiftMark,
    side: BellMark,
    label: "golem",
  },
  "rngmas-newyear": {
    Mark: WinterStarMark,
    side: GiftMark,
    label: "newyear",
  },
  "rngmas-gingerbread": {
    Mark: GiftMark,
    side: BellMark,
    label: "gingerbread",
  },
  "rngmas-star": {
    Mark: WinterStarMark,
    side: WinterStarMark,
    label: "star",
  },
};

function SnowSeal() {
  return (
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
      <path d="M80 12v136M21.1 46l117.8 68M21.1 114l117.8-68" />
      <path d="m80 26-9-9m9 9 9-9M80 134l-9 9m9-9 9 9M33 55l-12-3m12 3-3-12M127 105l12 3m-12-3 3 12M33 105l-12 3m12-3-3 12M127 55l12-3m-12 3 3-12" />
      <circle cx="80" cy="80" r="7" />
    </svg>
  );
}

export default function RngmasAura({ aura }) {
  const art = ART[aura];
  if (!art) return null;
  const { Mark, side: SideMark, label } = art;
  return (
    <span
      className={`rngmas-aura aura-winter aura-${label}`}
      style={
        WINTER_EXCLUSIVES.some((item) => item.id === aura)
          ? {
              "--aura-primary": "var(--aura-b)",
              "--aura-secondary": "var(--aura-a)",
            }
          : undefined
      }
    >
      <span className="aura-atmosphere" />
      <SnowSeal />
      <svg
        className="aura-filigree"
        viewBox="0 0 220 100"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
      >
        <path d="M2 30V10q0-8 8-8h20M190 2h20q8 0 8 8v20M218 70v20q0 8-8 8h-20M30 98H10q-8 0-8-8V70" />
        <path d="m14 14 8 4 4 8M206 14l-8 4-4 8M206 86l-8-4-4-8M14 86l8-4 4-8" />
        <path d="M44 99q20-14 34 0M142 99q20-14 34 0" />
        <path d="M66 99v-6m0 0-5-5m5 5 5-5M154 99v-6m0 0-5-5m5 5 5-5" />
      </svg>
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
