import React from "react";
import "../black-friday.css";

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
