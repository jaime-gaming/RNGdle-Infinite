import { gameNow } from "../game-clock";
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
import NumberBox from "./NumberBox";
import "../roll.css";

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

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
  return (
    <div className={`artifact-stage aura-${aura}`} data-aura={aura}>
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
  theme,
  aura,
  openSignup,
}) {
  const settings = rollSettings(session.owned);
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
    Math.max(0, Math.ceil((session.cooldownUntil - gameNow()) / 1000)),
  );
  const reducedMotion = useReducedMotion();
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
  const awaitingSettlement =
    !!run &&
    session.pendingRoll?.id === run.id &&
    !session.receipts.includes(run.id);
  const busy = !!run && elapsed < timeline.end;
  const instant = reducedMotion || instantCompletion;
  const digitsDone = !!run && elapsed >= timeline.collapse;
  const rankKnown = !!run && elapsed >= timeline.rarity;
  const visibleCount = timeline.badgeTimes.filter((t) => elapsed >= t).length;
  const visibleGroups = groups.slice(-visibleCount || groups.length);
  const shownEP = visibleGroups.reduce((sum, g) => sum + g.lead.ep, 0);

  useEffect(() => {
    const until = Math.max(session.cooldownUntil, localCooldownUntil);
    const update = () =>
      setCooldown(Math.max(0, Math.ceil((until - gameNow()) / 1000)));
    update();
    if (until <= gameNow()) return;
    const timer = setInterval(() => {
      update();
      if (gameNow() >= until) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [session.cooldownUntil, localCooldownUntil]);

  useEffect(() => {
    if (!run || finishedRun.current === run.id) return;
    let stopped = false,
      timer;
    const start = performance.now();
    const alreadyElapsed = Math.max(0, gameNow() - run.startedAt);
    const cues = revealCueTimes(timeline);
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
      setCooldown(Math.max(0, Math.ceil((until - gameNow()) / 1000)));
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
        const time = alreadyElapsed + performance.now() - start;
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
      data-settled={!!run && session.receipts.includes(run.id)}
      data-phase={
        !run ? "idle" : !digitsDone ? "digits" : busy ? "badges" : "complete"
      }
    >
      <div
        className={`roll-vignette ${busy && !reducedMotion ? "is-visible" : ""}`}
        aria-hidden="true"
      />
      {!run ? (
        <section className="idle-roll" aria-label="Number generator">
          <NumberBox
            className="question-number"
            value="??????"
            aura={aura}
            aria-label="Your random number awaits"
          />
          <h1>One roll per day? Not here. Roll as often as you like.</h1>
          <button
            ref={generateButton}
            className={`generate ${cooldown || loading || drawing ? "cooling" : ""}`}
            disabled={loading || drawing || cooldown > 0}
            onClick={generate}
          >
            {loading
              ? "LOADING ROLL DATA…"
              : drawing
                ? "DRAWING…"
                : cooldown
                  ? `NEXT ROLL IN ${formatDuration(cooldown)}`
                  : error
                    ? "RETRY & ROLL"
                    : "GENERATE"}
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
            <span>·</span> {formatDuration(settings.cooldownMS / 1000)} cooldown
          </p>
          <p className="signup-note">
            {session.profile ? (
              `Saved locally as ${session.profile.username}.`
            ) : (
              <>
                Guest progress is temporary.{" "}
                <button onClick={openSignup}>Sign up to save</button>
              </>
            )}
          </p>
        </section>
      ) : (
        <>
          <section className="active-roll" aria-label="Your roll">
            <NumberArtifact
              key={run.id}
              {...{ run, elapsed, timeline, reducedMotion, aura }}
            />
            <div className="roll-announcement sr-only" role="status">
              {!digitsDone
                ? `Revealing your number. ${timeline.digitTimes.filter((t) => elapsed >= t).length} of ${timeline.slots} digits settled.`
                : busy
                  ? `Number ${result.number}. Revealing badges.`
                  : `${result.number}, ${result.tier}, ${formatEP(result.totalEP)} EP.`}
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
                          (elapsed >= timeline.sessionCount &&
                          !session.receipts.includes(run.id)
                            ? result.totalEP
                            : 0)
                        }
                        duration={1500 * timeline.scale}
                        reducedMotion={instant}
                      />{" "}
                      EP
                      {elapsed >= timeline.sessionCount &&
                        elapsed < timeline.end &&
                        !instant && (
                          <span className="floating-ep">
                            +{formatEP(result.totalEP)}
                          </span>
                        )}
                    </span>
                    <small>Your EP balance</small>
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
                      {copied ? "Copied!" : "Share"}
                    </button>
                    <span>
                      {busy ? (
                        "REVEALING YOUR ROLL"
                      ) : cooldown ? (
                        <>
                          NEXT ROLL IN <b>{formatDuration(cooldown)}</b>
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
                className={`generate ${cooldown || loading || drawing ? "cooling" : ""}`}
                disabled={
                  loading ||
                  drawing ||
                  busy ||
                  cooldown > 0 ||
                  awaitingSettlement ||
                  !!settleError
                }
                onClick={generate}
              >
                {drawing ? (
                  "DRAWING…"
                ) : cooldown ? (
                  <>
                    <Clock3 size={18} /> NEXT ROLL IN {formatDuration(cooldown)}
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
      {settleError && (
        <div className="roll-load-error" role="alert">
          {settleError} Your committed number is retained.{" "}
          <button className="secondary-button" onClick={retrySettlement}>
            Retry result settlement
          </button>
        </div>
      )}
      {(loading || drawing) && (
        <span className="sr-only" role="status">
          {loading
            ? "Loading full-range scoring data"
            : "Drawing a random number"}
        </span>
      )}
      {!run && children}
    </div>
  );
}
