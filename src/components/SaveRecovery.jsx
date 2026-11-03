import React, { useEffect, useState } from "react";
import { History } from "lucide-react";
import "../settings.css";

function listRecoveryCopies(vault) {
  try {
    return vault?.getCopies?.() ?? [];
  } catch {
    return [];
  }
}

function savedAt(timestamp) {
  if (!timestamp) return "Date unavailable";
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function recoveryStats(copy) {
  if (!copy?.valid || !copy.raw) return null;
  try {
    const save = JSON.parse(copy.raw);
    const history = Array.isArray(save.history) ? save.history : [];
    const format = (value) =>
      Number.isFinite(value) && value >= 0
        ? Math.trunc(value).toLocaleString()
        : "0";
    return [
      [
        "Profile",
        typeof save.profile?.username === "string" && save.profile.username
          ? save.profile.username
          : "Unnamed profile",
      ],
      ["Balance", `${format(save.balance)} EP`],
      ["Total EP earned", `${format(save.totalEarned)} EP`],
      [
        "Rolls in saved activity",
        history
          .filter((entry) => entry?.type === "roll")
          .length.toLocaleString(),
      ],
      ["Rebirths", format(save.rebirths)],
    ];
  } catch {
    return null;
  }
}

export default function SaveRecovery({ vault, notify }) {
  const [copies, setCopies] = useState(() => listRecoveryCopies(vault));
  const [selectedCopyId, setSelectedCopyId] = useState("");
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const refresh = () => setCopies(listRecoveryCopies(vault));
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [vault]);

  const selectedCopy =
    copies.find((copy) => copy.id === selectedCopyId) ?? null;
  const selectedStats = recoveryStats(selectedCopy);

  function restoreSelectedCopy() {
    setRestoring(true);
    let outcome;
    try {
      outcome = vault?.restoreCopy?.(selectedCopyId);
    } catch {
      outcome = {
        ok: false,
        message: "The selected save could not be restored.",
      };
    }
    setRestoring(false);
    setCopies(listRecoveryCopies(vault));
    notify?.(
      outcome?.ok
        ? {
            kind: "done",
            title: "Saved copy restored",
            text: `Restored ${outcome.source || "the selected save"} to this device.`,
          }
        : {
            kind: "error",
            text:
              outcome?.message ?? "The selected save could not be restored.",
          },
    );
  }

  return (
    <section className="settings-panel" aria-label="Restore save">
      <div className="settings-save" data-testid="settings-recovery">
        <p>
          Choose an earlier save from this device. You can check its progress
          before restoring it.
        </p>
        {copies.length ? (
          <div
            className="recovery-copy-list"
            role="group"
            aria-label="Saved copies on this device"
          >
            {copies.map((copy) => {
              const damaged = copy.corrupt || !copy.valid;
              const selected = copy.id === selectedCopyId;
              return (
                <button
                  key={copy.id}
                  type="button"
                  className={`recovery-copy-option${selected ? " is-selected" : ""}${damaged ? " is-damaged" : ""}`}
                  data-testid={`recovery-copy-${copy.id}`}
                  aria-pressed={selected}
                  disabled={damaged || restoring}
                  onClick={() => setSelectedCopyId(copy.id)}
                >
                  <span className="recovery-copy-heading">
                    <strong>{copy.label}</strong>
                    <span className="recovery-copy-status">
                      {damaged
                        ? "Unavailable · cannot restore"
                        : selected
                          ? "Selected"
                          : "Choose"}
                    </span>
                  </span>
                  <small>{savedAt(copy.at)}</small>
                  {copy.reason && damaged && (
                    <small className="recovery-copy-reason">
                      This saved copy cannot be opened.
                    </small>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="recovery-copy-empty">
            No earlier saved copies are available yet.
          </p>
        )}
        {selectedCopy?.valid && (
          <div
            className="recovery-copy-details"
            data-testid="settings-recovery-details"
          >
            <h3>Save details</h3>
            {selectedStats ? (
              <dl>
                {selectedStats.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>Details could not be read from this save.</p>
            )}
            <p className="recovery-copy-restore-note">
              Restoring replaces your current save on this device. The game
              tries to keep a copy of your current progress before replacing it.
            </p>
          </div>
        )}
        <button
          type="button"
          className="secondary-button"
          data-testid="settings-restore-selected-copy"
          disabled={!selectedCopy?.valid || restoring}
          onClick={restoreSelectedCopy}
        >
          <History size={14} aria-hidden="true" />{" "}
          {restoring ? "Restoring…" : "Restore selected save"}
        </button>
        <small>Unavailable copies are marked and cannot be restored.</small>
      </div>
    </section>
  );
}
