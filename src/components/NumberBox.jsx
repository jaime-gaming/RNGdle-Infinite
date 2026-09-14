import React from "react";
import "../number-box.css";
import "../number-box-palettes.css";

const tiers = new Set([
  "neutral",
  "trash",
  "common",
  "uncommon",
  "rare",
  "epic",
  "anomaly",
  "mythic",
]);
const cosmetics = new Set(["starfall", "aurora", "orbit"]);
// Fixed decorative positions keep previews and live boxes consistent. No game RNG.
const stars = [
  [8, 20, 8],
  [85, 17, 11],
  [22, 78, 6],
  [92, 68, 7],
  [66, 85, 9],
  [42, 12, 5],
];

export default function NumberBox({
  as: Tag = "div",
  value,
  children,
  tier = "neutral",
  aura = "none",
  compact = false,
  className = "",
  style,
  ...props
}) {
  const rarity = tiers.has(tier) ? tier : "neutral";
  const cosmetic = cosmetics.has(aura) ? aura : "none";
  const shimmer = !["neutral", "trash", "common"].includes(rarity);
  const length = String(value ?? "??????").length;
  const fontSize = compact
    ? 24
    : length <= 3
      ? 72
      : length === 4
        ? 60
        : length === 5
          ? 48
          : 36;
  return (
    <Tag
      {...props}
      className={`number-box ${compact ? "number-box-compact" : ""} ${className}`}
      data-tier={rarity}
      data-cosmetic={cosmetic}
      style={{ "--box-font": `${fontSize}px`, ...style }}
    >
      <span className="box-gloss" aria-hidden="true" />
      {shimmer && <span className="box-shimmer" aria-hidden="true" />}
      {cosmetic !== "none" && (
        <span className="box-cosmetic" aria-hidden="true">
          <span className="box-halo" />
          <span className="box-ribbon" />
          <span className="box-comet" />
          <span className="box-particles">
            {stars.map(([x, y, size], i) => (
              <i
                key={i}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: size,
                  height: size,
                  animationDelay: `-${i * 0.63}s`,
                }}
              />
            ))}
          </span>
        </span>
      )}
      <span className="number-box-content">{children ?? value}</span>
    </Tag>
  );
}
