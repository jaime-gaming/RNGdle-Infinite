import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { freshStartEligible, FRESH_START_PRESTIGES } from "../progress.js";
import { formatEP } from "../roll-data.js";
import { useModalDialog } from "../use-modal-dialog.js";
import "../fresh-start.css";

// Once an account has three prestiges, the ladder has nothing left to show.
// The game says so once, then leaves a small "!" in the header for whenever
// the player feels like taking it up on the offer.
const FRESH_START_SEEN_KEY = "rng-infinite-fresh-start-seen-v1";

function seenFor(profileId) {
  try {
    return localStorage.getItem(FRESH_START_SEEN_KEY) === profileId;
  } catch {
    return false;
  }
}
function markSeen(profileId) {
  try {
    localStorage.setItem(FRESH_START_SEEN_KEY, profileId);
  } catch {}
}

export function FreshStartFlag({ progress, onOpen }) {
  if (!freshStartEligible(progress)) return null;
  return (
    <button
      className="fresh-start-flag"
      onClick={onOpen}
      aria-label="Start fresh? The game has a suggestion"
      title="Start fresh?"
    >
      <AlertCircle size={17} />
    </button>
  );
}

export default function FreshStartDialog({
  progress,
  open,
  onClose,
  onAction,
  notify,
  paused = false,
  onAutoOpen,
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const dialog = useModalDialog(open);
  const eligible = freshStartEligible(progress);
  const profileId = progress.profile?.id ?? "";
  // The one automatic appearance, per profile. Opening it again is the flag's job.
  useEffect(() => {
    if (!eligible || paused || open || seenFor(profileId)) return;
    markSeen(profileId);
    onAutoOpen?.();
  }, [eligible, paused, open, profileId, onAutoOpen]);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  if (!eligible) return null;
  const prestiges = progress.ultraRebirths ?? 0;
  const kept = (progress.owned ?? []).length;
  async function start() {
    if (pending) return;
    setPending(true);
    try {
      const result = await onAction({ type: "fresh-start" });
      if (result?.ok) {
        onClose();
        notify?.({
          kind: "reward",
          title: "Fresh start",
          text: "Welcome back to zero. Your auras are waiting in the wardrobe.",
        });
      } else
        notify?.({
          kind: "error",
          text: result?.message ?? "Nothing was reset.",
        });
    } finally {
      setPending(false);
    }
  }
  return createPortal(
    <dialog
      className="fresh-start-dialog"
      ref={dialog}
      aria-labelledby="fresh-start-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      {open && (
        <div className="fresh-start-card">
          <button
            className="fresh-start-close"
            aria-label="Close"
            disabled={pending}
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <span className="fresh-start-orbit" aria-hidden="true">
            <RotateCcw size={26} />
          </span>
          <h2 id="fresh-start-title">You have seen it all.</h2>
          <p>
            {(progress.rollbacks ?? 0) > 0
              ? `${progress.rollbacks} Rollback${progress.rollbacks === 1 ? "" : "s"}`
              : `${prestiges} prestiges`}
            , {formatEP(progress.totalEarned ?? 0)} EP earned. The ladder has no
            rung left to climb, and at this point the numbers only get bigger,
            not more interesting.
          </p>
          <p>
            Honestly? The fun part is the beginning. Start over and the first
            companion matters again.
          </p>
          <ul className="fresh-start-terms">
            <li>
              <strong>Kept:</strong> your profile and every aura you own
              {kept ? ` (${kept})` : ""}, including event ones.
            </li>
            <li>
              <strong>Gone:</strong> EP, companions, skills, upgrades, rebirths,
              prestiges, Rollback bonuses and history.
            </li>
            <li>A keepsake in your history remembers what this run reached.</li>
          </ul>
          {!confirming ? (
            <div className="fresh-start-actions">
              <button className="secondary-button" onClick={onClose} autoFocus>
                Keep playing
              </button>
              <button
                className="primary-button"
                onClick={() => setConfirming(true)}
              >
                Start from zero
              </button>
            </div>
          ) : (
            <div className="fresh-start-actions is-confirm">
              <p>
                Last chance. This cannot be undone, and the offer stays in the
                header if you want to think about it.
              </p>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Go back
              </button>
              <button
                className="primary-button is-danger"
                disabled={pending}
                onClick={start}
              >
                {pending ? "Resetting…" : "Yes, reset everything"}
              </button>
            </div>
          )}
          <small>
            Available after {FRESH_START_PRESTIGES} prestiges. Cosmetics never
            reset.
          </small>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
