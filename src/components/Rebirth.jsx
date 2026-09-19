import React, { useEffect, useRef, useState } from "react";
import {
  BADGE_TOTAL,
  REBIRTH_VISIBLE_AT,
  discoveredCount,
  rebirthBlocker,
  rebirthOptionalProducts,
} from "../rebirth.js";
import { gameNow } from "../game-clock.js";
import "../rebirth.css";
export default function Rebirth({ progress, onAction, onDone }) {
  const count = discoveredCount(progress),
    visible = count >= REBIRTH_VISIBLE_AT;
  const [now, setNow] = useState(gameNow),
    [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef(null),
    busy = useRef(false);
  const blocker = rebirthBlocker(progress, now);
  useEffect(() => {
    if (!visible) return;
    setNow(gameNow());
    const timer = setInterval(() => setNow(gameNow()), 1000);
    return () => clearInterval(timer);
  }, [visible, progress.cooldownUntil]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  async function rebirth(e) {
    e.preventDefault();
    if (busy.current || confirmation !== "REBIRTH") return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onAction({
        type: "rebirth",
        expectedRebirths: progress.rebirths ?? 0,
      });
      if (result.ok) {
        setOpen(false);
        onDone();
      } else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (!visible) return null;
  return (
    <section className="rebirth-option" aria-label="Rebirth">
      <div>
        <strong>Rebirth</strong>
        <p>
          {count < BADGE_TOTAL
            ? `Discover all ${BADGE_TOTAL} badges to start again. ${BADGE_TOTAL - count} ${BADGE_TOTAL - count === 1 ? "badge" : "badges"} remaining — no aura or tool purchase is needed.`
            : blocker ||
              "Collection complete. Start a new cycle and record a rebirth."}
        </p>
      </div>
      <button
        className="secondary-button"
        disabled={!!blocker}
        onClick={() => {
          setError("");
          setConfirmation("");
          setOpen(true);
        }}
      >
        Rebirth
      </button>
      <dialog
        ref={dialog}
        className="shop-confirm rebirth-confirm"
        aria-labelledby="rebirth-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!pending) setOpen(false);
        }}
      >
        <form onSubmit={rebirth}>
          <h2 id="rebirth-title">Rebirth {(progress.rebirths ?? 0) + 1}?</h2>
          <p>
            This starts your collection and progression over. It cannot be
            undone.
          </p>
          <ul>
            <li>
              <strong>Reset:</strong> all EP, discovered badges, upgrades,
              tools, cosmetics, equipment, tracked goal and Flywheel charge.
            </li>
            <li>
              <strong>Keep:</strong> your profile, complete activity history and
              rebirth count.
            </li>
          </ul>
          <p>
            Odds and EP rewards stay the same. Past purchases must be earned
            again.
          </p>
          <p>
            Rebirth depends only on your badge collection. Auras and tools are
            cosmetic or convenience, so none of the{" "}
            {rebirthOptionalProducts.length} optional purchases are required to
            unlock it.
          </p>
          {!progress.profile && (
            <p>Guest rebirth progress is temporary until you sign up.</p>
          )}
          <label>
            Type REBIRTH to confirm
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {blocker && <p role="status">{blocker}</p>}
          <div className="purchase-actions">
            <button
              type="button"
              className="secondary-button"
              autoFocus
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel rebirth
            </button>
            <button
              type="submit"
              className="danger-button"
              disabled={pending || confirmation !== "REBIRTH" || !!blocker}
            >
              {pending ? "Saving…" : "Confirm rebirth"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
