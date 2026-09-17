import React, { useState } from "react";
import { Moon, ArrowRight, X } from "lucide-react";
import { formatEP } from "../roll-data";
import "../offline.css";
export default function OfflineRewards({
  progress,
  status,
  onDismiss,
  onHistory,
}) {
  const [dismissing, setDismissing] = useState(false);
  const report = progress.offline?.report,
    batch = progress.offline?.batch;
  if (!progress.profile || !progress.owned.includes("offline-roller"))
    return null;
  if (!report && !batch && !status.error) return null;
  return (
    <section className="offline-rewards" aria-label="Offline rewards">
      <div className="offline-symbol">
        <Moon size={24} />
      </div>
      <div className="offline-content">
        <p className="eyebrow">YOUR LUCK KEPT GOING</p>
        <h2>{batch ? "Restoring your offline rolls…" : "Welcome back."}</h2>
        {batch && (
          <p role="status">
            {batch.index} / {batch.numbers.length} committed rolls saved. Your
            chosen numbers are retained if you reload.
          </p>
        )}
        {report && (
          <>
            <div className="offline-totals">
              <strong>+{formatEP(report.ep)} EP</strong>
              <span>
                {report.rolls} rolls · {report.newBadges} new badges
              </span>
            </div>
            <p>
              Already added to your wallet and collection. Every roll is in
              History.
            </p>
            <button className="offline-history" onClick={onHistory}>
              Explore your rewards <ArrowRight size={14} />
            </button>
          </>
        )}
        {status.error && (
          <p className="offline-error" role="alert">
            {status.error}{" "}
            <button onClick={status.retry} disabled={status.busy}>
              Retry offline rewards
            </button>
          </p>
        )}
      </div>
      {report && !batch && (
        <button
          className="icon-button"
          aria-label="Dismiss offline summary"
          disabled={dismissing}
          onClick={async () => {
            setDismissing(true);
            try {
              const result = await onDismiss();
              if (!result.ok) status.retry();
            } finally {
              setDismissing(false);
            }
          }}
        >
          <X size={17} />
        </button>
      )}
    </section>
  );
}
