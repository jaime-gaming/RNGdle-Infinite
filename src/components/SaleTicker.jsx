import React from "react";
import "../black-friday.css";

// The day's own news bar: one line at the very top of the game that says SALE
// from one end to the other, and nothing else. It is decoration with a single
// honest sentence behind it for a screen reader, and it stops moving for a
// player who asked for reduced motion.
const WORDS = Array.from({ length: 18 }, (_, index) => index);

export default function SaleTicker({ status }) {
  if (!status?.active) return null;
  const strip = (
    <>
      {WORDS.map((index) => (
        <span key={index} className="sale-ticker-word">
          SALE
          <i aria-hidden="true">•</i>
        </span>
      ))}
    </>
  );
  return (
    <div className="sale-ticker" data-testid="sale-ticker">
      <span className="sale-ticker-track" aria-hidden="true">
        {strip}
        {strip}
      </span>
      <p className="sale-ticker-say">
        Black Friday sale live today: every shelf is discounted, and every
        100,000 EP you spend earns a sale stamp.
      </p>
    </div>
  );
}
