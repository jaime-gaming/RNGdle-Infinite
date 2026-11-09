import React from "react";
import "../paid-numbers.css";

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
