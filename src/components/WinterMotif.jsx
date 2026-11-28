import React from "react";
import {
  BellMark,
  GiftMark,
  PineMark,
  SnowflakeMark,
  WinterStarMark,
} from "./game-icons.jsx";
export default function WinterMotif({ motif = "parcel", size = 42, ...props }) {
  const Icon = {
    tree: PineMark,
    parcel: GiftMark,
    bell: BellMark,
    lantern: WinterStarMark,
  }[motif];
  if (Icon)
    return (
      <span className={`winter-motif winter-motif-${motif}`} {...props}>
        <Icon size={size} />
      </span>
    );
  return (
    <span className="winter-motif winter-motif-cookie" {...props}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M36 9c-4 1-5 5-2 8 3 2 6 1 8 0 5 12-2 25-16 27C12 46 3 36 4 24 5 10 20 1 31 6Z"
          fill="#ad6b35"
          stroke="#f2cf91"
          strokeWidth="2"
        />
        <path
          d="m13 17 4 3m5-10 2 4m-9 18 5-1m10 4 1-5"
          stroke="#fff1cc"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="24" cy="23" r="2" fill="#542c21" />
        <circle cx="10" cy="25" r="2" fill="#542c21" />
        <circle cx="34" cy="25" r="2" fill="#542c21" />
      </svg>
    </span>
  );
}
