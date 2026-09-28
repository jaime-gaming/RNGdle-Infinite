import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Coins,
  History,
  Infinity as InfinityIcon,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Unlock,
  Wallet,
} from "lucide-react";
import {
  BADGE_TOTAL,
  REBIRTH_BONUS_PER_REBIRTH,
  REBIRTH_STARTER_EP,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  REBIRTH_VISIBLE_AT,
  ULTRA_BONUS_PER_REBIRTH,
  ULTRA_STARTER_EP,
  cycleStarterEp,
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
import { productById } from "../shop-data.js";
import { PETS } from "../pets.js";
import { cycleStats } from "../profile-stats.js";
import { formatEP, formatEPCompact } from "../roll-data.js";
import { gameNow } from "../game-clock.js";
import { LegendMark, InfinityMark } from "./game-icons.jsx";
import "../rebirth.css";

// The ladder, step by step: 50%, then +10 points per completed cycle until the
// whole collection is the requirement. An ultra-rebirth only appears once the
// last rung is done, and it is the only action that pays more than a rung.
//
// Nothing here renders before the ladder unlocks — the page, the header entry
// and the help page all stay silent, so rebirth is a discovery rather than a
// promise made too early.
function Reward({ step, earned, current }) {
  const skill = rebirthSkill(step);
  if (!skill) return null;
  const bonus = Math.round(REBIRTH_BONUS_PER_REBIRTH * 100);
  return (
    <span className={`rebirth-reward ${earned ? "is-earned" : ""}`}>
      <span className="rebirth-reward-chip">
        {skillEffectChips(skill)[0]} · +{bonus}% EP forever
      </span>
      <span className="rebirth-reward-copy">
        <strong>{skill.name}</strong>
        <span>{skillEffectSummary(skill)}</span>
      </span>
      <span className="rebirth-reward-starter">
        <Wallet size={12} aria-hidden="true" />
        {formatEPCompact(REBIRTH_STARTER_EP * step)} EP to start
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

function when(at) {
  if (!at) return "—";
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  const target = requirement ? requirement.badges : BADGE_TOTAL;
  const remaining = Math.max(0, target - count);
  const percent = Math.min(
    100,
    Math.round((count / Math.max(1, target)) * 100),
  );
  const reward = nextRebirthSkill(rebirths);
  const ultraPercent = Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1));
  const bonusNow = Math.round(
    REBIRTH_BONUS_PER_REBIRTH * 100 * rebirths +
      ULTRA_BONUS_PER_REBIRTH * 100 * ultras,
  );
  // What this exact account would hand back and what it would be paid for it,
  // read from the save rather than described in general terms.
  const cycle = cycleStats(progress);
  const owned = progress.owned ?? [];
  const ownedValue = owned.reduce(
    (sum, id) => sum + (productById.get(id)?.price ?? 0),
    0,
  );
  const pets = (progress.pets ?? []).length;
  const keptSkills = (progress.skills ?? []).filter(
    (id) => skillById.get(id)?.source !== "shop",
  ).length;
  const starter = cycleStarterEp(rebirths + 1, ultras);
  const ultraStarter = cycleStarterEp(rebirths, ultras + 1);
  const starterGain = ladderComplete ? ultraStarter - starter : starter;
  const keeps = [
    ["Activity history", "every roll, unlock and purchase, cycle after cycle"],
    ["Rebirth ladder", "your rebirths, their skills and the +2% EP each"],
    ["Ultra-rebirth bonus", "+10% EP per ultra-rebirth, forever"],
    ["Profile and all-time EP", "your account's story is never rewritten"],
  ];
  const resets = [
    ["Badge collection", "rediscover it in the new cycle"],
    ["Everything you bought", "upgrades, auras, tools and shop skills"],
    ["Companions", "found or bought, they start over too"],
    ["Wallet EP", "the balance restarts at the ladder's starting sum"],
  ];
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
            ? `Ultra-rebirth ${ultras + 1}. Your permanent bonus is now +${Math.round(
                REBIRTH_BONUS_PER_REBIRTH * 100 * rebirths +
                  ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1),
              )}% EP, and you start with ${formatEP(ultraStarter)} EP.`
            : granted
              ? `Rebirth ${rebirths + 1} complete: ${granted} unlocked, +${Math.round(
                  REBIRTH_BONUS_PER_REBIRTH * 100,
                )}% EP forever and ${formatEP(starter)} EP to start.`
              : `Rebirth ${rebirths + 1} complete: +${Math.round(
                  REBIRTH_BONUS_PER_REBIRTH * 100,
                )}% EP forever and ${formatEP(starter)} EP to start.`,
        );
      } else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  // Silence before the unlock: no counter, no locked panel, no "coming soon".
  if (!unlocked) return null;

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
            The collection and everything you bought start over — the wallet,
            the upgrades, the companions. Your history, your rebirths and every
            permanent bonus stay, and each rung pays a skill, +2% EP forever and
            the EP to start the next cycle.
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
          {/* This cycle, in the player's own numbers: what the run they are
              about to hand back actually did. */}
          <dl className="rebirth-cycle">
            <div>
              <dt>This cycle began</dt>
              <dd>{when(cycle.startedAt)}</dd>
            </div>
            <div>
              <dt>Rolls this cycle</dt>
              <dd>{cycle.rolls.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Badges found</dt>
              <dd>{cycle.badges}</dd>
            </div>
            <div>
              <dt>Best roll</dt>
              <dd>
                {cycle.bestRoll
                  ? `${cycle.bestRoll.number.toLocaleString("en-US")} · ${formatEP(cycle.bestRoll.ep)} EP`
                  : "—"}
              </dd>
            </div>
          </dl>
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
              <dd>{bonusNow > 0 ? `+${bonusNow}%` : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* What the button would do to this save, right now — not a general
          promise: the figures are this account's. */}
      <section
        className="rebirth-block rebirth-preview"
        aria-labelledby="rebirth-preview-title"
      >
        <header>
          <h3 id="rebirth-preview-title">
            <Coins size={16} /> If you rebirth right now
          </h3>
          <p>Your save, your numbers.</p>
        </header>
        <div className="rebirth-preview-grid">
          <article className="rebirth-preview-card is-reset">
            <h4>
              <ArrowDown size={13} /> You hand back
            </h4>
            <ul>
              <li>
                <strong>{formatEP(progress.balance ?? 0)} EP</strong>
                <small>in your wallet</small>
              </li>
              <li>
                <strong>
                  {owned.length} purchase{owned.length === 1 ? "" : "s"}
                </strong>
                <small>
                  {owned.length
                    ? `${formatEP(ownedValue)} EP of upgrades`
                    : "nothing bought yet"}
                </small>
              </li>
              <li>
                <strong>
                  {pets} companion{pets === 1 ? "" : "s"}
                </strong>
                <small>of {PETS.length} in the shelf</small>
              </li>
              <li>
                <strong>{count} badges</strong>
                <small>of {BADGE_TOTAL} discovered</small>
              </li>
            </ul>
          </article>
          <article className="rebirth-preview-card is-keep">
            <h4>
              <ShieldCheck size={13} /> You keep
            </h4>
            <ul>
              <li>
                <strong>{(progress.history ?? []).length} entries</strong>
                <small>of activity history</small>
              </li>
              <li>
                <strong>
                  {rebirths} rebirth{rebirths === 1 ? "" : "s"} · {ultras} ultra
                </strong>
                <small>and the +{bonusNow}% EP they already paid</small>
              </li>
              <li>
                <strong>
                  {keptSkills} ladder skill{keptSkills === 1 ? "" : "s"}
                </strong>
                <small>earned, never bought</small>
              </li>
              <li>
                <strong>{formatEP(progress.totalEarned ?? 0)} EP</strong>
                <small>earned all-time on this account</small>
              </li>
            </ul>
          </article>
          <article className="rebirth-preview-card is-gain">
            <h4>
              <Sparkles size={13} /> You gain
            </h4>
            <ul>
              <li>
                <strong>{reward ? reward.name : "No rung left"}</strong>
                <small>
                  {reward
                    ? skillEffectSummary(reward)
                    : "the ladder is complete"}
                </small>
              </li>
              <li>
                <strong>+2% EP forever</strong>
                <small>
                  {bonusNow > 0
                    ? `from +${bonusNow}% to +${bonusNow + 2}%`
                    : "on every roll you bank"}
                </small>
              </li>
              <li>
                <strong>
                  {formatEP(ladderComplete ? ultraStarter : starter)} EP
                </strong>
                <small>
                  {ladderComplete
                    ? `to start the next run (+${formatEP(starterGain)} more than a rung)`
                    : "waiting in your wallet when the cycle begins"}
                </small>
              </li>
              <li>
                <strong>{formatEP(cycle.earned)} EP</strong>
                <small>
                  scored by this cycle's {cycle.rolls}{" "}
                  {cycle.rolls === 1 ? "roll" : "rolls"}
                </small>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section className="rebirth-block" aria-labelledby="rebirth-ladder-title">
        <header>
          <h3 id="rebirth-ladder-title">
            <LegendMark size={16} /> The ladder
          </h3>
          <p>
            Each step asks for 10 points more and grants a skill found nowhere
            else, a permanent +2% EP and the sum the next cycle starts with. No
            purchase is ever required.
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
            <p>Everything but the run.</p>
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
            <p>The run, never the account.</p>
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
            Finish all {REBIRTH_TOTAL} steps and every badge, and you can take
            the same fresh start at the top of the ladder — for a bonus that
            never resets, and a bigger sum to begin with.
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
                  Like a companion: it multiplies banked EP, never the number or
                  its rank.
                </small>
              </span>
            </li>
            <li>
              <Wallet size={14} />
              <span>
                <strong>
                  {formatEPCompact(ULTRA_STARTER_EP)} EP more to start
                </strong>
                <small>
                  An ultra-rebirth pays its own starting sum on top of the
                  ladder's: {formatEP(ultraStarter)} EP waiting in the new run.
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

      {ultras > 0 && (
        <p className="rebirth-ultra-note">
          Ultra-rebirths: <b>{ultras}</b> · permanent wallet bonus{" "}
          <b>+{Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * ultras)}% EP</b> added
          to every roll you bank.
        </p>
      )}

      <p className="rebirth-history-note">
        <History size={13} aria-hidden="true" /> Every cycle stays in your
        activity history —{" "}
        {(progress.history ?? []).length.toLocaleString("en-US")} entries so
        far, going back to {when(cycle.startedAt)}.
      </p>

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
                The run starts over again, from the top of the ladder, and you
                get something permanent in return.
              </p>
              <ul>
                <li>
                  <strong>Reset:</strong> your EP, your badges, every upgrade,
                  aura, tool, shop skill and companion.
                </li>
                <li>
                  <strong>Keep:</strong> your profile, your activity history,
                  your {REBIRTH_TOTAL} rebirths with their skills, and every
                  permanent bonus.
                </li>
                <li>
                  <strong>Gain:</strong>{" "}
                  <strong>
                    +{Math.round(ULTRA_BONUS_PER_REBIRTH * 100 * (ultras + 1))}%
                    EP
                  </strong>{" "}
                  on every banked roll, forever, and{" "}
                  <strong>{formatEP(ultraStarter)} EP</strong> to start the new
                  cycle.
                </li>
              </ul>
            </>
          ) : (
            <>
              <p>The run starts over; the account keeps everything it did.</p>
              <ul>
                <li>
                  <strong>Reset:</strong> the badge collection, every purchase,
                  the companions and the {formatEP(progress.balance ?? 0)} EP in
                  your wallet.
                </li>
                <li>
                  <strong>Keep:</strong> the activity history, your rebirths
                  with their skills, and every permanent EP bonus.
                </li>
                <li>
                  <strong>Gain:</strong>{" "}
                  {reward ? (
                    <>
                      <strong>{reward.name}</strong>,{" "}
                    </>
                  ) : (
                    ""
                  )}
                  +{Math.round(REBIRTH_BONUS_PER_REBIRTH * 100)}% EP on every
                  banked roll, and <strong>{formatEP(starter)} EP</strong> to
                  start the cycle.
                </li>
              </ul>
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
