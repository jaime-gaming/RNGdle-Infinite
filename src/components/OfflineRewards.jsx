import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BedDouble, Moon, Sparkles, X } from "lucide-react";
import { formatEP } from "../roll-data";
import { useModalDialog } from "../use-modal-dialog.js";
import "../offline.css";

// Full-screen on purpose: the roll view and its ads must not keep painting
// underneath the reward while committed offline rolls are still being credited.
export default function OfflineRewards({
  progress,
  status,
  onDismiss,
  onHistory,
}) {
  const [dismissing, setDismissing] = useState(false);
  // Dismissing a failure hides this message only; the batch is untouched.
  const [mutedError, setMutedError] = useState("");
  const report = progress.offline?.report;
  const batch = progress.offline?.batch;
  const failed = Boolean(status.error) && status.error !== mutedError;
  const eligible = Boolean(
    progress.profile && progress.owned.includes("offline-roller"),
  );
  const open = eligible && Boolean(report || batch || failed);
  const dialog = useModalDialog(open);

  if (!open) return null;

  const rolls = report?.rolls ?? 0;
  const total = batch?.numbers.length ?? 0;
  const done = batch?.index ?? 0;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 100;

  async function dismiss() {
    if (batch || dismissing) return;
    if (!report) {
      setMutedError(status.error);
      return;
    }
    setDismissing(true);
    try {
      const result = await onDismiss();
      if (!result?.ok) status.retry();
    } finally {
      setDismissing(false);
    }
  }

  async function explore() {
    await dismiss();
    onHistory?.();
  }

  return createPortal(
    <dialog
      className="offline-overlay"
      ref={dialog}
      aria-label="Offline rewards"
      data-screen="offline-rewards"
      onCancel={(event) => {
        event.preventDefault();
        void dismiss();
      }}
    >
      <div className="offline-aurora" aria-hidden="true">
        <span className="offline-star offline-star--1" />
        <span className="offline-star offline-star--2" />
        <span className="offline-star offline-star--3" />
        <span className="offline-star offline-star--4" />
        <span className="offline-star offline-star--5" />
      </div>
      <div className="offline-card">
        <span className="offline-symbol" aria-hidden="true">
          <Moon size={26} />
        </span>
        <p className="eyebrow">YOUR LUCK KEPT GOING</p>
        <h2 className="offline-title">
          {batch ? "Restoring your offline rolls…" : "Welcome back."}
        </h2>

        {batch && (
          <div className="offline-batch">
            <p role="status">
              {done} / {total} committed rolls saved. Your chosen numbers are
              retained if you reload.
            </p>
            <div
              className="offline-progress"
              role="progressbar"
              aria-label="Offline rolls restored"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {report && (
          <>
            <div className="offline-totals">
              <div className="offline-total">
                <span className="offline-total-label">Earned</span>
                <strong>+{formatEP(report.ep)} EP</strong>
              </div>
              <div className="offline-total">
                <span className="offline-total-label">Rolls</span>
                <strong>{formatEP(rolls)}</strong>
              </div>
              <div className="offline-total">
                <span className="offline-total-label">New badges</span>
                <strong>{formatEP(report.newBadges)}</strong>
              </div>
            </div>
            <p className="offline-copy">
              <Sparkles size={14} aria-hidden="true" /> {formatEP(rolls)}{" "}
              {rolls === 1 ? "roll" : "rolls"} already added to your wallet and
              collection. Every roll is in History.
            </p>
          </>
        )}

        {failed && (
          <p className="offline-error" role="alert">
            <span>{status.error}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={status.retry}
              disabled={status.busy}
            >
              Retry offline rewards
            </button>
          </p>
        )}

        <div className="offline-actions">
          {report && (
            <button
              type="button"
              className="primary-button"
              autoFocus
              onClick={explore}
            >
              Explore your rewards <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
          {!batch && (
            <button
              type="button"
              className="secondary-button"
              disabled={dismissing}
              onClick={dismiss}
            >
              <BedDouble size={15} aria-hidden="true" />
              {dismissing ? "Closing…" : "Keep playing"}
            </button>
          )}
        </div>
        {!batch && (
          <button
            className="offline-close icon-button"
            aria-label="Dismiss offline summary"
            disabled={dismissing}
            onClick={dismiss}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
