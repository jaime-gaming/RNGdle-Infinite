// The shop's own event notice: the button at the top of the shop, the
// explanation it opens, and the stamp card the sale day runs on.
//
// Everything here is presentation. The window, the discounts, the stamps and the
// limited skin are decided in black-friday.js and written by the reducer, so no
// component in this file can hand out a reward or change a price on its own.
import React, { useState } from "react";
import { Clock3, Palette, Percent, Sparkles, Tag, X } from "lucide-react";
import {
  BLACK_FRIDAY_SKIN,
  BLACK_FRIDAY_STAMPS,
  RNGWEEN_RESALE_PRICE,
  SALE_THEMES,
  blackFridayDayLabel,
  resaleMissing,
  stampFraction,
  stampsLeft,
} from "../black-friday.js";
import { formatEP } from "../roll-data.js";
import { waitText } from "../tasks.js";
import { useModalDialog } from "../use-modal-dialog.js";
import { useSaleStatus } from "../use-black-friday.js";
import NumberBox from "./NumberBox";
import "../black-friday.css";

// One line for the countdown, whichever side of the day it is read from.
function whenLine(status) {
  if (status.active)
    return `Live now · ends in ${waitText(status.endsInMs)} (UTC)`;
  return `${blackFridayDayLabel()} · starts in ${waitText(status.startsInMs)} (UTC)`;
}

// The stamp card: how full it is, and what it pays. It reads the same record the
// reducer writes, so it can never promise a stamp the save does not hold.
export function SaleStampCard({ record, previewTier = "rare" }) {
  const stamps = record?.stamps ?? 0;
  const earned = record?.skinEarned === true;
  const fraction = stampFraction(record);
  return (
    <div
      className={`sale-stamp-card ${earned ? "is-earned" : ""}`}
      data-testid="sale-stamp-card"
    >
      <span className="sale-stamp-icon" aria-hidden="true">
        <Tag size={16} />
      </span>
      <div className="sale-stamp-copy">
        <strong>
          {earned
            ? `${BLACK_FRIDAY_SKIN.name} unlocked`
            : `${stamps} of ${BLACK_FRIDAY_STAMPS} sale stamps`}
        </strong>
        <span>
          {earned
            ? "Paid by your stamps, kept forever. Equip it from Special & Limiteds."
            : `One stamp per purchase today · ${stampsLeft(record)} to go for the limited skin`}
        </span>
        <span
          className="sale-stamp-bar"
          role="img"
          aria-label={`${Math.round(fraction * 100)}% of the sale stamp card filled`}
        >
          <i style={{ width: `${fraction * 100}%` }} />
        </span>
      </div>
      <NumberBox
        value={earned ? "25/25" : "??????"}
        tier={previewTier}
        aura={earned ? BLACK_FRIDAY_SKIN.id : "none"}
        compact
        aria-hidden="true"
      />
    </div>
  );
}

