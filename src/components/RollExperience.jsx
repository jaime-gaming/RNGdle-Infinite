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
import {
  Clock3,
  Check,
  LayoutGrid,
  Share2,
  Infinity as InfinityIcon,
} from "lucide-react";
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
import DrawStage, { DrawDetail, claimFor, useDrawScores } from "./DrawStage";
import PaidNumbers from "./PaidNumbers";
import { petById, petBonusLabel } from "../pets.js";
import { skillById, skillForPet } from "../skills.js";
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
  const rollSection = useRef(null);
  const creditCallback = useRef(onComplete);
  const copiedTimer = useRef(null);
  const activeRun = useRef(null);
  activeRun.current = run?.id;
  const generateButton = useRef(null);
  creditCallback.current = onComplete;
  const result = run?.result;
  // More than one number is paid: each paid number is shown on its own card,
  // and no total EP is counted up on screen for the roll.
  // Every number a draw skill kept is listed as paid. A plain draw can win, so a
  // single paid number is listed too when it is not the roll's own number.
  const paidPicks = run?.picks ?? [];
  const stacked =
    paidPicks.length > 1 ||
    (paidPicks.length === 1 && paidPicks[0].number !== run?.number);
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
  // prestige, the Rollback and every wallet skill that fired, never the score.
  const firedSkills = run?.skills ?? [];
  const bankedMultiplier = result ? walletMultiplier(session, firedSkills) : 1;
  // Every draw skill keeps its own number, and every number it keeps is a
  // banked roll: the sum that lands in the wallet is the sum of all of them,
  // not just the one the roll commits. The extra numbers are scored here from
  // the same verified index the settlement will read.
  const keptNumbers = useMemo(
    () =>
      (run?.picks ?? []).filter(
        (pick) => pick.number !== result?.number && pick.number != null,
      ),
    [run?.picks, result?.number],
  );
  const [keptScores, setKeptScores] = useState({});
  useEffect(() => {
    if (!keptNumbers.length) {
      setKeptScores({});
      return;
    }
    let cancelled = false;
    Promise.all(
      keptNumbers.map(async (pick) => {
        try {
          return [pick.number, await restoreRoll(pick.number)];
        } catch {
          return [pick.number, null];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setKeptScores(
        Object.fromEntries(entries.filter(([, scored]) => !!scored)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [run?.id, keptNumbers.length]);
  // Every paid number, the one the roll committed included, each with the EP
  // it banks. A number whose score is still loading shows a dash for now.
  // Every paid number is a card. When a plain draw won, the roll's own number is
  // not a skill's pick, so its card leads the list as the Best one, by itself.
  const paidItems = useMemo(() => {
    const picks = run?.picks ?? [];
    const cards = picks
      .filter((pick) => pick.number != null)
      .map((pick, index) => {
        const definition = skillById.get(pick.skill);
        const best = pick.number === result?.number;
        const scored = best ? result : (keptScores[pick.number] ?? null);
        return {
          key: `${index}-${pick.number}`,
          skill: definition?.name ?? "",
          tint: definition?.tint ?? "green",
          number: pick.number,
          ep: scored
            ? `${formatEP(Math.round(scored.totalEP * bankedMultiplier))} EP`
            : "—",
          best,
        };
      });
    if (!result || picks.some((pick) => pick.number === result.number)) {
      return cards;
    }
    return [
      {
        key: `ordinary-${result.number}`,
        skill: "Ordinary draw",
        tint: "green",
        number: result.number,
        ep:
          result.totalEP !== null
            ? `${formatEP(Math.round(result.totalEP * bankedMultiplier))} EP`
            : "—",
        best: true,
      },
      ...cards,
    ];
  }, [run?.picks, result, keptScores, bankedMultiplier]);
  const extraPicks = useMemo(
    () =>
      keptNumbers
        .map((pick) => ({
          ...pick,
          name: skillById.get(pick.skill)?.name ?? "",
          tint: skillById.get(pick.skill)?.tint ?? "green",
          scored: keptScores[pick.number] ?? null,
        }))
        .filter((pick) => !!pick.scored),
    [keptNumbers, keptScores],
  );
  const extraEP = extraPicks.reduce(
    (total, pick) => total + Math.round(pick.scored.totalEP * bankedMultiplier),
    0,
  );
  const ownEP =
    result && result.totalEP !== null
      ? Math.round(result.totalEP * bankedMultiplier)
      : 0;
  const creditedEP = ownEP + extraEP;
  const bonusEP = Math.max(0, creditedEP - (result?.totalEP ?? 0) - extraEP);
  const bonusParts = bonusEP > 0 ? walletParts(session, firedSkills) : [];
  const floatingCharges = useMemo(() => {
    if (!result || result.totalEP === null || stacked) return [];
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
  }, [result, bonusParts, creditedEP, stacked]);
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
  // A draw skill took more than one number. The overview shows every draw while
  // each rolls its digits and earns its badges. Tapping a number opens it: the
  // best one is the roll's own result, any other one shows its own stats. The
  // view lives here, keyed by the run, so the next roll always opens on the
  // overview again.
  const splitDraws = run && (run.draws ?? []).length > 1 ? run.draws : null;
  const splitDecision = useMemo(() => {
    if (!splitDraws) return 0;
    const last = timeline.badgeTimes.at(-1);
    return (
      (Number.isFinite(last) ? last : timeline.collapse) +
      0.35 * timeline.pulseMS
    );
  }, [splitDraws, timeline]);
  const [splitView, setSplitView] = useState({ run: null, number: null });
  const splitOwned = !!run && splitView.run === run.id;
  const splitPick = splitOwned ? splitView.number : null;
  const splitOpen = !!splitDraws && splitPick == null;
  const drawScores = useDrawScores(splitDraws ? run : null);
  // A number other than the committed one, once its own stats are read. The
  // committed number is the roll's own result, so it never takes this screen.
  const splitDetailScored =
    splitPick != null && splitPick !== result?.number
      ? (drawScores[splitPick] ?? null)
      : null;
  const splitDetail = !!splitDetailScored;
  // Any single number on screen (its own stats, or the best one's result) means
  // the numbers are being looked at up close, so auto-roll stands still. The
  // overview does not stop it: the rolls keep turning under it.
  const splitClose = !!splitDraws && !splitOpen;
  const splitDecided = !!splitDraws && elapsed >= splitDecision;
  // The overview is a takeover: nothing under it may scroll while it is up.
  useEffect(() => {
    if (!splitOpen) return;
    document.documentElement.classList.add("draw-takeover");
    return () => document.documentElement.classList.remove("draw-takeover");
  }, [splitOpen]);
  // A multi-number roll keeps the install prompt out of the way for as long as
  // it is on screen: the prompt would otherwise cover the way back to the numbers.
  const splitRun = !!splitDraws;
  useEffect(() => {
    if (!splitRun) return;
    document.documentElement.classList.add("draw-split");
    return () => document.documentElement.classList.remove("draw-split");
  }, [splitRun]);
  // A number opened from the overview starts at the top of the roll, so its way
  // back to the numbers is the first thing on screen, wherever the page was.
  useEffect(() => {
    if (splitPick == null || !rollSection.current) return;
    rollSection.current.scrollIntoView({
      block: "start",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [splitPick, reducedMotion]);
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
      splitClose ||
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
    splitClose,
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
    // The reveal only wakes on its own beats. A draw skill's split screen has a
    // beat of its own, the decision, and it would otherwise hang between two
    // badge cues until the whole reveal ended.
    const cues = [
      ...new Set([
        ...revealCueTimes(timeline),
        ...(splitDraws ? [splitDecision] : []),
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
  async function share(shared = result) {
    const sharedRun = run.id;
    try {
      await navigator.clipboard.writeText(buildShareText(shared));
      if (!mounted.current || activeRun.current !== sharedRun) return;
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      notify({
        kind: "error",
        text: "Clipboard isn’t available. Try copying from a secure browser window.",
      });
    }
  }

  // The roll's button. It is the same control on the roll's own result and on a
  // number's own stats, so it reads and behaves the same wherever it appears.
  const rollAgainControl = (
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
            <Clock3 size={18} />
            <span className="generate-label">
              <span className="generate-word">{waitWord}</span>{" "}
              <span className="generate-time">{formatDuration(cooldown)}</span>
            </span>
            <CooldownFill
              window={cooldownWindow}
              reducedMotion={reducedMotion}
            />
          </>
        ) : reserving ? (
          <>
            <Clock3 size={18} />
            <span className="generate-label">
              <span className="generate-word">{waitWord}</span>{" "}
              <span className="generate-time">
                {formatDuration(reservedSeconds)}
              </span>
            </span>
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
  );
  // The EP balance a roll's result carries: the wallet, the EP this roll is
  // about to credit while it settles, and the goal line under it. A paid
  // number shows the same two, since it pays into the same wallet.
  const sessionTotal = digitsDone ? (
    <div
      className={`session-total ${elapsed >= timeline.sessionShow ? "is-visible" : ""}`}
      aria-hidden={elapsed < timeline.sessionShow}
    >
      <span>
        <AnimatedCount
          value={
            session.balance +
            (elapsed >= timeline.sessionCount && !runSettled ? creditedEP : 0)
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
        <GoalRecap progress={session} runId={run.id} navigate={navigate} />
      )}
    </div>
  ) : null;
  // The share line and the roll's status under it. A paid number shares its
  // own result, not the roll's.
  const shareRowFor = (shared) => (
    <div className="share-row">
      <button
        ref={shareButton}
        className={`share-button ${!busy ? "is-highlighted" : ""}`}
        onClick={() => share(shared)}
      >
        {copied ? <Check size={15} /> : <Share2 size={15} />}{" "}
        {copied ? "Copied result + link!" : "Share"}
      </button>
      <span>
        {busy ? (
          "REVEALING YOUR ROLL"
        ) : cooldown || reserving ? (
          <>
            {waitWord} <b>{formatDuration(cooldown || reservedSeconds)}</b>
          </>
        ) : awaitingSettlement ? (
          "SETTLING YOUR RESULT"
        ) : (
          "YOUR NEXT ROLL IS READY"
        )}
      </span>
    </div>
  );
  // A paid number that is not the roll's own result: its stats show the
  // balance and the share line the roll's result shows.
  const paidDetail = splitDetail && !!claimFor(run, splitPick);
  return (
    <div
      className={`roll-experience ${run ? "is-result" : "is-idle"} ${instant ? "is-instant" : ""}`}
      style={{ "--reveal-scale": timeline.scale }}
      data-settled={!!run && runSettled}
      data-prestige={
        session.ultraRebirths > 0 || session.rollbacks > 0 || undefined
      }
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
          <section
            ref={rollSection}
            className="active-roll"
            aria-label="Your roll"
          >
            {/* Every draw the roll took, side by side, until the best of them
                takes the centre and becomes the number that pays. */}
            {splitOpen && (
              <DrawStage
                key={`draw-${run.id}`}
                {...{ run, elapsed, timeline, reducedMotion, aura }}
                decided={splitDecided}
                scores={drawScores}
                roll={rollAgainControl}
                onPick={(number) => setSplitView({ run: run.id, number })}
              />
            )}
            {splitDraws && !splitOpen && !splitDetail && (
              <div className="draw-back-row">
                <button
                  type="button"
                  className="secondary-button draw-detail-back"
                  onClick={() => setSplitView({ run: run.id, number: null })}
                >
                  <LayoutGrid size={13} aria-hidden="true" />
                  All numbers
                </button>
              </div>
            )}
            {splitDetail ? (
              <DrawDetail
                key={`detail-${run.id}-${splitPick}`}
                number={splitPick}
                index={splitDraws.indexOf(splitPick)}
                count={splitDraws.length}
                scored={splitDetailScored}
                claim={claimFor(run, splitPick)}
                aura={aura}
                reducedMotion={reducedMotion}
                scale={timeline.scale}
                bankedMultiplier={bankedMultiplier}
                stacked={stacked}
                paidItems={paidItems}
                rollAgain={rollAgainControl}
                summary={
                  paidDetail ? (
                    <>
                      {sessionTotal}
                      {shareRowFor(splitDetailScored)}
                    </>
                  ) : null
                }
                openBadge={openBadge}
                theme={theme}
                onBack={() => setSplitView({ run: run.id, number: null })}
              />
            ) : (
              <NumberArtifact
                key={run.id}
                {...{ run, elapsed, timeline, reducedMotion, aura }}
                behind={splitOpen}
                dockedPet={companionSkillFiring ? session.activePet : null}
              />
            )}
            <div className="roll-announcement sr-only" role="status">
              {!digitsDone
                ? `Revealing ${splitDraws ? `${splitDraws.length} numbers` : "your number"}. ${timeline.digitTimes.filter((t) => elapsed >= t).length} of ${timeline.slots} digits settled.`
                : busy
                  ? `Number ${result.number}. Revealing badges.`
                  : `${result.number}, ${result.tier}, ${formatEP(result.totalEP)} EP.${
                      bonusEP
                        ? ` +${formatEP(bonusEP)} EP extra from your multipliers.`
                        : ""
                    }${
                      extraPicks.length
                        ? ` Your draw skills also banked ${extraPicks.length} more number${extraPicks.length === 1 ? "" : "s"}: ${extraPicks
                            .map(
                              (pick) =>
                                `${pick.number} for ${formatEP(Math.round(pick.scored.totalEP * bankedMultiplier))} EP`,
                            )
                            .join(", ")}.`
                        : ""
                    }`}
            </div>
            {!splitDetail && result.totalEP !== null && (
              <div
                className={`result-summary ${!digitsDone ? "is-spinning-summary" : ""} ${splitOpen ? "is-behind-draw" : ""}`}
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
                {!stacked && (
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
                )}
                {/* Every number a draw skill kept is paid: each one is a card
                    of its own, side by side, with the EP it banks. */}
                {digitsDone && stacked && <PaidNumbers items={paidItems} />}
                {sessionTotal}
                {rankKnown && shareRowFor(result)}
              </div>
            )}
            {!splitDetail && !splitOpen && rollAgainControl}
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
          {digitsDone && result.totalEP !== null && !splitDetail && (
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
