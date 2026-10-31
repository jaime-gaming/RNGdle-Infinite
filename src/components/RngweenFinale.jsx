// CLEANUP Nov 4, 2026: Halloween's daily bonus and scheduled show.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Gift, Skull } from "lucide-react";
import {
  REAPER_CHAPTERS,
  REAPER_SHOW_END,
  REAPER_SHOW_START,
  reaperAct,
} from "../rngween-finale.js";
import ReaperFigure from "./ReaperFigure.jsx";
import { RNGWEEN_FINALE_SKIN, rngweenCalendar } from "../rngween.js";
import { useLiveEventClock } from "../use-live-clock.js";
import { useMotionPreference } from "../use-settings.jsx";
import { useTypewriter } from "../use-typewriter.js";
import "../rngween-finale.css";

function clock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

export default function RngweenFinale({ progress, now, onAction, openSignup }) {
  const live = useLiveEventClock(now, { verifiedOnly: true });
  const reducedMotion = useMotionPreference();
  const calendar = rngweenCalendar(live);
  const act = reaperAct(live);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const typed = useTypewriter(
    act?.line ?? "",
    !!act,
    reducedMotion,
    act?.id ?? "off",
    20,
  );
  const profileId = progress.profile?.id;
  const taken =
    progress.rngweenLimited?.finaleEarned === true ||
    progress.owned?.includes(RNGWEEN_FINALE_SKIN.id);
  const eclipse = act?.id === "eclipse";
  const attempted = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const action = useRef(onAction);
  action.current = onAction;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function deliver() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setDeliveryError("");
    try {
      const result = await action.current?.({ type: "claim-rngween-finale" });
      if (!result?.ok && mounted.current)
        setDeliveryError(
          result?.message || "The lantern could not be delivered.",
        );
    } catch (error) {
      if (mounted.current)
        setDeliveryError(
          error?.message || "The lantern could not be delivered.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  // One automatic attempt per profile per mount. The reducer checks a freshly
  // verified clock too; failures remain visible and can be retried explicitly.
  useEffect(() => {
    if (!eclipse) {
      attempted.current = null;
      return;
    }
    if (
      !profileId ||
      taken ||
      inFlight.current ||
      attempted.current === profileId
    )
      return;
    attempted.current = profileId;
    void deliver();
  }, [eclipse, profileId, taken, pending]);

  const wasShowing = useRef(false);
  if (act) wasShowing.current = true;
  else if (Number.isFinite(live)) wasShowing.current = false;
  if (!Number.isFinite(live) && wasShowing.current) {
    return (
      <aside className="reaper-clock-warning" role="status">
        The website clock cannot be verified. The Reaper's powers are
        unavailable until the connection returns; ordinary play can continue.
      </aside>
    );
  }
  if (!calendar.finaleActive) return null;

  const upcoming = live < REAPER_SHOW_START;
  return (
    <>
      {act &&
        createPortal(
          <div
            className={`reaper-atmosphere is-${act.id}${reducedMotion ? " is-still" : ""}`}
            aria-hidden="true"
          >
            <div className="reaper-atmosphere-haze" />
            <div className="reaper-atmosphere-moon" />
            <div className="reaper-atmosphere-fog" />
            <div className="reaper-atmosphere-embers">
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>,
          document.body,
        )}
      <aside
        className={`rngween-finale${act ? ` is-live is-${act.id}` : ""}${reducedMotion ? " is-still" : ""}`}
        aria-label="Halloween event"
        data-finale="rngween-2026"
      >
        {act ? (
          <section
            className="reaper-takeover"
            data-reaper-act={act.id}
            aria-label="The Reaper's scheduled show"
          >
            <div className="reaper-transmission">
              <div className="reaper-portrait-frame" aria-hidden="true">
                <span className="reaper-halo" />
                <ReaperFigure
                  className="reaper-takeover-portrait"
                  speaking={typed.typing}
                />
              </div>
              <div className="reaper-copy" key={act.id}>
                <div className="reaper-heading">
                  <span className="reaper-on-air">
                    <i /> THE REAPER
                  </span>
                  <span className="reaper-act">
                    {String(act.index + 1).padStart(2, "0")} / 06 · {act.name}
                  </span>
                </div>
                <p className="reaper-quote">
                  <span aria-hidden="true">“{typed.visible}”</span>
                  <span
                    className="reaper-screen-reader"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {act.line}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="reaper-toggle"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-label={
                  expanded ? "Hide event details" : "Show event details"
                }
              >
                <ChevronDown size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="reaper-status">
              <span
                className="reaper-decree"
                aria-label="Current decree, ordinary online rolls"
              >
                Best of {act.draws}
                {act.epMultiplier > 1
                  ? ` · ×${act.epMultiplier} banked EP`
                  : ""}
              </span>
              <span className="reaper-time">
                {act.index + 1 === act.total ? "SHOW ENDS" : "NEXT ACT"}{" "}
                <b>{clock(act.endsAt - live)}</b>
              </span>
            </div>
            <div
              className="reaper-timeline"
              aria-label={`Act ${act.index + 1} of ${act.total}; next change in ${clock(act.endsAt - live)}`}
            >
              {REAPER_CHAPTERS.map((chapter, index) => (
                <span
                  key={chapter.id}
                  className={`reaper-step${index === act.index ? " is-current" : ""}`}
                  aria-hidden="true"
                >
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(1, act.progress * act.total - index)) * 100}%`,
                    }}
                  />
                </span>
              ))}
            </div>
            {eclipse && (
              <div className="reaper-reward" role="status">
                <Gift size={13} aria-hidden="true" />
                {taken ? (
                  "Hollow Lantern unlocked · yours to keep"
                ) : !profileId ? (
                  <>
                    Create a profile to keep the Hollow Lantern.{" "}
                    <button type="button" onClick={openSignup}>
                      Create profile
                    </button>
                  </>
                ) : pending ? (
                  "Delivering the Hollow Lantern…"
                ) : deliveryError ? (
                  <>
                    {deliveryError}{" "}
                    <button
                      type="button"
                      onClick={deliver}
                      title={deliveryError}
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  "The Hollow Lantern is arriving…"
                )}
              </div>
            )}
            {expanded && (
              <div className="reaper-details">
                <p>
                  {act.effect} Draw skills, World and offline rolls stay
                  unchanged.
                </p>
                <p>
                  Oct 31 · 20:00–20:30 UTC · Hollow Lantern arrives during
                  Eclipse, 20:25–20:30 UTC.
                </p>
                <p>
                  Pumpkoins ×{calendar.pumpkoinMultiplier} throughout Halloween.
                </p>
              </div>
            )}
          </section>
        ) : (
          <div
            className="reaper-schedule"
            data-reaper-schedule={upcoming ? "upcoming" : "ended"}
          >
            <Skull size={16} aria-hidden="true" />
            <span className="reaper-schedule-copy">
              <strong>Halloween Event</strong>
              <span>
                {" "}
                · Pumpkoins ×{calendar.pumpkoinMultiplier} ·{" "}
                {upcoming
                  ? "The Reaper's Takeover, 20:00–20:30 UTC"
                  : "The Reaper has departed · the show is over"}
              </span>
            </span>
            <span className="reaper-schedule-countdown">
              {upcoming ? "BEGINS IN" : "HALLOWEEN ENDS"}{" "}
              {clock((upcoming ? REAPER_SHOW_START : calendar.endsAt) - live)}
            </span>
          </div>
        )}
      </aside>
    </>
  );
}