// The button at the top of the shop and the explanation behind it.
export default function SaleEventNotice({
  progress,
  previewTier = "rare",
  onOpenSpecial,
  navigate,
}) {
  const status = useSaleStatus();
  const [open, setOpen] = useState(false);
  const dialog = useModalDialog(open);
  if (!status.shown) return null;
  const record = progress?.blackFriday ?? null;
  const missing = resaleMissing(progress?.owned ?? []);
  const stamps = record?.stamps ?? 0;
  const earned = record?.skinEarned === true;
  return (
    <>
      <button
        type="button"
        className={`sale-flag ${status.active ? "is-live" : "is-soon"}`}
        data-testid="sale-event-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="sale-flag-tag">
          <Percent size={13} aria-hidden="true" />
          Event
        </span>
        <span className="sale-flag-copy">
          <strong>Black Friday 2026</strong>
          <small>
            {status.active
              ? `Sale live · ${stamps}/${BLACK_FRIDAY_STAMPS} stamps · up to 50% off`
              : `One day of discounts and a limited skin · ${whenLine(status)}`}
          </small>
        </span>
        <span className="sale-flag-when" aria-hidden="true">
          <Clock3 size={13} />
          {status.active
            ? waitText(status.endsInMs)
            : waitText(status.startsInMs)}
        </span>
      </button>
      <dialog
        className="sale-dialog"
        ref={dialog}
        aria-labelledby="sale-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        data-testid="sale-event-dialog"
      >
        <button
          type="button"
          className="sale-dialog-close icon-button"
          aria-label="Close the event explanation"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <p className="eyebrow sale-eyebrow">
          <Tag size={13} aria-hidden="true" /> ONE DAY ONLY
        </p>
        <h2 id="sale-dialog-title">Black Friday 2026</h2>
        <p className="sale-when">
          {blackFridayDayLabel()}, 00:00 to 24:00 UTC ·{" "}
          {status.active
            ? `live now, ${waitText(status.endsInMs)} left`
            : `starts in ${waitText(status.startsInMs)}`}
        </p>

        <section className="sale-block">
          <h3>
            <Percent size={14} aria-hidden="true" /> The whole shop is cheaper
          </h3>
          <p>
            Every shelf drops for the day — pace, skills, companions, auras,
            offline and tools. Each product carries its own discount, from 20%
            to 50%, and the card shows the price it had before. Nothing else
            changes: odds, EP, ranks and timings are exactly the same.
          </p>
        </section>

        <section className="sale-block">
          <h3>
            <Tag size={14} aria-hidden="true" /> Stamps pay a limited skin
          </h3>
          <p>
            Every purchase made while the sale is on earns one sale stamp. Fill{" "}
            {BLACK_FRIDAY_STAMPS} stamps and {BLACK_FRIDAY_SKIN.name} is yours:
            matte black, one white tag, nothing else. It is a permanent aura, so
            a rebirth, a prestige, a Rollback or a fresh start can never take it
            away — and it is never sold.
          </p>
          {status.active && (
            <SaleStampCard record={record} previewTier={previewTier} />
          )}
          {!status.active && (
            <p className="sale-note">
              Stamps only count on the day itself. Purchases made before or
              after it earn nothing.
            </p>
          )}
        </section>

        <section className="sale-block">
          <h3>
            <Sparkles size={14} aria-hidden="true" /> The missed-looks counter
          </h3>
          <p>
            For the day only, the RNGween 2026 looks you never got come back on
            the counter, at {formatEP(RNGWEEN_RESALE_PRICE)} EP each. They are
            the same permanent cosmetics the event gave, and buying one writes
            the same receipt. When the day ends the counter closes and they go
            back to being unavailable.
          </p>
          {missing.length ? (
            <ul className="sale-missing">
              {missing.map((item) => (
                <li key={item.id}>
                  <span
                    className="aura-swatch"
                    aria-hidden="true"
                    style={{
                      "--swatch-a": item.swatch?.[0] ?? "#000",
                      "--swatch-b": item.swatch?.[1] ?? "#000",
                    }}
                  />
                  {item.name}
                  <small>
                    {status.active
                      ? `${formatEP(RNGWEEN_RESALE_PRICE)} EP`
                      : "not for sale"}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sale-note">
              You already hold every RNGween 2026 look — the counter has nothing
              left to offer you.
            </p>
          )}
          {onOpenSpecial && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setOpen(false);
                onOpenSpecial();
              }}
            >
              Open Special &amp; Limiteds
            </button>
          )}
        </section>

        <section className="sale-block">
          <h3>
            <Palette size={14} aria-hidden="true" /> Two looks for the day
          </h3>
          <p>
            While the sale is on, the Appearance menu offers two extra colour
            themes: {SALE_THEMES.map((entry) => entry.label).join(" and ")}.
            They leave the menu when the day ends, and the game returns to the
            theme you had before.
          </p>
        </section>

        <p className="sale-fine">
          The event is a shop and cosmetics event. It never touches the draw,
          the scoring tables, badge values or cooldowns, and it pays no EP.
          {earned ? ` ${BLACK_FRIDAY_SKIN.name} is already yours.` : ""}
        </p>
        {navigate && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setOpen(false);
              navigate("shop");
            }}
          >
            {status.active ? "Back to the sale" : "Back to the shop"}
          </button>
        )}
      </dialog>
    </>
  );
}
