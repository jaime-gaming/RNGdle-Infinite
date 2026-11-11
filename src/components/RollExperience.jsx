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
import {
  notificationPermission,
  showRankNotification,
} from "../notifications.js";
import { rankMeetsMinimum } from "../settings.js";
import NumberBox from "./NumberBox";
import DrawStage, { DrawDetail, claimFor, useDrawScores } from "./DrawStage";
import PaidNumbers from "./PaidNumbers";
import { petById, petBonusLabel } from "../pets.js";
import { skillById, skillForPet } from "../skills.js";
import { walletMultiplier } from "../progress.js";
import { walletParts } from "../rack.js";
import { priorRollsOf } from "../deja-vu.js";
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
  dejaVu = false,
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
        dejaVu={dejaVu && rarityKnown}
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
  cloudSaved = false,
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
  const rankAlertRun = useRef(null);
  const rankAlertSent = useRef(null);
  const shareButton = useRef(null);
  const rollSection = useRef(null);
  const creditCallback = useRef(onComplete);
  const copiedTimer = useRef(null);
  const activeRun = useRef(null);
  activeRun.current = run?.id;
  const generateButton = useRef(null);
  creditCallback.current = onComplete;
  const result = run?.result;

  const paidPicks = run?.picks ?? [];
  const winnerSkill =
    run && Object.prototype.hasOwnProperty.call(run, "winnerSkill")
      ? run.winnerSkill
      : (paidPicks.find((pick) => pick.number === run?.number)?.skill ?? null);
  const stacked = paidPicks.length + (winnerSkill == null ? 1 : 0) > 1;
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

  const dejaVuCount = useMemo(
    () => (run ? priorRollsOf(session.history, run.result.number, run.id) : 0),
    [run, session.history],
  );
  const runSettled =
    !!run &&
    (session.receipts.includes(run.id) ||
      session.history.some((e) => e.type === "roll" && e.id === run.id));
  const awaitingSettlement =
    !!run && session.pendingRoll?.id === run.id && !runSettled;
  const busy = !!run && elapsed < timeline.end;

  const companionSkill = skillForPet(session.activePet);
  const companionSkillFiring =
    !!run &&
    !runSettled &&
    !!companionSkill &&
    (run.skills ?? []).includes(companionSkill.id);

  const firedSkills = run?.skills ?? [];
  const bankedMultiplier = result ? walletMultiplier(session, firedSkills) : 1;

  const keptNumbers = useMemo(
    () =>
      (run?.picks ?? []).filter(
        (pick) => pick.skill !== winnerSkill && pick.number != null,
      ),
    [run?.picks, winnerSkill],
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

  const paidItems = useMemo(() => {
    const picks = run?.picks ?? [];
    const cards = picks
      .filter((pick) => pick.number != null)
      .map((pick, index) => {
        const definition = skillById.get(pick.skill);
        const best = pick.skill === winnerSkill;
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
    if (!result || !picks.length || winnerSkill !== null) {
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
  }, [run?.picks, result, keptScores, bankedMultiplier, winnerSkill]);
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

  const waitWord = cooldown
    ? cooldownLabel(cooldownWindow, cooldownDeadline, gameNow())
    : "REVEAL IN";
  const instant = reducedMotion || instantCompletion;
  const digitsDone = !!run && elapsed >= timeline.collapse;

  const splitDraws = run && (run.draws ?? []).length > 1 ? run.draws : null;
  const splitDecision = useMemo(() => {
    if (!splitDraws) return 0;
    const last = timeline.badgeTimes.at(-1);
    return (
      (Number.isFinite(last) ? last : timeline.collapse) +
      0.35 * timeline.pulseMS
    );
  }, [splitDraws, timeline]);
  const [splitView, setSplitView] = useState({ run: null, index: null });
  const splitOwned = !!run && splitView.run === run.id;
  const splitIndex = splitOwned ? splitView.index : null;
  const splitPick =
    splitIndex != null && splitDraws ? (splitDraws[splitIndex] ?? null) : null;
  const splitOpen = !!splitDraws && splitIndex == null;
  const splitWinnerIndex =
    Number.isSafeInteger(run?.winnerIndex) &&
    run.winnerIndex >= 0 &&
    run.winnerIndex < (splitDraws?.length ?? 0)
      ? run.winnerIndex
      : Math.max(0, splitDraws?.indexOf(run?.number) ?? 0);
  const drawScores = useDrawScores(splitDraws ? run : null);

  const splitDetailScored =
    splitPick != null && splitIndex !== splitWinnerIndex
      ? (drawScores[splitPick] ??
        (splitPick === result?.number ? result : null))
      : null;
  const splitDetail = !!splitDetailScored;

  const splitClose = !!splitDraws && !splitOpen;
  const splitDecided = !!splitDraws && elapsed >= splitDecision;

  useEffect(() => {
    if (!splitOpen || !active) return;
    document.documentElement.classList.add("draw-takeover");
    return () => document.documentElement.classList.remove("draw-takeover");
  }, [splitOpen, active]);

  const splitRun = !!splitDraws;
  useEffect(() => {
    if (!splitRun || !active) return;
    document.documentElement.classList.add("draw-split");
    return () => document.documentElement.classList.remove("draw-split");
  }, [splitRun, active]);

  useEffect(() => {
    if (splitIndex == null || !rollSection.current) return;
    rollSection.current.scrollIntoView({
      block: "start",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [splitIndex, reducedMotion]);
  const rankKnown = !!run && elapsed >= timeline.rarity;
  const visibleCount = timeline.badgeTimes.filter((t) => elapsed >= t).length;
  const visibleGroups = groups.slice(-visibleCount || groups.length);
  const shownEP = visibleGroups.reduce((sum, g) => sum + g.lead.ep, 0);

  useEffect(() => {
    const alert = rankAlertRun.current;
    if (
      !run ||
      alert?.id !== run.id ||
      elapsed < timeline.end ||
      rankAlertSent.current === run.id
    )
      return;
    rankAlertSent.current = run.id;
    setAutoRoll(false);
    showRankNotification(alert.rank, {
      onClick: () => navigate("roll"),
      onStopAutoRoll: () => {
        setAutoRoll(false);
        writeAutoRoll(session.profile?.id, false);
      },
      autoRoll: alert.autoRoll,
    });
  }, [run?.id, elapsed, timeline.end, navigate]);

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
      awaitingSettlement ||
      splitClose ||
      session.offline?.batch ||
      session.pendingRoll
    )
      return;

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
    session.cooldownUntil,
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

    const start = gameNow();
    const alreadyElapsed = Math.max(0, start - run.startedAt);

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
    const minimumRank = preferences.notifyRank;
    const rolledRank = committed.result?.tier;
    const rankAlertEnabled =
      preferences.notifyRankEnabled && notificationPermission() === "granted";
    const rankMatched =
      rankAlertEnabled && rankMeetsMinimum(rolledRank, minimumRank);
    const draws = committed.draws ?? [];

    const autoRollWasActive = autoRoll;
    rankAlertRun.current = rankMatched
      ? { id: committed.id, rank: rolledRank, autoRoll: autoRollWasActive }
      : null;
    if (rankMatched) {
      setAutoRoll(false);
      if (draws.length > 1) {
        const winnerIndex =
          Number.isSafeInteger(committed.winnerIndex) &&
          committed.winnerIndex >= 0 &&
          committed.winnerIndex < draws.length
            ? committed.winnerIndex
            : Math.max(0, draws.indexOf(committed.number));
        setSplitView({ run: committed.id, index: winnerIndex });
      }
    }
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
        text: "The result could not be copied. Please try again.",
      });
    }
  }

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

      {!busy && runSettled && preferences.showGoalRecap && (
        <GoalRecap progress={session} runId={run.id} navigate={navigate} />
      )}
    </div>
  ) : null;

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

  const paidDetail = splitDetail && !!claimFor(run, splitIndex);
  return (
    <div
      className={`roll-experience ${run ? "is-result" : "is-idle"} ${instant ? "is-instant" : ""}`}
      style={{ "--reveal-scale": timeline.scale }}
      data-settled={!!run && runSettled}
      data-phase={
        !run ? "idle" : !digitsDone ? "digits" : busy ? "badges" : "complete"
      }
    >
      <div
        className={`roll-vignette ${busy && !reducedMotion ? "is-visible" : ""}`}
        aria-hidden="true"
      />

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
        prism={session.owned.includes("pass-axolotl")}
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
            {drawing
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
          {cloudSaved ? (
            <p className="signup-note">Backed up to your online account.</p>
          ) : session.profile ? (
            <p className="signup-note">
              Saved locally as {session.profile.username}.
            </p>
          ) : (
            (session.history?.length ?? 0) > 0 && (
              <p className="signup-note">
                Guest progress is temporary.{" "}
                <button onClick={openSignup}>Name a profile to keep it</button>
              </p>
            )
          )}
        </section>
      ) : (
        <>
          <section
            ref={rollSection}
            className="active-roll"
            aria-label="Your roll"
          >
            {splitOpen && (
              <DrawStage
                key={`draw-${run.id}`}
                {...{ run, elapsed, timeline, reducedMotion, aura }}
                decided={splitDecided}
                scores={drawScores}
                roll={rollAgainControl}
                onPick={(index) => setSplitView({ run: run.id, index })}
              />
            )}
            {splitDraws && !splitOpen && !splitDetail && (
              <div className="draw-back-row">
                <button
                  type="button"
                  className="secondary-button draw-detail-back"
                  onClick={() => setSplitView({ run: run.id, index: null })}
                >
                  <LayoutGrid size={13} aria-hidden="true" />
                  All numbers
                </button>
              </div>
            )}
            {splitDetail ? (
              <DrawDetail
                key={`detail-${run.id}-${splitIndex}`}
                number={splitPick}
                index={splitIndex}
                count={splitDraws.length}
                scored={splitDetailScored}
                claim={claimFor(run, splitIndex)}
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
                onBack={() => setSplitView({ run: run.id, index: null })}
              />
            ) : (
              <NumberArtifact
                key={run.id}
                {...{ run, elapsed, timeline, reducedMotion, aura }}
                dejaVu={dejaVuCount > 0}
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
                {digitsDone && rankKnown && dejaVuCount > 0 && (
                  <p className="deja-vu-note" data-deja-vu-count={dejaVuCount}>
                    <span aria-hidden="true">✦</span> Déjà vu · you rolled this
                    exact number{" "}
                    {dejaVuCount === 1 ? "once" : `${dejaVuCount} times`}{" "}
                    before. A look, not a bonus.
                  </p>
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

      {drawing && (
        <span className="sr-only" role="status">
          Drawing a random number
        </span>
      )}
      {!run && children}
      {(!run || (!busy && runSettled)) && (
        <RollProgress progress={session} runId={run?.id} navigate={navigate} />
      )}
    </div>
  );
}
