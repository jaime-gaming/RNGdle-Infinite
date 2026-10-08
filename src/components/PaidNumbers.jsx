import React from "react";
import "../paid-numbers.css";

// Every number a draw skill kept is paid. Stacked skills pay more than one, so
// each paid number gets its own card at full size, side by side with the rest.
// The cards carry each number's own EP and nothing adds them up on screen: the
// reveal never shows a total while the numbers are still being revealed.
export default function PaidNumbers({ items, className = "" }) {
  if (!items.length) return null;
  return (
    <ul className={`paid-numbers ${className}`.trim()}>
      {items.map((item) => (
        <li
          key={item.key}
          className={`paid-number tint-${item.tint} ${item.best ? "is-best" : ""}`}
        >
          {item.best && <span className="paid-number-tag">Best</span>}
          <span className="paid-number-skill">
            {item.skill || "Draw skill"}
          </span>
          <span className="paid-number-value">
            {item.number.toLocaleString("en-US")}
          </span>
          <span className="paid-number-ep">{item.ep}</span>
        </li>
      ))}
    </ul>
  );
}
