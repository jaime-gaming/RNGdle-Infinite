import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Infinity as InfinityIcon,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Unlock,
} from "lucide-react";
import {
  BADGE_TOTAL,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  REBIRTH_VISIBLE_AT,
  ULTRA_BONUS_PER_REBIRTH,
  discoveredCount,
  nextRebirthSkill,
  rebirthBlocker,
  rebirthRequirement,
  rebirthUnlocked,
  ultraRebirthAvailable,
  ultraRebirthBlocker,
} from "../rebirth.js";
import {
  rebirthSkill,
  skillById,
  skillEffectChips,
  skillEffectSummary,
} from "../skills.js";
import { gameNow } from "../game-clock.js";
import { Sparkles as SparkleMark } from "lucide-react";
import { LegendMark, InfinityMark } from "./game-icons.jsx";
import "../rebirth.css";

// The ladder, step by step: 50%, then +10 points per completed cycle until the
// whole collection is the requirement. An ultra-rebirth only appears once the
// last rung is done, and it is the only action that hands everything back.
//
// Nothing here renders before the ladder unlocks — the page, the header entry
// and the help page all stay silent, so rebirth is a discovery rather than a
// promise made too early.
function Reward({ step, earned, current }) {
  const skill = rebirthSkill(step);
  if (!skill) return null;
  return (
    <span className={`rebirth-reward ${earned ? "is-earned" : ""}`}>
      <span className="rebirth-reward-chip">{skillEffectChips(skill)[0]}</span>
      <span className="rebirth-reward-copy">
        <strong>{skill.name}</strong>
        <span>{skillEffectSummary(skill)}</span>
      </span>
      {earned ? (
        <Check size={14} aria-label="Unlocked" />
      ) : current ? (
        <ArrowRight size={14} aria-label="Unlocks with this rebirth" />
      ) : (
        <Lock size={13} aria-label="Not unlocked yet" />
      )}
    </span>
  );
}

