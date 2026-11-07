// The shop's own event notice: the button at the top of the shop, the
// explanation it opens, and the stamp card the sale day runs on.
//
// Everything here is presentation. The window, the discounts, the stamps and the
// limited skin are decided in black-friday.js and written by the reducer, so no
// component in this file can hand out a reward or change a price on its own.
import React, { useEffect, useRef, useState } from "react";
import {
  Clock3,
  Palette,
  Percent,
  Sparkles,
  Tag,
  X,
  Zap,
  Gift,
  Eye,
  Ticket,
  ShoppingBag,
  Gauge,
  PawPrint,
  Star,
  ArrowUpRight,
} from "lucide-react";
import {
  BLACK_FRIDAY_SKIN,
  BLACK_FRIDAY_STAMPS,
  RNGWEEN_RESALE_PRICE,
  SALE_THEMES,
  blackFridayDayLabel,
  resaleMissing,
  stampFraction,
  stampsLeft,
  epToNextStamp,
  SALE_STAMP_EVERY,
} from "../black-friday.js";
import { formatEP } from "../roll-data.js";
import { waitText } from "../tasks.js";
import { useModalDialog } from "../use-modal-dialog.js";
import { useSaleStatus } from "../use-black-friday.js";
import NumberBox from "./NumberBox";
import { pathForSubpage } from "../router.js";
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
            : `Your EP adds up across the day: one stamp per ${formatEP(
                SALE_STAMP_EVERY,
              )} EP spent · ${
                epToNextStamp(record)
                  ? `${formatEP(epToNextStamp(record))} EP to the next · `
                  : ""
              }${stampsLeft(record)} to go for the limited skin`}
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

// Posters belong to the document, so they stay where they were as the page
// scrolls. Each one is a real link and also uses the app's normal navigation.
const SALE_ADS = [
  {
    title: "UP TO 50% OFF",
    note: "Every shelf",
    icon: Percent,
    shelf: "",
    art: "percent",
  },
  {
    title: "ONE DAY ONLY",
    note: "The sale counter",
    icon: Clock3,
    shelf: "black-friday",
    art: "clock",
  },
  {
    title: "100K EP = 1 STAMP",
    note: "Fill your card",
    icon: Ticket,
    shelf: "black-friday",
    art: "ticket",
  },
  {
    title: "BLACKOUT 2026",
    note: "25 stamps to unlock",
    icon: Star,
    shelf: "black-friday",
    art: "blackout",
  },
  {
    title: "FASTER REVEALS",
    note: "Explore pace",
    icon: Gauge,
    shelf: "pace",
    art: "pace",
  },
  {
    title: "POWER UP",
    note: "Explore skills",
    icon: Zap,
    shelf: "skills",
    art: "skills",
  },
  {
    title: "LOOKS FOR LESS",
    note: "Explore auras",
    icon: Eye,
    shelf: "auras",
    art: "auras",
  },
  {
    title: "FIND A FRIEND",
    note: "Explore companions",
    icon: PawPrint,
    shelf: "companions",
    art: "companions",
  },
  {
    title: "FROM 20% OFF",
    note: "Browse the shop",
    icon: ShoppingBag,
    shelf: "",
    art: "bag",
  },
  {
    title: "MISSED RNGWEEN?",
    note: "Looks back today",
    icon: Sparkles,
    shelf: "black-friday",
    art: "rngween",
  },
  {
    title: "10M EP EACH",
    note: "The missed-looks counter",
    icon: Tag,
    shelf: "black-friday",
    art: "price",
  },
  {
    title: "COLLECT THE CARD",
    note: "Every purchase adds up",
    icon: Gift,
    shelf: "black-friday",
    art: "gift",
  },
  {
    title: "YOUR NEXT LOOK",
    note: "Try an aura",
    icon: Eye,
    shelf: "auras",
    art: "auras",
  },
  {
    title: "THE SKILL STALL",
    note: "Three in stock",
    icon: Zap,
    shelf: "skills",
    art: "skills",
  },
  {
    title: "KEEP IT MOVING",
    note: "Explore tools",
    icon: Gauge,
    shelf: "tools",
    art: "pace",
  },
  {
    title: "SALE ENDS TODAY",
    note: "Shop the event",
    icon: Clock3,
    shelf: "black-friday",
    art: "clock",
  },
];

