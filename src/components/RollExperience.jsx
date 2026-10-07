import { flywheelForDraw } from "../flywheel";
import { gameNow } from "../game-clock";
import RollProgress from "./RollProgress";
import GoalRecap from "./GoalRecap";
import CooldownFill from "./CooldownFill";
import {
  cooldownLabel,
  displayedCooldownSeconds,
  parseCooldownWindow,
} from "../cooldown.js";
import SkillBar from "./SkillBar";
import PetParade from "./PetParade";
import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import { Clock3, Check, Share2, Infinity as InfinityIcon } from "lucide-react";
import {
  buildRevealTimeline,
  SCRAMBLE_MS,
  easeOutCubic,
  revealCueTimes,
} from "../roll-timeline";
import { groupResultBadges, formatEP, buildShareText } from "../roll-data";
import { prepareRolls, restoreRoll } from "../roll-client";
import BadgeBreakdown from "./BadgeBreakdown";
import RankSummary from "./RankSummary";
import { rollSettings, formatDuration } from "../shop-data";
import { useMotionPreference, useSettings } from "../use-settings.jsx";
import { readAutoRoll, writeAutoRoll } from "../auto-roll.js";
import NumberBox from "./NumberBox";
import DrawStage from "./DrawStage";
import { petById, petBonusLabel } from "../pets.js";
import { skillForPet } from "../skills.js";
import { walletMultiplier } from "../progress.js";
import { walletParts } from "../rack.js";
import { CreatureIcon } from "./game-icons.jsx";
import "../roll.css";

const AnimatedCount = memo(function AnimatedCount({
  value,
  duration = 500,
  reducedMotion,
  initialValue = value,
}) {
  const [display, setDisplay] = useState(initialValue);
  const current = useRef(initialValue);
  useEffect(() => {
    if (reducedMotion) {
      current.current = value;
      setDisplay(value);
      return;
    }
    const from = current.current,
      start = performance.now();
    let raf;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = from + (value - from) * easeOutCubic(progress);
      current.current = next;
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reducedMotion]);
  return <>{formatEP(reducedMotion ? value : display)}</>;
});

const NumberArtifact = memo(function NumberArtifact({
  run,
  elapsed,
  timeline,
  reducedMotion,
  aura,
  dockedPet = null,
  behind = false,
}) {
  const target = String(run.result.number),
    pad = timeline.slots - target.length;
  const done = timeline.digitTimes.filter((t) => elapsed >= t).length;
  const spinning = done < timeline.slots;
  const rarityKnown = elapsed >= timeline.rarity;
  const pulse =
    elapsed >= timeline.rarity && elapsed < timeline.rarity + timeline.pulseMS
      ? "rank"
      : elapsed >= timeline.collapse &&
          elapsed < timeline.collapse + timeline.pulseMS
        ? "digits"
        : null;
  const visibleSlots = timeline.slots - Math.min(pad, done);
  const size =
    visibleSlots <= 3
      ? 72
      : visibleSlots === 4
        ? 60
        : visibleSlots === 5
          ? 48
          : 36;
  const [scramble, setScramble] = useState(() => Array(7).fill("?"));
  useEffect(() => {
    if (!spinning || reducedMotion) return;
    const timer = setInterval(
      () =>
        setScramble(
          Array.from({ length: 7 }, () =>
            String(Math.floor(Math.random() * 10)),
          ),
        ),
      SCRAMBLE_MS,
    );
    return () => clearInterval(timer);
  }, [run.id, spinning, reducedMotion]);
  const tier = rarityKnown && run.result.tier ? run.result.tier : "neutral";
  const dockedSkill = dockedPet ? skillForPet(dockedPet) : null;
  const dockedName = dockedPet ? (petById.get(dockedPet)?.name ?? "") : "";
  return (
    <div
      className={`artifact-stage aura-${aura} ${behind ? "is-behind" : ""}`}
      data-aura={aura}
    >
      {/* While the worn companion's signature skill fires, the companion steps
          off the stage and pins itself here, on the corner of the number box,
          until the roll settles and it can go back to walking. */}
      {dockedPet && dockedSkill && (
        <span
          className={`artifact-companion tint-${dockedSkill.tint}`}
          role="img"
          aria-label={`${dockedName}: its skill ${dockedSkill.name} is firing on this roll`}
          title={`${dockedName} — ${dockedSkill.name}`}
        >
          <CreatureIcon pet={dockedPet} size={19} aria-hidden="true" />
        </span>
      )}
      <NumberBox
        tier={tier}
        aura={aura}
        role="img"
        className={`number-artifact ${tier} ${spinning ? "is-spinning" : pulse ? `pulse-${pulse}` : "is-breathing"}`}
        aria-label={spinning ? "Revealing a random number" : `Number ${target}`}
        data-revealed={done}
      >
        <span
          className="artifact-digits"
          style={{ fontSize: `${size}px` }}
          aria-hidden="true"
        >
          {Array.from({ length: 7 }, (_, i) => {
            const landed = i < done;
            const blank = i >= timeline.slots || (landed && i < pad);
            const settling =
              landed &&
              !blank &&
              elapsed < timeline.digitTimes[i] + timeline.settleMS;
            return (
              <span
                key={i}
                data-slot={i}
                className={`artifact-digit ${blank ? "is-blank" : ""} ${!landed ? "is-scrambling" : ""} ${settling ? "is-settling" : ""}`}
              >
                {blank ? "\u00a0" : landed ? target[i - pad] : scramble[i]}
              </span>
            );
          })}
        </span>
      </NumberBox>
    </div>
  );
});

