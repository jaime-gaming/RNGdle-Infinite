import React, { useState } from "react";
import { Shirt, Check, ArrowRight } from "lucide-react";
import { shopProducts, productById } from "../shop-data.js";
import NumberBox from "./NumberBox";
import "../wardrobe.css";

const tiers = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "anomaly",
  "mythic",
  "godly",
];

// Equip any aura you already own, previewed on any rarity, without walking back
// to the shop. Equipping is free and cosmetic: it spends no EP and buys nothing.
export default function AuraWardrobe({ progress, onAction, navigate, notify }) {
  const [previewTier, setPreviewTier] = useState("rare");
  const [pending, setPending] = useState(false);
  const auras = shopProducts.filter(
    (item) => item.kind === "aura" && progress.owned.includes(item.id),
  );
  const equipped = progress.equipped ?? "none";
  const total = shopProducts.filter((item) => item.kind === "aura").length;

  async function equip(id) {
    if (pending || equipped === id) return;
    setPending(true);
    try {
      const result = await onAction({ type: "equip", id });
      notify?.(
        result.ok
          ? id === "none"
            ? "Original appearance restored. No EP spent."
            : `${productById.get(id).name} equipped. No EP spent.`
          : result.message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="wardrobe">
      <div className="wardrobe-head">
        <p className="wardrobe-count">
          <strong>
            {auras.length} / {total}
          </strong>{" "}
          auras owned
        </p>
        <label className="wardrobe-tier">
          Preview rarity
          <select
            aria-label="Wardrobe preview rarity"
            value={previewTier}
            onChange={(e) => setPreviewTier(e.target.value)}
          >
            {tiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      {auras.length ? (
        <>
          <ul className="wardrobe-grid">
            <li>
              <button
                type="button"
                className={`wardrobe-slot ${equipped === "none" ? "is-equipped" : ""}`}
                aria-pressed={equipped === "none"}
                disabled={pending}
                onClick={() => equip("none")}
              >
                <NumberBox value="??????" tier={previewTier} compact />
                <span className="wardrobe-name">
                  Original
                  {equipped === "none" && (
                    <Check size={13} aria-hidden="true" />
                  )}
                </span>
              </button>
            </li>
            {auras.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`wardrobe-slot ${equipped === item.id ? "is-equipped" : ""}`}
                  aria-pressed={equipped === item.id}
                  disabled={pending}
                  onClick={() => equip(item.id)}
                >
                  <NumberBox
                    value="??????"
                    tier={previewTier}
                    aura={item.id}
                    compact
                  />
                  <span className="wardrobe-name">
                    {item.name}
                    {equipped === item.id && (
                      <Check size={13} aria-hidden="true" />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="wardrobe-note">
            Equipping is free and purely cosmetic. Rarity colours, scores and
            odds are unchanged underneath.
          </p>
        </>
      ) : (
        <div className="wardrobe-empty">
          <Shirt size={22} aria-hidden="true" />
          <p>
            You do not own any auras yet. They are cosmetic only and never
            change a score.
          </p>
          <button className="secondary-button" onClick={() => navigate("shop")}>
            Browse auras <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