export function SaleSideAds({ status, onOpenShelf }) {
  if (!status?.active) return null;
  const rail = (ads, side) => (
    <aside
      className={`sale-ads sale-ads-${side}`}
      aria-label={`${side} Black Friday offers`}
    >
      {ads.map(({ title, note, icon: Icon, shelf, art }, index) => (
        <a
          className={`sale-ad sale-ad-${art}`}
          key={`${title}-${index}`}
          href={pathForSubpage("shop", shelf)}
          aria-label={`${title}: ${note}`}
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            )
              return;
            event.preventDefault();
            onOpenShelf(shelf);
          }}
        >
          <span className="sale-ad-kicker">
            BF / 26 <ArrowUpRight size={11} />
          </span>
          <div className="sale-ad-art" aria-hidden="true">
            {art === "auras" || art === "rngween" || art === "blackout" ? (
              <NumberBox
                value="777"
                tier="rare"
                aura={
                  art === "blackout"
                    ? "blackout-2026"
                    : art === "rngween"
                      ? "jack-o-glow"
                      : "aurora"
                }
                compact
                className="sale-ad-aura"
              />
            ) : (
              <Icon />
            )}
          </div>
          <b>{title}</b>
          <small>{note}</small>
          <span className="sale-ad-bottom" aria-hidden="true">
            ONE DAY ONLY · UTC
          </span>
        </a>
      ))}
    </aside>
  );
  return (
    <>
      {rail(SALE_ADS.slice(0, 8), "left")}
      {rail(SALE_ADS.slice(8), "right")}
    </>
  );
}

// A different outline for each milestone. The last is the rounded silhouette
// of Blackout's number box, rather than another generic stamp.
function stampShape(index) {
  const outlines = [
    "circle(48% at 50% 50%)",
    "ellipse(49% 40% at 50% 50%)",
    "polygon(50% 1%, 99% 50%, 50% 99%, 1% 50%)",
    "polygon(24% 3%, 76% 3%, 99% 50%, 76% 97%, 24% 97%, 1% 50%)",
    "polygon(50% 1%, 64% 31%, 98% 35%, 73% 59%, 80% 95%, 50% 77%, 20% 95%, 27% 59%, 2% 35%, 36% 31%)",
    "inset(4% 3% round 20px)",
    "polygon(4% 7%, 96% 7%, 96% 35%, 88% 50%, 96% 65%, 96% 93%, 4% 93%, 4% 65%, 12% 50%, 4% 35%)",
    "polygon(50% 2%, 97% 32%, 80% 96%, 20% 96%, 3% 32%)",
    "polygon(20% 3%, 80% 3%, 97% 20%, 97% 80%, 80% 97%, 20% 97%, 3% 80%, 3% 20%)",
    "polygon(2% 20%, 20% 20%, 20% 2%, 80% 2%, 80% 20%, 98% 20%, 98% 80%, 80% 80%, 80% 98%, 20% 98%, 20% 80%, 2% 80%)",
    "polygon(3% 5%, 97% 5%, 85% 50%, 97% 95%, 3% 95%, 15% 50%)",
    "polygon(50% 2%, 98% 22%, 91% 70%, 50% 98%, 9% 70%, 2% 22%)",
    "polygon(3% 10%, 82% 10%, 98% 50%, 82% 90%, 3% 90%, 18% 50%)",
    "polygon(3% 50%, 24% 5%, 76% 5%, 97% 50%, 76% 95%, 24% 95%, 35% 50%)",
    "polygon(5% 8%, 95% 8%, 95% 92%, 5% 92%, 15% 50%)",
    "polygon(2% 25%, 15% 25%, 15% 5%, 85% 5%, 85% 25%, 98% 25%, 98% 75%, 85% 75%, 85% 95%, 15% 95%, 15% 75%, 2% 75%)",
    "polygon(4% 16%, 50% 2%, 96% 16%, 85% 50%, 96% 84%, 50% 98%, 4% 84%, 15% 50%)",
    "polygon(5% 6%, 50% 18%, 95% 6%, 84% 50%, 95% 94%, 50% 82%, 5% 94%, 16% 50%)",
  ];
  if (index === 24) return "inset(4% 2% round 12px)";
  if (index < outlines.length) return outlines[index];
  const points = 6 + index - outlines.length;
  const vertices = Array.from({ length: points * 2 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const radius = i % 2 ? 0.72 : 0.98;
    return `${(50 + 49 * radius * Math.cos(angle)).toFixed(2)}% ${(50 + 49 * radius * Math.sin(angle)).toFixed(2)}%`;
  });
  return `polygon(${vertices.join(",")})`;
}

