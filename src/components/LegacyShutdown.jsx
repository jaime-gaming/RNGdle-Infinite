import React, { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, Download, X } from "lucide-react";
import { GAME_URL } from "../site-links.js";
import { PROGRESS_KEY } from "../progress.js";
import { isLegacyMirrorBuild } from "../app-update.js";
import {
  legacyNow,
  legacyShutdownState,
  LEGACY_SHUTDOWN_LABEL,
} from "../legacy-shutdown.js";
import { useModalDialog } from "../use-modal-dialog.js";
import "../legacy-shutdown.css";

function useLegacyClock() {
  const [now, setNow] = useState(legacyNow);
  useEffect(() => {
    const tick = () => setNow(legacyNow());
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return legacyShutdownState(now);
}

export function LegacyInformation() {
  const [message, setMessage] = useState("");
  function download() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) {
        setMessage("No local save was found on this browser.");
        return;
      }
      const url = URL.createObjectURL(
        new Blob([raw], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "rngdle-legacy-save-backup.txt";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Backup downloaded. Keep it private; it contains your saved progress.",
      );
    } catch {
      setMessage(
        "This browser could not download the save. Keep its site data and check download permissions before trying again.",
      );
    }
  }
  return (
    <div className="legacy-information">
      <p className="eyebrow">LEGACY SHUTDOWN</p>
      <h2 id="legacy-shutdown-title">One home for RNGdle Infinite.</h2>
      <p>
        The GitHub Pages Legacy Version retires on{" "}
        <strong>{LEGACY_SHUTDOWN_LABEL}</strong>: November 30 at 23:00 UTC, or
        November 30 at 23:00 in the Canary Islands.
      </p>
      <ul>
        <li>Gameplay on this Legacy build stops at the deadline.</li>
        <li>
          Legacy status reporting, technical support and future updates end.
        </li>
        <li>
          The current game continues at{" "}
          <a href={`${GAME_URL}/`}>{GAME_URL.replace("https://", "")}</a>. This
          shutdown does not close that site or delete your account.
        </li>
      </ul>
      <h3>Keep your progress before moving</h3>
      <ol>
        <li>
          Before closing, sign in to your Cloud Account on Legacy and wait for a
          successful sync. Do not continue past a sync error.
        </li>
        <li>
          Open the current site and sign in to the same account. Check your
          profile and progress before clearing anything on Legacy.
        </li>
        <li>
          Local-only saves do not move automatically between domains. Keep a
          private backup and keep this browser's site data until you have
          verified your progress.
        </li>
      </ol>
      <p>
        The download below is an archival copy of this browser's local save, not
        an automatic import or a shareable profile card. There is no automatic
        cross-domain transfer. The closure page keeps this backup utility
        available, but Legacy gameplay and support do not continue.
      </p>
      <div className="legacy-actions">
        <a className="primary-button" href={`${GAME_URL}/`}>
          Open the current game <ArrowUpRight size={16} />
        </a>
        <button className="secondary-button" onClick={download}>
          <Download size={16} /> Download local backup
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <p className="legacy-fine">
        Already installed this site? Install or bookmark the current domain
        instead. Previously cached old builds cannot be remotely erased by this
        page. Do not share your backup or sign-in tokens.
      </p>
    </div>
  );
}

export function LegacyNotice() {
  const clock = useLegacyClock();
  const [open, setOpen] = useState(
    () => globalThis.location?.hash === "#legacy-shutdown",
  );
  const dialog = useModalDialog(open);
  return (
    <>
      <aside
        className="mirror-notice legacy-notice"
        aria-label="Legacy shutdown countdown"
      >
        <Clock3 size={18} aria-hidden="true" />
        <div>
          <strong>Legacy closes December 1 · 00:00 Madrid</strong>
          <span>
            {clock.closed
              ? "Legacy has closed"
              : `${clock.days} ${clock.days === 1 ? "day" : "days"} · ${clock.hours}h ${clock.minutes}m ${clock.seconds}s left`}{" "}
            · Gameplay, status, support and updates end.
          </span>
        </div>
        <p className="legacy-move-reminder">
          Your save will not move automatically. Sync your account and verify it
          on the current site before clearing Legacy.
        </p>
        <a href={`${GAME_URL}/`}>
          Current game <ArrowUpRight size={14} />
        </a>
        <button className="secondary-button" onClick={() => setOpen(true)}>
          Shutdown & moving your save
        </button>
      </aside>
      <dialog
        className="legacy-dialog"
        ref={dialog}
        aria-labelledby="legacy-shutdown-title"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <button
          className="icon-button legacy-close"
          aria-label="Close shutdown information"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <LegacyInformation />
      </dialog>
    </>
  );
}

export function LegacyGate({ children, mirror = isLegacyMirrorBuild() }) {
  return mirror ? <LegacyDeadline>{children}</LegacyDeadline> : children;
}
function LegacyDeadline({ children }) {
  const clock = useLegacyClock();
  return clock.closed ? (
    <main className="legacy-closed">
      <div className="legacy-closed-mark">
        RNGdle <span>LEGACY</span>
      </div>
      <p className="legacy-closed-status">This version is now closed</p>
      <LegacyInformation />
    </main>
  ) : (
    children
  );
}