export default function Rebirth({ progress, onAction, onDone, navigate }) {
  const count = discoveredCount(progress);
  const rebirths = progress.rebirths ?? 0;
  const ultras = progress.ultraRebirths ?? 0;
  const requirement = rebirthRequirement(rebirths);
  const ladderComplete = !requirement;
  const unlocked = rebirthUnlocked(progress);
  const [now, setNow] = useState(gameNow),
    [open, setOpen] = useState(null),
    [confirmation, setConfirmation] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef(null),
    busy = useRef(false);
  const blocker = unlocked ? rebirthBlocker(progress, now) : "";
  const ultraBlocker = ultraRebirthBlocker(progress, now);
  const ultraReady = ultraRebirthAvailable(progress, now);
  useEffect(() => {
    if (!unlocked) return;
    setNow(gameNow());
    const timer = setInterval(() => setNow(gameNow()), 1000);
    return () => clearInterval(timer);
  }, [unlocked, progress.cooldownUntil]);
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
  // Silence before the unlock: no counter, no locked panel, no "coming soon".
  if (!unlocked) return null;

  const target = requirement ? requirement.badges : BADGE_TOTAL;
  const remaining = Math.max(0, target - count);
  const percent = Math.min(
    100,
    Math.round((count / Math.max(1, target)) * 100),
  );
  const reward = nextRebirthSkill(rebirths);
  const ultraPercent = Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1));
  const keeps = [
    ["Wallet and every purchase", "EP, timing upgrades, tools and skill bays"],
    ["Companions", "including the one you have equipped"],
    ["Skills and their charge", "circles keep the charge they are holding"],
  ];
  const resets = [
    ["Badge collection", "rediscover them in the new cycle"],
    ["Activity history", "the feed starts empty"],
    ["Equipped aura", "cosmetics are re-equipped in the shop"],
  ];
  return (
    <section className="rebirth-page" aria-label="Rebirth">
      <div className="rebirth-hero">
        <div className="rebirth-hero-copy">
          <span className="eyebrow">
            {ladderComplete
              ? "LADDER COMPLETE"
              : `STEP ${rebirths + 1} OF ${REBIRTH_TOTAL}`}
          </span>
          <h2>
            {ladderComplete
              ? `Rebirth ${REBIRTH_TOTAL} of ${REBIRTH_TOTAL} done`
              : `Rebirth ${rebirths + 1}`}
          </h2>
          <p>
            A rebirth starts your badge collection over and keeps the rest of
            your account: wallet, upgrades, companions and skills all stay. The
            reward for each step is permanent.
          </p>
          <div className="rebirth-actions">
            {ladderComplete && (
              <button
                className="primary-button rebirth-ultra"
                disabled={!ultraReady}
                title={ultraBlocker || undefined}
                onClick={() => {
                  setError("");
                  setConfirmation("");
                  setOpen("ultra");
                }}
              >
                <InfinityIcon size={15} /> Ultra-rebirth
              </button>
            )}
            <button
              className="primary-button"
              disabled={!!blocker}
              onClick={() => {
                setError("");
                setConfirmation("");
                setOpen("rebirth");
              }}
            >
              <RotateCcw size={15} /> Rebirth
            </button>
            {blocker && (
              <span className="rebirth-blocker" role="status">
                {blocker}
              </span>
            )}
          </div>
        </div>
        <div className="rebirth-hero-progress">
          <div
            className="rebirth-gauge"
            style={{ "--fill": `${percent}%` }}
            role="img"
            aria-label={`${count} of ${target} badges discovered towards step ${requirement ? requirement.rebirth : "ultra"}`}
          >
            <span>{percent}%</span>
            <small>of this step</small>
          </div>
          <dl className="rebirth-figures">
            <div>
              <dt>Badges discovered</dt>
              <dd>
                {count} / {target}
              </dd>
            </div>
            <div>
              <dt>Still to find</dt>
              <dd>{remaining}</dd>
            </div>
            <div>
              <dt>Rebirths done</dt>
              <dd>
                {rebirths} / {REBIRTH_TOTAL}
              </dd>
            </div>
            <div>
              <dt>Permanent EP bonus</dt>
              <dd>
                {ultras > 0
                  ? `+${Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}%`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="rebirth-block" aria-labelledby="rebirth-ladder-title">
        <header>
          <h3 id="rebirth-ladder-title">
            <LegendMark size={16} /> The ladder
          </h3>
          <p>
            Each step asks for 10 points more of the collection, and each one
            hands over a skill that exists nowhere else. No purchase is ever
            required for a rebirth.
          </p>
        </header>
        <ol className="rebirth-ladder">
          {REBIRTH_STEPS.map((step, index) => {
            const state =
              index < rebirths
                ? "is-done"
                : index === rebirths
                  ? "is-current"
                  : "is-locked";
            const needed = Math.ceil(BADGE_TOTAL * step);
            const stepPercent = Math.min(
              100,
              Math.round((count / needed) * 100),
            );
            return (
              <li key={step} className={state}>
                <span className="rebirth-rung-mark">
                  {index < rebirths ? (
                    <Check size={13} />
                  ) : index === rebirths ? (
                    <ArrowRight size={13} />
                  ) : (
                    <Lock size={12} />
                  )}
                </span>
                <span className="rebirth-rung-head">
                  <span className="rebirth-rung-name">#{index + 1}</span>
                  <span className="rebirth-rung-percent">
                    {Math.round(step * 100)}% of the collection
                  </span>
                  <span className="rebirth-rung-badges">{needed} badges</span>
                </span>
                <span className="rebirth-rung-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${index < rebirths ? 100 : stepPercent}%`,
                    }}
                  />
                </span>
                <span className="rebirth-rung-skill">
                  <Reward
                    step={index + 1}
                    earned={index < rebirths}
                    current={index === rebirths}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="rebirth-columns">
        <section className="rebirth-block" aria-labelledby="rebirth-keep-title">
          <header>
            <h3 id="rebirth-keep-title">
              <ShieldCheck size={16} /> What a rebirth keeps
            </h3>
            <p>Everything except the collection and its bookkeeping.</p>
          </header>
          <ul className="rebirth-list is-keep">
            {keeps.map(([title, detail]) => (
              <li key={title}>
                <Check size={14} />
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section
          className="rebirth-block"
          aria-labelledby="rebirth-reset-title"
        >
          <header>
            <h3 id="rebirth-reset-title">
              <RotateCcw size={16} /> What it resets
            </h3>
            <p>Deliberately small, and the reason the ladder exists.</p>
          </header>
          <ul className="rebirth-list is-reset">
            {resets.map(([title, detail]) => (
              <li key={title}>
                <ArrowDown size={14} />
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rebirth-block" aria-labelledby="rebirth-ultra-title">
        <header>
          <h3 id="rebirth-ultra-title">
            <Sparkles size={16} /> After the ladder: ultra-rebirth
          </h3>
          <p>
            Finish all {REBIRTH_TOTAL} steps and you can start everything over,
            including upgrades and companions, for a bonus that never resets.
          </p>
        </header>
        <div className="rebirth-ultra-card">
          <div className="rebirth-ultra-figure">
            <InfinityMark size={30} />
            <strong>+{ULTRA_BONUS_PER_REBIRTH * 100}% EP</strong>
            <span>per ultra-rebirth, forever</span>
          </div>
          <ul className="rebirth-list">
            <li>
              <Check size={14} />
              <span>
                <strong>Stacks without limit</strong>
                <small>
                  {ultras > 0
                    ? `You are at +${Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% right now. The next one makes it +${ultraPercent}%.`
                    : `The first one is +${ULTRA_BONUS_PER_REBIRTH * 100}%, and every later one adds the same again.`}
                </small>
              </span>
            </li>
            <li>
              <Check size={14} />
              <span>
                <strong>Wallet only</strong>
                <small>
                  Exactly like a companion: it multiplies banked EP, never the
                  number, its tier, its badges or its rank.
                </small>
              </span>
            </li>
            <li>
              <Unlock size={14} />
              <span>
                <strong>Optional</strong>
                <small>
                  A completed ladder is a fine place to stop. The button only
                  appears when every badge is back in the collection.
                </small>
              </span>
            </li>
          </ul>
          {ladderComplete && (
            <p className="rebirth-ultra-state" role="status">
              {ultraReady
                ? `Ultra-rebirth ${ultras + 1} is ready: every badge is discovered.`
                : ultraBlocker}
            </p>
          )}
        </div>
      </section>

      {reward && (
        <p className="rebirth-footnote">
          <SparkleMark size={13} /> Rebirth {rebirths + 1} unlocks{" "}
          <strong>{reward.name}</strong> — {skillEffectSummary(reward)} It goes
          straight into your rack if a slot is free.
        </p>
      )}
      {ultras > 0 && (
        <p className="rebirth-ultra-note">
          Ultra-rebirths: <b>{ultras}</b> · permanent wallet bonus{" "}
          <b>+{Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% EP</b> added
          to every roll you bank.
        </p>
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
              {reward && (
                <p>
                  Reward: <strong>{reward.name}</strong> —{" "}
                  {skillEffectSummary(reward)}
                </p>
              )}
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