// The stamp card as an object: 25 holes, each a stamp of its own shape and its
// own milestone, filled with ink once the spend has paid for it.
function stampLabel(index) {
  const hundreds = index + 1;
  if (hundreds < 10) return `${hundreds * 100}K`;
  const millions = hundreds / 10;
  return `${millions.toFixed(1).replace(".0", "")}M`;
}

export function SaleStampBook({ record, profile }) {
  const stamps = record?.stamps ?? 0;
  const earned = record?.skinEarned === true;
  // A local presentation marker, scoped to the profile, never changes rewards.
  // Guest progress is session-only, so its marker is session-only too.
  const storageKey = `rng-sale-stamps-seen-2026:${profile?.id ?? "guest"}`;
  const bookRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [seen] = useState(() => {
    try {
      const storage = profile?.id ? localStorage : sessionStorage;
      return Math.min(
        stamps,
        Math.max(0, Number(storage.getItem(storageKey)) || 0),
      );
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    if (!bookRef.current) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(bookRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    try {
      const storage = profile?.id ? localStorage : sessionStorage;
      storage.setItem(
        storageKey,
        String(Math.min(BLACK_FRIDAY_STAMPS, stamps)),
      );
    } catch {
      /* The book still works when browser storage is unavailable. */
    }
  }, [stamps, storageKey, profile?.id, visible]);
  return (
    <div
      ref={bookRef}
      className="sale-stamp-book"
      data-testid="sale-stamp-book"
    >
      <div className="sale-stamp-book-head">
        <strong>
          {earned
            ? `${BLACK_FRIDAY_SKIN.name} unlocked`
            : `${stamps} of ${BLACK_FRIDAY_STAMPS} stamps`}
        </strong>
        <span>
          {earned
            ? "The card is full and the skin is yours forever."
            : `One stamp per ${formatEP(SALE_STAMP_EVERY)} EP spent · ${formatEP(
                epToNextStamp(record),
              )} EP to the next`}
        </span>
      </div>
      <ol className="sale-stamp-grid" aria-label="Sale stamps earned">
        {Array.from({ length: BLACK_FRIDAY_STAMPS }, (_, index) => (
          <li
            key={index}
            style={{
              "--stamp-index": index - seen,
              "--stamp-shape": stampShape(index),
            }}
            className={`sale-stamp ${index < stamps ? "is-filled" : ""} ${index >= seen && index < stamps ? "is-new" : ""} ${visible ? "is-imprinting" : ""} ${index === 24 ? "is-blackout" : ""}`}
            aria-label={`Stamp ${index + 1} of ${BLACK_FRIDAY_STAMPS}: ${
              index < stamps ? "earned" : "empty"
            }`}
          >
            <span className="sale-stamp-face" aria-hidden="true" />
            {index === 24 && index < stamps && (
              <NumberBox
                value="25"
                tier="rare"
                aura={BLACK_FRIDAY_SKIN.id}
                compact
                className="sale-stamp-aura"
                aria-hidden="true"
              />
            )}
            <span className="sale-stamp-label">
              {stampLabel(index)}
              <small> EP</small>
            </span>
          </li>
        ))}
      </ol>
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
        <span className="sale-flag-art" aria-hidden="true">
          <Percent size={24} />
          <i>2026</i>
        </span>
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
            Spending adds up across purchases: every{" "}
            {formatEP(SALE_STAMP_EVERY)} EP you spend while the sale is on pays
            one sale stamp, whatever the shelf — a {formatEP(21000)} EP tool and
            a {formatEP(169000)} EP aura together pay one and keep counting.
            Fill {BLACK_FRIDAY_STAMPS} stamps and {BLACK_FRIDAY_SKIN.name} is
            yours: an exclusive black aura with a red sale glow. It is a
            permanent aura, so a rebirth, a prestige, a Rollback or a fresh
            start can never take it away — and it is never sold.
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
