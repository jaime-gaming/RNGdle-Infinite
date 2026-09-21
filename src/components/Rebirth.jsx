import React, { useEffect, useRef, useState } from "react";
import {
  BADGE_TOTAL,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  REBIRTH_VISIBLE_AT,
  ULTRA_BONUS_PER_REBIRTH,
  discoveredCount,
  rebirthBlocker,
  rebirthRequirement,
  ultraRebirthAvailable,
  ultraRebirthBlocker,
} from "../rebirth.js";
import { skillById } from "../skills.js";
import { gameNow } from "../game-clock.js";
import "../rebirth.css";

// The ladder, step by step: 50%, then +10 points per completed cycle until the
// whole collection is the requirement. An ultra-rebirth only appears once the
// last rung is done, and it is the only action that hands everything back.
export default function Rebirth({ progress, onAction, onDone }) {
  const count = discoveredCount(progress);
  const rebirths = progress.rebirths ?? 0;
  const ultras = progress.ultraRebirths ?? 0;
  const requirement = rebirthRequirement(rebirths);
  const ladderComplete = !requirement;
  // The icon appears at 30% and then stays, even after a rebirth empties the
  // collection again.
  const visible = count >= REBIRTH_VISIBLE_AT || rebirths > 0 || ultras > 0;
  const [now, setNow] = useState(gameNow),
    [open, setOpen] = useState(null),
    [confirmation, setConfirmation] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef(null),
    busy = useRef(false);
  const blocker = rebirthBlocker(progress, now);
  const ultraBlocker = ultraRebirthBlocker(progress, now);
  const ultraReady = ultraRebirthAvailable(progress, now);
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
  const word = open === "ultra" ? "ULTRA" : "REBIRTH";
  async function submit(event) {
    event.preventDefault();
    if (busy.current || confirmation !== word) return;
    const ultra = open === "ultra";
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onAction(
        ultra
          ? { type: "ultra-rebirth", expectedUltraRebirths: ultras }
          : { type: "rebirth", expectedRebirths: rebirths },
      );
      if (result.ok) {
        setOpen(null);
        const granted = result.granted
          ? skillById.get(result.granted)?.name
          : "";
        onDone(
          ultra
            ? `Ultra-rebirth ${ultras + 1}. Your permanent bonus is now +${Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1))}% EP.`
            : granted
              ? `Rebirth ${rebirths + 1} complete. ${granted} unlocked and equipped.`
              : `Rebirth ${rebirths + 1} complete. Your collection starts over.`,
        );
      } else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (!visible)
    return (
      <section
        className="rebirth-option rebirth-locked"
        aria-label="Rebirth"
      >
        <div>
          <strong>Rebirth {rebirths + 1}</strong>
          <p>
            The rebirth ladder appears once you have discovered 30% of the
            collection: {REBIRTH_VISIBLE_AT} of {BADGE_TOTAL} badges. You have{" "}
            {count} so far — keep rolling.
          </p>
        </div>
      </section>
    );
  return (
    <section className="rebirth-option" aria-label="Rebirth">
      <div>
        <strong>Rebirth {rebirths + 1}</strong>
        <p>
          {ladderComplete
            ? ultraReady
              ? `Ladder complete. An ultra-rebirth starts everything over for a permanent +${Math.round(ULTRA_BONUS_PER_REBIRTH * 100)}% EP and a mark on your profile.`
              : ultraBlocker
            : count < requirement.badges
              ? `Discover ${requirement.badges} badges (${requirement.percent}% of the collection) to rebirth. ${requirement.badges - count} to go — you keep your EP, upgrades, companions and skills.`
              : blocker ||
                "Ready. Start a new cycle: your EP, upgrades, companions and skills stay."}
        </p>
        {ultras > 0 && (
          <p className="rebirth-ultra-note">
            Ultra-rebirths: <b>{ultras}</b> · permanent wallet bonus{" "}
            <b>+{Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% EP</b>
          </p>
        )}
      </div>
      <div className="rebirth-actions">
        {ladderComplete && (
          <button
            className="secondary-button rebirth-ultra"
            disabled={!ultraReady}
            title={ultraBlocker || undefined}
            onClick={() => {
              setError("");
              setConfirmation("");
              setOpen("ultra");
            }}
          >
            Ultra-rebirth
          </button>
        )}
        <button
          className="secondary-button"
          disabled={!!blocker}
          onClick={() => {
            setError("");
            setConfirmation("");
            setOpen("rebirth");
          }}
        >
          Rebirth
        </button>
      </div>
      {visible && (
        <ol className="rebirth-ladder" aria-label="Rebirth ladder">
          {REBIRTH_STEPS.map((step, index) => (
            <li
              key={step}
              className={
                index < rebirths
                  ? "is-done"
                  : index === rebirths
                    ? "is-current"
                    : ""
              }
              aria-current={index === rebirths ? "step" : undefined}
            >
              <span className="rebirth-rung">#{index + 1}</span>
              <span className="rebirth-rung-percent">
                {Math.round(step * 100)}%
              </span>
              <span className="rebirth-rung-badges">
                {Math.ceil(BADGE_TOTAL * step)} badges
              </span>
            </li>
          ))}
        </ol>
      )}
      <dialog
        ref={dialog}
        className="shop-confirm rebirth-confirm"
        aria-labelledby="rebirth-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) setOpen(null);
        }}
      >
        <form onSubmit={submit}>
          <h2 id="rebirth-title">
            {open === "ultra"
              ? `Ultra-rebirth ${ultras + 1}?`
              : `Rebirth ${rebirths + 1}?`}
          </h2>
          {open === "ultra" ? (
            <>
              <p>
                The last rebirth is a full reset. Everything starts over, and
                you get something permanent in return.
              </p>
              <ul>
                <li>
                  <strong>Reset:</strong> all EP, discovered badges, upgrades,
                  companions, skills, cosmetics, the tracked goal and your{" "}
                  {REBIRTH_TOTAL} rebirths.
                </li>
                <li>
                  <strong>Keep:</strong> your profile, your ultra-rebirth count
                  and the permanent bonus.
                </li>
              </ul>
              <p>
                Permanent bonus after this one:{" "}
                <strong>
                  +{Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1))}%
                  EP
                </strong>{" "}
                on every banked roll, forever. The next ladder starts again at
                50%.
              </p>
            </>
          ) : (
            <>
              <p>
                This starts your badge collection over. Everything you earned
                besides the collection stays with you.
              </p>
              <ul>
                <li>
                  <strong>Reset:</strong> discovered badges, equipped auras and
                  the activity history.
                </li>
                <li>
                  <strong>Keep:</strong> your EP, every upgrade, your
                  companions, your skills and their charge, your profile and
                  your rebirth count.
                </li>
              </ul>
              <p>
                Odds and EP rewards stay the same. The next rung of the ladder
                asks for 10 points more.
              </p>
            </>
          )}
          {!progress.profile && (
            <p>
              Guest progress is never saved, so this resets nothing permanent.
            </p>
          )}
          <label>
            Type {word} to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {open === "ultra"
            ? ultraBlocker && <p role="status">{ultraBlocker}</p>
            : blocker && <p role="status">{blocker}</p>}
          <div className="purchase-actions">
            <button
              type="button"
              className="secondary-button"
              autoFocus
              disabled={pending}
              onClick={() => setOpen(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="danger-button"
              disabled={
                pending ||
                confirmation !== word ||
                !!(open === "ultra" ? ultraBlocker : blocker)
              }
            >
              {pending
                ? "Saving…"
                : open === "ultra"
                  ? "Confirm ultra-rebirth"
                  : "Confirm rebirth"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