export default function RollExperience({
  children,
  openBadge,
  notify,
  session,
  onComplete,
  onDraw,
  active = true,
  theme,
  aura,
  openSignup,
  navigate,
  arrivalPet = null,
}) {
  const settings = rollSettings(session.owned);
  const { settings: preferences } = useSettings();
  const ownsAutoRoll = session.owned.includes("auto-roll");
  // Persistence Core is the only way a switch survives a reload; without it the
  // stored value is ignored so Auto-Roll still starts off, as documented.
  const persistsAutoRoll =
    ownsAutoRoll && session.owned.includes("persistence-core");
  const [autoRoll, setAutoRoll] = useState(() =>
    persistsAutoRoll
      ? readAutoRoll(session.profile?.id)
      : preferences.autoRollDefault && ownsAutoRoll,
  );
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const autoAction = useRef(null);
  autoAction.current = generate;
  // The switch only runs on the visible Roll page unless Persistence Core is
  // owned. The rack states the same thing in words, so the two can never drift.
  const autoRollRunning = autoRoll && active && (visible || persistsAutoRoll);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (persistsAutoRoll) writeAutoRoll(session.profile?.id, autoRoll);
  }, [persistsAutoRoll, autoRoll, session.profile?.id]);
  const [run, setRun] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [instantCompletion, setInstantCompletion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const drawPending = useRef(false);
  const localCooldown = useRef(0);
  const [localCooldownUntil, setLocalCooldownUntil] = useState(0);
  const mounted = useRef(false);
  const [error, setError] = useState("");
  const [settleError, setSettleError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cooldown, setCooldown] = useState(() =>
    displayedCooldownSeconds(
      session.cooldownWindow,
      session.cooldownUntil,
      gameNow(),
    ),
  );
  // Time left on the committed reservation, separate from the cooldown shown
  // by the button: a zero-cooldown boost (or a cooldown-waiving skill) still
  // reserves its whole reveal, so `reserving` stays true until the deadline
  // actually passes and the next roll cannot start on top of a live one.
  const [remainingMS, setRemainingMS] = useState(() =>
    Math.max(
      0,
      Math.max(session.cooldownUntil ?? 0, localCooldownUntil ?? 0) - gameNow(),
    ),
  );
  const reserving = remainingMS > 0;
  const reservedSeconds = Math.ceil(remainingMS / 1000);
  const reducedMotion = useMotionPreference();
  const activeCompanion = petById.get(session.activePet) ?? null;
  const finishedRun = useRef(null);
  const shareButton = useRef(null);
  const creditCallback = useRef(onComplete);
  const copiedTimer = useRef(null);
  const activeRun = useRef(null);
  activeRun.current = run?.id;
  const generateButton = useRef(null);
  creditCallback.current = onComplete;
  const result = run?.result;
  const groups = useMemo(
    () => (result ? groupResultBadges(result.badges) : []),
    [result],
  );
  const timeline = useMemo(
    () =>
      buildRevealTimeline(
        String(result?.number ?? "").length,
        groups.length,
        run?.rollMS,
      ),
    [result, groups, run?.rollMS],
  );
  const runSettled =
    !!run &&
    (session.receipts.includes(run.id) ||
      session.history.some((e) => e.type === "roll" && e.id === run.id));
  const awaitingSettlement =
    !!run && session.pendingRoll?.id === run.id && !runSettled;
  const busy = !!run && elapsed < timeline.end;
  // While the worn companion's signature skill fires on this roll, the
  // companion steps off the stage and shows as a small mark on the number
  // box; it goes back to walking the moment the roll settles.
  const companionSkill = skillForPet(session.activePet);
  const companionSkillFiring =
    !!run &&
    !runSettled &&
    !!companionSkill &&
    (run.skills ?? []).includes(companionSkill.id);
  // What actually lands in the wallet: the settlement's own formula, so the
  // on-screen sum matches the credit to the EP — companion, rebirth bonuses,
  // ultra-rebirth and every wallet skill that fired, never the score.
  const firedSkills = run?.skills ?? [];
  const bankedMultiplier = result ? walletMultiplier(session, firedSkills) : 1;
  const creditedEP =
    result && result.totalEP !== null
      ? Math.round(result.totalEP * bankedMultiplier)
      : 0;
  const bonusEP = Math.max(0, creditedEP - (result?.totalEP ?? 0));
  const bonusParts = bonusEP > 0 ? walletParts(session, firedSkills) : [];
  const floatingCharges = useMemo(() => {
    if (!result || result.totalEP === null) return [];
    if (!bonusParts.length) return [{ id: "base", ep: creditedEP, label: "" }];
    const list = [{ id: "base", ep: result.totalEP, label: "" }];
    let running = result.totalEP;
    bonusParts.forEach((part, index) => {
      const next =
        index === bonusParts.length - 1
          ? creditedEP
          : Math.round(running * part.value);
      const gain = Math.max(0, next - running);
      running = next;
      if (gain > 0) list.push({ id: part.id, ep: gain, label: part.label });
    });
    return list;
  }, [result, bonusParts, creditedEP]);
  const cooldownDeadline = Math.max(session.cooldownUntil, localCooldownUntil);
  const cooldownWindow =
    session.cooldownWindow ?? parseCooldownWindow(null, cooldownDeadline, run);
  // The word in front of the countdown always names the wait that number
  // actually is: the cooldown while the reveal still holds the roll back, the
  // next roll once the cooldown itself is running, and the rest of the reveal
  // when a boost or a waive skill removed the cooldown entirely.
  const waitWord = cooldown
    ? cooldownLabel(cooldownWindow, cooldownDeadline, gameNow())
    : "REVEAL IN";
  const instant = reducedMotion || instantCompletion;
  const digitsDone = !!run && elapsed >= timeline.collapse;
  // A draw skill took more than one number. The split screen owns the roll
  // until every draw has rolled its digits and earned its badges; the best one
  // then takes the centre of the screen, holds it, and leaves — the rest of the
  // reveal (rank, wallet, breakdown) plays underneath once it has gone.
  const splitDraws = run && (run.draws ?? []).length > 1 ? run.draws : null;
  const splitDecision = useMemo(() => {
    if (!splitDraws) return 0;
    const last = timeline.badgeTimes.at(-1);
    return (
      (Number.isFinite(last) ? last : timeline.collapse) +
      0.35 * timeline.pulseMS
    );
  }, [splitDraws, timeline]);
  // The winner holds the centre long enough to read and to hover at any pace.
  // It cannot hold much longer than this: the rank, the wallet and the badge
  // breakdown all play underneath and need the screen back.
  const scale = timeline.scale ?? 1,
    splitHold = 1100 + 1400 * scale,
    splitFade = 250 + 350 * scale;
  const splitPlaying =
    !!splitDraws && elapsed < splitDecision + splitHold + splitFade;
  const splitLeaving = !!splitDraws && elapsed >= splitDecision + splitHold;
  const splitDecided = !!splitDraws && elapsed >= splitDecision;
  const rankKnown = !!run && elapsed >= timeline.rarity;
  const visibleCount = timeline.badgeTimes.filter((t) => elapsed >= t).length;
  const visibleGroups = groups.slice(-visibleCount || groups.length);
  const shownEP = visibleGroups.reduce((sum, g) => sum + g.lead.ep, 0);

  useEffect(() => {
    if (!ownsAutoRoll || error || settleError) {
      setAutoRoll(false);
      return;
    }
    if (
      !autoRollRunning ||
      loading ||
      drawing ||
      busy ||
      cooldown > 0 ||
      awaitingSettlement ||
      session.offline?.batch ||
      session.pendingRoll
    )
      return;
    // Use the same serialized, persisted draw path as the manual button. Cleanup
    // cancels a queued auto-start when switching it off or leaving the page.
    // Never queue a start inside the window this roll is still reserving: the
    // wait is measured from the game clock, not from a display tick, so a paused
    // or throttled countdown cannot fire the next roll early or stall the loop.
    const remaining =
      Math.max(
        0,
        Math.max(session.cooldownUntil ?? 0, localCooldownUntil ?? 0) -
          gameNow(),
      ) + 120;
    const timer = setTimeout(
      () => autoAction.current(),
      Math.max(250, Math.ceil(remaining)),
    );
    return () => clearTimeout(timer);
  }, [
    autoRollRunning,
    ownsAutoRoll,
    loading,
    drawing,
    busy,
    cooldown,
    awaitingSettlement,
    session.pendingRoll,
    session.offline?.batch,
    localCooldownUntil,
    error,
    settleError,
  ]);

  useEffect(() => {
    const until = Math.max(session.cooldownUntil, localCooldownUntil);
    // Show the cooldown alone, not the reveal that precedes it. Eligibility is
    // still governed by `until`, so the actual wait is unchanged.
    const window =
      session.cooldownWindow ?? parseCooldownWindow(null, until, run);
    const update = () => {
      const now = gameNow();
      setCooldown(displayedCooldownSeconds(window, until, now));
      setRemainingMS(Math.max(0, until - now));
    };
    update();
    if (until <= gameNow()) return;
    const timer = setInterval(() => {
      update();
      if (gameNow() >= until) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [
    session.cooldownUntil,
    localCooldownUntil,
    session.cooldownWindow,
    run?.id,
  ]);

  useEffect(() => {
    if (!run || finishedRun.current === run.id) return;
    let stopped = false,
      timer;
    // gameNow() rather than performance.now(): the reveal is paced by the same
    // hardened, monotonic clock as the cooldown, so replacing performance.now
    // cannot fast-forward the number onto the screen.
    const start = gameNow();
    const alreadyElapsed = Math.max(0, start - run.startedAt);
    // The reveal only wakes on its own beats. A draw skill's split screen has
    // beats of its own — the decision and the moment it lets go of the screen —
    // and it would otherwise hang between two badge cues and only leave when
    // the whole reveal ended.
    const cues = [
      ...new Set([
        ...revealCueTimes(timeline),
        ...(splitDraws
          ? [
              splitDecision,
              splitDecision + splitHold,
              splitDecision + splitHold + splitFade,
            ]
          : []),
      ]),
    ].sort((a, b) => a - b);
    const finish = (instant = false) => {
      if (stopped) return;
      stopped = true;
      finishedRun.current = run.id;
      clearTimeout(timer);
      setInstantCompletion(instant);
      setElapsed(timeline.end);
      const until = run.startedAt + run.rollMS + run.cooldownMS;
      localCooldown.current = until;
      setLocalCooldownUntil(until);
      setCooldown(
        displayedCooldownSeconds(
          session.cooldownWindow ?? parseCooldownWindow(null, until, run),
          until,
          gameNow(),
        ),
      );
      creditCallback.current(run.result, run.id, until).then((outcome) => {
        if (mounted.current && activeRun.current === run.id)
          setSettleError(outcome.ok ? "" : outcome.message);
      });
    };
    if (reducedMotion || alreadyElapsed >= timeline.end) finish(reducedMotion);
    else {
      let cue = 0;
      const advance = () => {
        if (stopped) return;
        const time = alreadyElapsed + gameNow() - start;
        if (time >= timeline.end) {
          finish();
          return;
        }
        setElapsed(time);
        while (cue < cues.length && cues[cue] <= time) cue++;
        timer = setTimeout(advance, Math.max(1, cues[cue] - time));
      };
      advance();
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [run, timeline, reducedMotion]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    prepareRolls()
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(copiedTimer.current);
    };
  }, []);

  async function generate() {
    if (
      drawPending.current ||
      loading ||
      busy ||
      settleError ||
      awaitingSettlement ||
      session.offline?.batch ||
      gameNow() < Math.max(session.cooldownUntil, localCooldown.current)
    )
      return;
    drawPending.current = true;
    setDrawing(true);
    setError("");
    try {
      const outcome = await onDraw();
      if (!outcome.ok) throw new Error(outcome.message);
      if (mounted.current) begin(outcome.run);
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      drawPending.current = false;
      if (mounted.current) setDrawing(false);
    }
  }

  function begin(committed) {
    if (!committed || activeRun.current === committed.id) return;
    activeRun.current = committed.id;
    setError("");
    clearTimeout(copiedTimer.current);
    setCopied(false);
    setSettleError("");
    setInstantCompletion(reducedMotion);
    setElapsed(
      reducedMotion
        ? committed.rollMS
        : Math.min(
            committed.rollMS,
            Math.max(0, gameNow() - committed.startedAt),
          ),
    );
    setRun(committed);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const pending = session.pendingRoll;
    if (!pending || activeRun.current === pending.id) return;
    let cancelled = false;
    setDrawing(true);
    restoreRoll(pending.number)
      .then((result) => {
        if (!cancelled && mounted.current) begin({ ...pending, result });
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setDrawing(false);
      });
    return () => {
      cancelled = true;
      setDrawing(false);
    };
  }, [session.pendingRoll?.id]);
  async function retryCommitted() {
    setDrawing(true);
    try {
      const outcome = await onDraw();
      if (!outcome.ok) throw new Error(outcome.message);
      if (mounted.current) begin(outcome.run);
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      if (mounted.current) setDrawing(false);
    }
  }
  async function retrySettlement() {
    const outcome = await creditCallback.current(
      run.result,
      run.id,
      run.startedAt + run.rollMS + run.cooldownMS,
    );
    if (mounted.current && activeRun.current === run.id)
      setSettleError(outcome.ok ? "" : outcome.message);
  }
  async function share() {
    const sharedRun = run.id;
    try {
      await navigator.clipboard.writeText(buildShareText(result));
      if (!mounted.current || activeRun.current !== sharedRun) return;
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      notify(
        "Clipboard isn’t available. Try copying from a secure browser window.",
      );
    }
  }

  return (
    <div
      className={`roll-experience ${run ? "is-result" : "is-idle"} ${instant ? "is-instant" : ""}`}
      style={{ "--reveal-scale": timeline.scale }}
      data-settled={!!run && runSettled}
      data-prestige={session.ultraRebirths > 0 || undefined}
      data-phase={
        !run ? "idle" : !digitsDone ? "digits" : busy ? "badges" : "complete"
      }
    >
      <div
        className={`roll-vignette ${busy && !reducedMotion ? "is-visible" : ""}`}
        aria-hidden="true"
      />
      {/* The corner rack: charged circles, Flywheel, and Auto-Roll as one more
          ability you click on or off. A full circle fires on the next roll, and
          during that roll it shows as firing; the Σ button states what the
          whole rack adds up to. */}
      {preferences.showSkillBar && (
        <SkillBar
          progress={session}
          firing={[
            ...(run && !runSettled ? (run.skills ?? []) : []),
            ...(run && run.flywheel === "boost" && !runSettled
              ? ["flywheel"]
              : []),
          ]}
          phase={!run ? "idle" : busy ? "reveal" : "cooldown"}
          autoRoll={ownsAutoRoll && autoRoll}
          autoRollState={
            !autoRoll ? "off" : autoRollRunning ? "running" : "paused"
          }
          onToggleAutoRoll={() => setAutoRoll((enabled) => !enabled)}
        />
      )}
      {/* Only the equipped companion walks the roll screen, so it is always
          obvious which one is actually active. The rest stay on the shelf.
          While its signature skill fires it steps off the stage entirely and
          lives on the corner of the number until the roll settles. */}
      <PetParade
        pets={
          session.activePet && session.activePet !== "none"
            ? [session.activePet]
            : []
        }
        active={session.activePet}
        reducedMotion={reducedMotion}
        arrival={arrivalPet}
        docked={companionSkillFiring}
        phase={!run ? "idle" : busy ? "reveal" : "cooldown"}
      />
      {!run ? (
        <section className="idle-roll" aria-label="Number generator">
          <NumberBox
            className="question-number"
            value="??????"
            aura={aura}
            aria-label="Your random number awaits"
          />
          <h1>One number. What will yours be?</h1>
          <button
            ref={generateButton}
            className={`generate ${cooldown || reserving || loading || drawing ? "cooling" : ""}`}
            disabled={
              loading || drawing || reserving || !!session.offline?.batch
            }
            onClick={generate}
          >
            {loading
              ? "LOADING ROLL DATA…"
              : drawing
                ? "DRAWING…"
                : cooldown || reserving
                  ? `${waitWord} ${formatDuration(cooldown || reservedSeconds)}`
                  : error
                    ? "RETRY & ROLL"
                    : "GENERATE"}
            {!!cooldown && (
              <CooldownFill
                window={cooldownWindow}
                reducedMotion={reducedMotion}
              />
            )}
          </button>
          {error && (
            <p className="roll-load-error" role="alert">
              {error}{" "}
              {session.pendingRoll
                ? "Your committed roll is retained; resume it below."
                : "No roll or EP was awarded. Use Retry & Roll to try again."}
            </p>
          )}
          <p className="roll-hint">
            <InfinityIcon size={14} /> {settings.rollMS / 1000}s reveal{" "}
            <span>·</span>{" "}
            {flywheelForDraw(session) === "boost"
              ? "no"
              : formatDuration(settings.cooldownMS / 1000)}{" "}
            cooldown
            {/* What the worn companion adds, stated where the timings are. */}
            {activeCompanion && (
              <>
                <span>·</span>{" "}
                <span className="roll-hint-pet">
                  <CreatureIcon pet={activeCompanion.id} size={13} />
                  {activeCompanion.name}{" "}
                  {petBonusLabel(activeCompanion.multiplier)}
                </span>
              </>
            )}
          </p>
          <p className="signup-note">
            {session.profile ? (
              `Saved locally as ${session.profile.username}.`
            ) : (
              <>
                Guest rolls are not saved.{" "}
                <button onClick={openSignup}>Sign up to start saving</button>
              </>
            )}
          </p>
        </section>
      ) : (
        <>
          <section className="active-roll" aria-label="Your roll">
            {/* Every draw the roll took, side by side, until the best of them
                takes the centre and becomes the number that pays. */}
            {splitPlaying && (
              <DrawStage
                key={`draw-${run.id}`}
                {...{ run, elapsed, timeline, reducedMotion, aura }}
                decided={splitDecided}
                leaving={splitLeaving}
              />
            )}
            <NumberArtifact
              key={run.id}
              {...{ run, elapsed, timeline, reducedMotion, aura }}
              behind={!!splitDraws && !splitDecided}
              dockedPet={companionSkillFiring ? session.activePet : null}
            />
            <div className="roll-announcement sr-only" role="status">
              {!digitsDone
                ? `Revealing ${splitDraws ? `${splitDraws.length} numbers` : "your number"}. ${timeline.digitTimes.filter((t) => elapsed >= t).length} of ${timeline.slots} digits settled.`
                : busy
                  ? `Number ${result.number}. Revealing badges.`
                  : `${result.number}, ${result.tier}, ${formatEP(result.totalEP)} EP.${
                      bonusEP
                        ? ` +${formatEP(bonusEP)} EP extra from your multipliers.`
                        : ""
                    }`}
            </div>
            {result.totalEP !== null && (
              <div
                className={`result-summary ${!digitsDone ? "is-spinning-summary" : ""}`}
              >
                {digitsDone && (
                  <RankSummary
                    {...{
                      result,
                      instant,
                      rankKnown,
                      visible: elapsed >= timeline.stats,
                      scale: timeline.scale,
                    }}
                  />
                )}
                <div
                  className={`roll-ep ${rankKnown ? result.tier : "neutral"}`}
                  data-testid="roll-ep"
                >
                  {visibleCount ? (
                    <AnimatedCount
                      value={shownEP}
                      duration={500 * timeline.scale}
                      initialValue={0}
                      reducedMotion={instant}
                    />
                  ) : (
                    "???"
                  )}{" "}
                  EP
                </div>
                {digitsDone && (
                  <div
                    className={`session-total ${elapsed >= timeline.sessionShow ? "is-visible" : ""}`}
                    aria-hidden={elapsed < timeline.sessionShow}
                  >
                    <span>
                      <AnimatedCount
                        value={
                          session.balance +
                          (elapsed >= timeline.sessionCount && !runSettled
                            ? creditedEP
                            : 0)
                        }
                        duration={1500 * timeline.scale}
                        reducedMotion={instant}
                      />{" "}
                      EP
                      {elapsed >= timeline.sessionCount &&
                        elapsed < timeline.end &&
                        !instant &&
                        floatingCharges.map((charge, index) => (
                          <span
                            key={charge.id}
                            className={`floating-ep ${index > 0 ? "is-bonus-charge" : ""}`}
                            style={{ "--charge-index": index }}
                          >
                            +{formatEP(charge.ep)}
                            {charge.label ? ` · ${charge.label}` : ""}
                          </span>
                        ))}
                    </span>
                    <small>Your EP balance</small>
                    {/* Savings sit with the wallet they are measured against,
                        and only once the reveal has settled and the EP is
                        actually credited. */}
                    {!busy && runSettled && preferences.showGoalRecap && (
                      <GoalRecap
                        progress={session}
                        runId={run.id}
                        navigate={navigate}
                      />
                    )}
                  </div>
                )}
                {rankKnown && (
                  <div className="share-row">
                    <button
                      ref={shareButton}
                      className={`share-button ${!busy ? "is-highlighted" : ""}`}
                      onClick={share}
                    >
                      {copied ? <Check size={15} /> : <Share2 size={15} />}{" "}
                      {copied ? "Copied result + link!" : "Share"}
                    </button>
                    <span>
                      {busy ? (
                        "REVEALING YOUR ROLL"
                      ) : cooldown || reserving ? (
                        <>
                          {waitWord}{" "}
                          <b>{formatDuration(cooldown || reservedSeconds)}</b>
                        </>
                      ) : awaitingSettlement ? (
                        "SETTLING YOUR RESULT"
                      ) : (
                        "YOUR NEXT ROLL IS READY"
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div
              className={`generate-wrap ${busy ? "is-away" : ""}`}
              aria-hidden={busy}
              inert={busy ? true : undefined}
            >
              <button
                ref={generateButton}
                className={`generate ${cooldown || reserving || loading || drawing ? "cooling" : ""}`}
                disabled={
                  loading ||
                  drawing ||
                  busy ||
                  reserving ||
                  awaitingSettlement ||
                  !!session.offline?.batch ||
                  !!settleError
                }
                onClick={generate}
              >
                {drawing ? (
                  "DRAWING…"
                ) : cooldown ? (
                  <>
                    <Clock3 size={18} /> {waitWord} {formatDuration(cooldown)}
                    <CooldownFill
                      window={cooldownWindow}
                      reducedMotion={reducedMotion}
                    />
                  </>
                ) : reserving ? (
                  <>
                    <Clock3 size={18} /> {waitWord}{" "}
                    {formatDuration(reservedSeconds)}
                  </>
                ) : awaitingSettlement ? (
                  "RESULT PENDING"
                ) : error ? (
                  "RETRY & ROLL"
                ) : (
                  "ROLL AGAIN"
                )}
              </button>
            </div>
            {error && (
              <p className="roll-load-error" role="alert">
                {error} No roll or EP was awarded. Use Retry &amp; Roll to try
                again.
              </p>
            )}
            {settleError && (
              <div className="roll-load-error" role="alert">
                {settleError} Your committed number is retained.{" "}
                <button className="secondary-button" onClick={retrySettlement}>
                  Retry result settlement
                </button>
              </div>
            )}
          </section>
          {digitsDone && result.totalEP !== null && (
            <div className="breakdown-wrap">
              <BadgeBreakdown
                {...{
                  result,
                  groups,
                  visibleCount,
                  summaryVisible: elapsed >= timeline.summary,
                  staged: !instantCompletion && !reducedMotion,
                  openBadge,
                  reducedMotion,
                  theme,
                }}
              />
            </div>
          )}
        </>
      )}
      {error && session.pendingRoll && !run && (
        <button
          className="secondary-button"
          onClick={retryCommitted}
          disabled={drawing}
        >
          Resume committed roll
        </button>
      )}

      {(loading || drawing) && (
        <span className="sr-only" role="status">
          {loading
            ? "Loading full-range scoring data"
            : "Drawing a random number"}
        </span>
      )}
      {!run && children}
      {(!run || (!busy && runSettled)) && (
        <RollProgress progress={session} runId={run?.id} navigate={navigate} />
      )}
    </div>
  );
}
