import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Coins,
  DoorClosed,
  Flame,
  Ghost,
  Lock,
  Hourglass,
  ScrollText,
  KeyRound,
  LockKeyhole,
  Medal,
  Moon,
  MoonStar,
  ShoppingBag,
  Skull,
  Trophy,
  X,
} from "lucide-react";
import { RNGWEEN_WORLD_SKIN, rngweenCalendar } from "../rngween.js";
import { RNGWEEN_WORLD_MAX } from "../rngween-limited.js";
import {
  WORLD_ZONES,
  WORLD_SPEED_ITEMS,
  WORLD_POINT_EXCHANGE,
  WORLD_VALLEY_TARGET,
  worldZoneById,
  worldState,
  worldRevealMS,
  rngweenValleyUnlocked,
  worldZoneOpen,
  worldZoneBefore,
  WORLD_FRAGMENT_ZONES,
  worldFragmentCount,
  worldPointsAvailable,
  KEEP_ROLLING_COST,
} from "../rngween-world-zones.js";
import {
  WORLD_MINI_RULES,
  emptyWorldMini,
  scoreWorldNumber,
  worldPhaseComplete,
  worldPhaseGoals,
} from "../rngween-world-badges.js";
import { seasonNow } from "../season-clock.js";
import { hourlyView, hourlyTaskById } from "../rngween-hourly.js";
import { useMotionPreference, useSettings } from "../use-settings.jsx";
import { useSeasonFavicon } from "../use-season-favicon.js";
import { useModalDialog } from "../use-modal-dialog.js";
import NumberBox from "./NumberBox.jsx";
import WorldScenery from "./WorldScenery.jsx";
import {
  hasSeenRngweenWorldIntro,
  markRngweenWorldEntered,
  markRngweenWorldIntroSeen,
} from "../rngween-intro.js";
import WorldIntro from "./WorldIntro.jsx";
import ReaperFigure from "./ReaperFigure.jsx";
import ReaperDialog from "./ReaperDialog.jsx";
import RngweenHourly from "./RngweenHourly.jsx";
import WorldAuraTrial from "./WorldAuraTrial.jsx";
import WorldRecord from "./WorldRecord.jsx";
import WorldCollection, { WorldResultBadges } from "./WorldCollection.jsx";
import { Pumpkoin } from "./RngweenShop.jsx";
import { HexboundMark, PumpkinMark } from "./game-icons.jsx";
import "../rngween-limited.css";
import "../rngween-world.css";

const WORLD_TABS = [
  ["objectives", "Objectives", Medal],
  ["key", "Key & prize", KeyRound],
  ["commissions", "Commissions", Hourglass],
  ["record", "Record", Trophy],
];
// When the Reaper deals again, for the locked Commissions tab. The dates are
// the calendar's: Oct 21–24 and Nov 1–3 UTC.
function commissionsReopen(now) {
  const calendar = rngweenCalendar(now);
  if (!Number.isFinite(now)) return "";
  if (now < calendar.limitedStartsAt) return "Opens Oct 21";
  if (now < calendar.endsAt) return "Back Nov 1";
  return "Closed";
}
const ZONE_ICONS = {
  "pumpkin-patch": PumpkinMark,
  graveyard: Skull,
  "haunted-house": DoorClosed,
  "blood-moon-ridge": MoonStar,
  valley: Flame,
};
const SPEED_ICONS = [Moon, Clock3, Hourglass];
// Scenery never consumes gameplay randomness.

// The strip behind a hidden digit: "?" first so a still frame (reduced
// motion, screenshots) reads as unknown, then three 0–9 loops. The reel is
// scrolled by a CSS animation that ends on the real digit in the last loop,
// so each slot slows down and lands exactly where the reveal will show it.
// The number was decided when the roll started; the reel only displays it.
const REEL = ["?", ...Array.from({ length: 30 }, (_, i) => String(i % 10))];
const reelLanding = (digit) => 21 + Number(digit);

function useRevealClock(now, pending, reduced) {
  const [clock, setClock] = useState(() => seasonNow() ?? now);
  useEffect(() => {
    setClock(seasonNow() ?? now);
    if (!pending) return;
    const tick = () => setClock(seasonNow() ?? now);
    const timer = window.setInterval(tick, reduced ? 250 : 80);
    return () => window.clearInterval(timer);
  }, [now, pending?.id, reduced]);
  return clock;
}

// CLEANUP Nov 4, 2026: remove this event-only view and speed shelf. Permanent
// Hexbound remains in Shop; saved pending outcomes are settled/retired safely.
export default function RngweenWorld({
  progress,
  now,
  onAction,
  onBack,
  onShop,
  onTasks,
  openSignup,
  warning,
  notify,
}) {
  const world = worldState(progress.rngweenLimited);
  const limited = progress.rngweenLimited;
  const drawn = limited?.drawn ?? [];
  // The World shop runs on World points: every zone's badge points together,
  // minus what the shop already took. Pumpkoins never enter this page.
  const wallet = worldPointsAvailable(limited);
  const reduced = useMotionPreference();
  // This page renders outside the app shell, so it carries the seasonal tab
  // icon itself. The World is always a night place; the Halloween icon follows
  // the same rule as the rest of the site (decorated and Halloween mode on).
  const { settings } = useSettings();
  useSeasonFavicon(rngweenCalendar(now).decorated && settings.halloweenMode);
  const [selected, setSelected] = useState(
    () => world.pending?.zone ?? world.last?.zone ?? "pumpkin-patch",
  );
  const [shopOpen, setShopOpen] = useState(false);
  const [reaperOpen, setReaperOpen] = useState(false);
  // The stage is always on screen; everything else sits in four short tabs
  // under it: objectives, key and prize, commissions, record. The fine print lives
  // in one line under the panel instead of a tab of its own.
  const [tab, setTab] = useState("objectives");
  // Being here once is enough for the home gate to skip the Reaper next time.
  useEffect(() => {
    markRngweenWorldEntered();
  }, []);
  // The opening plays once, on the first visit; it can be watched again.
  // A save that already has World rounds (another device, a linked account)
  // skips it too: the opening is for players who have never been inside.
  const [intro, setIntro] = useState(
    () =>
      !hasSeenRngweenWorldIntro() &&
      world.visited.length === 0 &&
      !world.pending,
  );
  const closeIntro = () => {
    markRngweenWorldIntroSeen();
    setIntro(false);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [keepRolling, setKeepRolling] = useState(false);
  const keepRollingInterval = useRef(null);
  const sending = useRef(false);
  const shopDialog = useModalDialog(shopOpen);
  const pending = world.pending;
  const zone = worldZoneById.get(pending?.zone ?? selected);
  const ZoneIcon = ZONE_ICONS[zone.id];
  const clock = useRevealClock(now, pending, reduced);
  const stats = world.mini?.[zone.id] ?? emptyWorldMini()[zone.id];
  const savedLast = stats.last
    ? {
        ...stats.last,
        id: `rngween-2026:world:${stats.last.serial}`,
        zone: zone.id,
        rules: WORLD_MINI_RULES,
        revealsAt: stats.last.at,
      }
    : null;
  const globalLast = world.last?.zone === zone.id ? world.last : null;
  const last =
    globalLast && (!savedLast || globalLast.serial > savedLast.serial)
      ? globalLast
      : (savedLast ?? globalLast);
  const result =
    last?.rules === WORLD_MINI_RULES
      ? scoreWorldNumber(zone.id, last.number)
      : null;
  const aura = progress.owned.includes(progress.equipped)
    ? progress.equipped
    : "none";
  const live =
    rngweenCalendar(now).limitedPhase === "active" && !limited?.retired;
  const key = rngweenValleyUnlocked(limited);
  // Track whether the player left the Valley while keep rolling was on.
  // If they exit and come back, we do not auto-restart the chain.
  const valleyExited = useRef(false);
  // Keep rolling: a toggle that chains Valley rolls while the tab stays open.
  // It stops on 6666, on tab hide, on zone change, or when the player turns it off.
  // Each chained roll spends a small fixed block of World points.
  useEffect(() => {
    if (!keepRolling || zone.id !== "valley" || !key || !progress.profile) {
      if (keepRollingInterval.current) {
        clearTimeout(keepRollingInterval.current);
        keepRollingInterval.current = null;
      }
      // If the player left the Valley (or never entered), remember the exit.
      if (zone.id !== "valley") {
        valleyExited.current = true;
      }
      return;
    }
    // If the player exited the Valley while keep rolling was on, do not restart.
    if (valleyExited.current) {
      setKeepRolling(false);
      return;
    }
    if (pending) return; // wait for the current reveal to settle

    function scheduleNext() {
      // Re-check at execution time: the toggle may have been turned off
      // between scheduling and execution, or the zone may have changed.
      if (!keepRolling || zone.id !== "valley" || !key) {
        keepRollingInterval.current = null;
        return;
      }
      if (pending) {
        // Still revealing; reschedule after a short wait.
        keepRollingInterval.current = setTimeout(scheduleNext, 50);
        return;
      }
      keepRollingInterval.current = setTimeout(() => {
        // Final check before starting the roll.
        if (!keepRolling || zone.id !== "valley" || !key || pending) {
          keepRollingInterval.current = null;
          return;
        }
        run(
          {
            type: "rngween-world-keep-rolling",
            zone: "valley",
          },
          undefined,
        ).catch((error) => {
          if (
            error?.message?.includes("World points") ||
            error?.message?.includes("not enough")
          ) {
            setKeepRolling(false);
            notify({
              kind: "error",
              text: "Not enough World points to keep rolling. Buy reveal upgrades or trade points for EP.",
            });
          }
        });
      }, 50);
    }

    scheduleNext();
    return () => {
      if (keepRollingInterval.current) {
        clearTimeout(keepRollingInterval.current);
        keepRollingInterval.current = null;
      }
    };
  }, [keepRolling, zone.id, key, progress.profile, pending, run]);

  // Stop the chain when 6666 appears or the tab goes hidden.
  useEffect(() => {
    if (!keepRolling) return;
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        setKeepRolling(false);
      }
    }
    // Stop if 6666 just appeared.
    if (last?.zone === "valley" && last.number === WORLD_VALLEY_TARGET) {
      setKeepRolling(false);
      return;
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [keepRolling, last]);

  const fragments = worldFragmentCount(world);
  const fragmentTotal = WORLD_FRAGMENT_ZONES.length;
  const exhausted = drawn.length >= RNGWEEN_WORLD_MAX;
  const duration = pending
    ? pending.revealsAt - pending.startedAt
    : worldRevealMS(limited);
  const elapsed = pending
    ? Math.max(
        0,
        Math.min(duration, (clock ?? pending.startedAt) - pending.startedAt),
      )
    : duration;
  const fraction = duration ? elapsed / duration : 0;
  const remaining = pending ? Math.max(0, duration - elapsed) : 0;
  const visibleCount = pending
    ? Math.min(zone.digits - 1, Math.floor(fraction * zone.digits))
    : zone.digits;
  const outcome = pending ?? last;
  // How far into the reveal the reels were when this pending roll first
  // rendered. Fixed per roll so the CSS animation is not restarted each tick.
  const reelStartRef = useRef({ id: null, at: 0 });
  if (pending && reelStartRef.current.id !== pending.id)
    reelStartRef.current = { id: pending.id, at: elapsed };
  const reelStart = reelStartRef.current.at;
  const digits = outcome
    ? String(outcome.number).padStart(zone.digits, "0")
    : "?".repeat(zone.digits);
  const jackpot =
    !pending && last?.zone === "valley" && last.number === WORLD_VALLEY_TARGET;
  const hourly = hourlyView(progress, now);
  // One plain sentence that says what to do next, so the page never has to
  // be decoded from its parts. It follows the path: fragments, key, 6666.
  const hexbound =
    limited.skinEarned || progress.owned.includes(RNGWEEN_WORLD_SKIN.id);
  const goalsDone = (id) =>
    worldPhaseGoals(id, world.mini?.[id]).filter((goal) => goal.complete)
      .length;
  const nextStep = !progress.profile
    ? {
        text: "Create a profile first: World progress only saves to an account.",
        zone: null,
      }
    : hexbound
      ? {
          text: "Hexbound is yours. Keep rolling for badges and the Record.",
          zone: "valley",
        }
      : key
        ? {
            text: "The key is forged. Roll in the Valley until 6666 turns up.",
            zone: "valley",
          }
        : fragments === fragmentTotal
          ? {
              text: "All four fragments found. Forge the key in Key & prize.",
              zone: null,
              tab: "key",
            }
          : (() => {
              const next = WORLD_FRAGMENT_ZONES.find(
                (id) => !world.fragments[id],
              );
              const item = worldZoneById.get(next);
              return {
                text: `Clear the three ${item.name} objectives (${goalsDone(next)}/3) to earn key fragment ${fragments + 1} of ${fragmentTotal}.`,
                zone: next,
              };
            })();
  // A fragment lands at the end of a reveal, with no click to answer; say
  // it out loud once so the player knows the zone is done and where to go.
  const seenFragments = useRef(fragments);
  useEffect(() => {
    if (fragments > seenFragments.current) {
      notify({
        kind: "milestone",
        title:
          fragments >= fragmentTotal
            ? "All four key fragments earned"
            : `Key fragment ${fragments} of ${fragmentTotal} earned`,
        text:
          fragments >= fragmentTotal
            ? "Open Key & prize to forge the Challenge key and unlock the Valley."
            : `${fragmentTotal - fragments} more to go. The next zone is open.`,
      });
    }
    seenFragments.current = fragments;
  }, [fragments]);
  // The board can close while the tab is open (midnight UTC); fall back
  // rather than leave an empty panel under a locked tab.
  useEffect(() => {
    if (tab === "commissions" && !hourly.open) setTab("objectives");
  }, [tab, hourly.open]);
  const commissionPaid =
    !pending && last && world.last?.serial === last.serial
      ? progress.history
          .filter(
            (entry) =>
              entry.type === "rngween-hourly" &&
              entry.at >= last.revealsAt &&
              hourlyTaskById.get(entry.taskId)?.source === "world",
          )
          .reduce((sum, entry) => sum + entry.pumpkoins, 0)
      : 0;
  async function run(action, success) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await onAction(action);
      if (!result?.ok)
        setError(result?.message ?? "Nothing was saved. Try again.");
      else if (success) setNotice(success);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function closeShop() {
    if (!sending.current) {
      setShopOpen(false);
      setError("");
    }
  }
  const resultText = !last
    ? `Roll for your first ${zone.name} badges.`
    : jackpot
      ? "6666 — Hexbound unlocked."
      : result
        ? `${result.tier[0].toUpperCase() + result.tier.slice(1)} · +${result.points.toLocaleString("en-US")} ${zone.name} points`
        : "Saved legacy result settled. Existing rewards are kept.";

  return (
    <main
      className={`rngween-world${reduced ? " world-motion-reduced" : ""}`}
      style={{ "--world-accent": zone.accent }}
    >
      <header className="world-header">
        <button className="world-back" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Roll
        </button>
        <button
          className="world-talk-button"
          onClick={() => setReaperOpen(true)}
          aria-haspopup="dialog"
        >
          <ReaperFigure />
          Talk to The Reaper
        </button>
        <span className="world-event-date">RNGween 2026 · until Nov 3 UTC</span>
        <button
          className="world-wallet"
          aria-label={`World shop · ${wallet.toLocaleString("en-US")} World points`}
          onClick={() => {
            setShopOpen(true);
            setError("");
            setNotice("");
          }}
          aria-haspopup="dialog"
        >
          <Medal size={20} />
          <strong data-world-points-total>
            {wallet.toLocaleString("en-US")}
          </strong>
          <ShoppingBag size={16} />
          <span>World shop</span>
        </button>
      </header>
      <div className="world-heading">
        <h1>RNGween World</h1>
        <p>
          {key
            ? "Valley unlocked. Find 6666 to earn Hexbound."
            : "Four zones, four key fragments. The key opens the Valley. 6666 in the Valley earns Hexbound."}
        </p>
        <div className="world-next-step" data-world-next-step>
          <span className="world-eyebrow">Next step</span>
          <p>{nextStep.text}</p>
          {nextStep.zone && nextStep.zone !== zone.id && (
            <button
              className="secondary-button"
              disabled={!!pending || busy}
              onClick={() => {
                setSelected(nextStep.zone);
                setTab("objectives");
              }}
            >
              Go to {worldZoneById.get(nextStep.zone).name}
              <ArrowRight size={13} />
            </button>
          )}
          {nextStep.tab && tab !== nextStep.tab && (
            <button
              className="secondary-button"
              onClick={() => setTab(nextStep.tab)}
            >
              Open Key & prize <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      {warning && (
        <p className="world-alert" role="alert">
          {warning}
        </p>
      )}
      {!progress.profile && (
        <div className="world-guest">
          <Ghost size={22} />
          <p>
            The World is open to everyone. Create a profile to save rolls, key
            fragments, badge collections and your permanent prize.
          </p>
          <button className="primary-button" onClick={openSignup}>
            Create profile
          </button>
        </div>
      )}
      <nav className="world-zones" aria-label="World phases">
        {WORLD_ZONES.map((item) => {
          const Icon = ZONE_ICONS[item.id];
          const active = zone.id === item.id;
          const complete = worldPhaseComplete(item.id, world.mini?.[item.id]);
          const ready = item.fragment
            ? world.fragments[item.fragment]
            : item.id === "valley"
              ? key
              : complete;
          const open = worldZoneOpen(limited, item.id);
          const before = worldZoneBefore(item.id);
          return (
            <button
              key={item.id}
              className={`world-zone${active ? " is-selected" : ""}${open ? "" : " is-locked"}`}
              style={{ "--zone-accent": item.accent }}
              data-open={open ? "true" : "false"}
              aria-pressed={active}
              disabled={!!pending || busy}
              onClick={() => {
                setSelected(item.id);
                setError("");
                setNotice("");
              }}
              data-world-zone={item.id}
            >
              <span className="world-zone-glyph">
                <Icon size={24} />
              </span>
              <span className="world-zone-number">{item.phase}</span>
              <strong>{item.name}</strong>
              <small>
                {item.fragment ? (
                  ready ? (
                    <>
                      <Check size={12} />
                      Fragment found
                    </>
                  ) : !open ? (
                    <>
                      <LockKeyhole size={12} />
                      Needs {before.name} fragment
                    </>
                  ) : (
                    `Fragment ${item.phase} · ${goalsDone(item.id)}/3 done`
                  )
                ) : ready ? (
                  <>
                    <KeyRound size={12} />
                    Challenge unlocked
                  </>
                ) : (
                  <>
                    <LockKeyhole size={12} />
                    Challenge key needed
                  </>
                )}
              </small>
            </button>
          );
        })}
      </nav>
      <section
        className={`world-playground${pending ? " is-revealing" : ""}${jackpot ? " is-jackpot" : ""}`}
        data-zone={zone.id}
        aria-labelledby="world-zone-title"
        style={{ "--reveal": pending ? fraction.toFixed(2) : 0 }}
      >
        <div className="world-scene" key={zone.id}>
          <WorldScenery zone={zone.id} />
          <span className="world-fog world-fog-back" />
          <span className="world-fog world-fog-front" />
          <span className="world-wisps" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <i key={i} style={{ "--wisp": i }} />
            ))}
          </span>
        </div>
        <div className="world-zone-heading" key={`heading:${zone.id}`}>
          <span className="world-eyebrow">
            <ZoneIcon size={15} />
            Phase 0{zone.phase} · {zone.subtitle}
          </span>
          <h2 id="world-zone-title">{zone.name}</h2>
        </div>
        {pending && pending.rules !== WORLD_MINI_RULES && (
          <p className="world-legacy-note">
            Finishing a saved roll under its original rules. Your next roll
            starts the badge hunt.
          </p>
        )}
        <div className="world-result-stage">
          <div
            className={`world-summoning-circle${pending ? " is-spinning" : ""}`}
            aria-hidden="true"
          >
            <span>✦</span>
            <span>✧</span>
            <span>✦</span>
            <span>✧</span>
            <span>✦</span>
            <span>✧</span>
          </div>
          <NumberBox
            value={"?".repeat(zone.digits)}
            aura={aura}
            auraLayout="contained"
            tier={
              !pending && result
                ? result.tier === "legendary"
                  ? "mythic"
                  : result.tier
                : "neutral"
            }
            className={`world-number-box${pending ? " is-revealing" : last ? " is-landed" : ""}`}
            aria-label={
              pending || !last
                ? "Waiting for a World result"
                : `World number ${last.number}`
            }
            data-world-result={
              pending ? "pending" : last ? "revealed" : "empty"
            }
          >
            <span className="world-result-digits" aria-hidden="true">
              {Array.from(digits).map((digit, i) => {
                const shown = (!pending || i < visibleCount) && !!outcome;
                return (
                  <span
                    key={`${outcome?.serial ?? "empty"}:${i}:${shown}`}
                    className={`world-digit${!shown ? " is-masked" : " is-revealed"}${shown && zone.id === "valley" && digit === "6" ? " world-six" : ""}`}
                    style={{ "--slot": i }}
                  >
                    {shown ? (
                      digit
                    ) : !pending ? (
                      "?"
                    ) : (
                      <span
                        className="world-reel"
                        style={{
                          "--land": reelLanding(digit),
                          // Slot i lands when its reveal moment arrives; the
                          // last slot runs to the deadline. A negative delay
                          // resumes mid-spin after a reload.
                          "--spin": `${
                            i === zone.digits - 1
                              ? duration
                              : Math.round((duration * (i + 1)) / zone.digits)
                          }ms`,
                          "--since": `-${reelStart}ms`,
                        }}
                      >
                        {REEL.map((glyph, r) => (
                          <i key={r}>{glyph}</i>
                        ))}
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          </NumberBox>
        </div>
        <div
          className="world-result-copy"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {pending ? (
            <p>Revealing the {zone.name} number…</p>
          ) : (
            <p
              className={
                jackpot || (result && result.tier !== "common")
                  ? "world-win-copy"
                  : ""
              }
            >
              {resultText}
            </p>
          )}
        </div>
        {!pending && result && (
          <WorldResultBadges
            result={result}
            counts={
              last && world.last?.serial === last.serial ? stats.counts : null
            }
          />
        )}
        {pending ? (
          <div className="world-reveal-timer">
            <div>
              <Clock3 size={14} />
              <span>{remaining > 0 ? "Revealing…" : "Saving the result…"}</span>
              <strong aria-hidden="true">
                {(remaining / 1000).toFixed(1)}s
              </strong>
            </div>
            <progress
              value={elapsed}
              max={duration}
              aria-label="World reveal progress"
            />
          </div>
        ) : (
          <div className="world-roll-controls">
            {zone.id !== "valley" && !worldZoneOpen(limited, zone.id) ? (
              <div className="world-challenge-lock" data-zone-lock={zone.id}>
                <LockKeyhole size={19} />
                <p>
                  The path goes in order. Earn the{" "}
                  {worldZoneBefore(zone.id).name} key fragment to open{" "}
                  {zone.name}.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSelected(worldZoneBefore(zone.id).id);
                    setError("");
                    setNotice("");
                  }}
                >
                  Go to {worldZoneBefore(zone.id).name} <ArrowRight size={14} />
                </button>
              </div>
            ) : zone.id === "valley" && !key ? (
              <div className="world-challenge-lock">
                <LockKeyhole size={19} />
                {fragments === fragmentTotal ? (
                  <>
                    <p>
                      All four fragments are yours. Forge the key in the Key &
                      prize tab and the Valley opens.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => setTab("key")}
                    >
                      Forge the key <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Clear the four zones before this one, then forge the key
                      in the Key & prize tab. Or buy one in the Limited Shop.
                    </p>
                    <button className="secondary-button" onClick={onShop}>
                      View key <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                className="world-roll-button"
                disabled={
                  busy ||
                  !live ||
                  !progress.profile ||
                  (zone.id === "valley" && exhausted)
                }
                onClick={() =>
                  run({
                    type: "rngween-world-roll",
                    zone: zone.id,
                  })
                }
              >
                <ZoneIcon size={20} />
                {busy
                  ? "Saving the roll…"
                  : exhausted && zone.id === "valley"
                    ? "Valley completed"
                    : zone.id === "valley"
                      ? "Roll in the Valley"
                      : `Roll in ${zone.name}`}
                <span>{duration / 1000}s reveal</span>
              </button>
            )}
            {zone.id === "valley" && key && !exhausted && !pending && (
              <button
                className={`world-keep-rolling${keepRolling ? " is-active" : ""}`}
                type="button"
                onClick={() => {
                  if (keepRolling) {
                    setKeepRolling(false);
                  } else {
                    setKeepRolling(true);
                  }
                }}
                disabled={busy || !live || !progress.profile}
                title="Chain Valley rolls while this tab stays open. Costs 50 World points per roll. Stops on 6666, zone change, or when you close this page."
              >
                <Flame size={16} />
                {keepRolling ? "Stop chain" : "Keep rolling"}
                <small className="world-keep-rolling-cost">
                  {worldPointsAvailable(limited) >= KEEP_ROLLING_COST.points
                    ? `${KEEP_ROLLING_COST.points} pts/roll · ${worldPointsAvailable(limited)} available`
                    : `Need ${KEEP_ROLLING_COST.points} pts (have ${worldPointsAvailable(limited)})`}
                </small>
              </button>
            )}
            <small>
              {zone.id !== "valley"
                ? `1–${zone.max} · repeats allowed · free rolls`
                : `${(RNGWEEN_WORLD_MAX - drawn.length).toLocaleString("en-US")} unseen numbers remain${drawn.length > 0 ? ` · ${drawn.length} rolled${drawn.includes(WORLD_VALLEY_TARGET) ? "" : ", 6666 not yet"}` : ""}
                  · {drawn.length - (drawn.includes(WORLD_VALLEY_TARGET) ? 1 : 0)} discarded${drawn.includes(WORLD_VALLEY_TARGET) ? ", 6666 found" : ""}`}
            </small>
          </div>
        )}
        {!!commissionPaid && (
          <p className="world-commission-paid" role="status">
            <Pumpkoin size={15} />
            Commission complete: +{commissionPaid} Pumpkoins.
          </p>
        )}
        {!shopOpen && error && (
          <p className="world-alert" role="alert">
            {error}
          </p>
        )}
        {!shopOpen && notice && (
          <p className="world-notice" role="status">
            {notice}
          </p>
        )}
        <div className="world-zone-footer">
          <span>
            {world.rounds[zone.id].toLocaleString("en-US")}{" "}
            {world.rounds[zone.id] === 1 ? "round" : "rounds"} completed
          </span>
          <span>
            <Clock3 size={13} />
            {worldRevealMS(limited) / 1000}s on future rolls
          </span>
          <button
            onClick={() => {
              setShopOpen(true);
              setError("");
              setNotice("");
            }}
          >
            Upgrade reveal speed <ArrowRight size={12} />
          </button>
          <button onClick={() => setIntro(true)}>
            Watch the opening again
          </button>
        </div>
      </section>
      {intro && <WorldIntro onDone={closeIntro} />}
      <div className="world-tabs" role="tablist" aria-label="World sections">
        {WORLD_TABS.map(([id, label, Icon]) => {
          // Commissions stay visible but locked while the Reaper is not
          // dealing, so the tab says when to come back instead of opening
          // on an empty room.
          const locked = id === "commissions" && !hourly.open;
          return (
            <button
              key={id}
              role="tab"
              id={`world-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`world-panel-${id}`}
              aria-disabled={locked || undefined}
              disabled={locked}
              title={
                locked
                  ? "The Reaper deals commissions on Oct 21–24 and Nov 1–3 (UTC)."
                  : undefined
              }
              className={`${tab === id ? "is-selected" : ""} ${locked ? "is-locked" : ""}`}
              onClick={() => setTab(id)}
              data-world-tab={id}
            >
              {locked ? <Lock size={15} /> : <Icon size={15} />}
              <span>{label}</span>
              {locked && (
                <small className="world-tab-when">
                  {commissionsReopen(now)}
                </small>
              )}
              {id === "key" && !key && fragments === fragmentTotal && (
                <i className="world-tab-dot" aria-hidden="true" />
              )}
              {id === "commissions" &&
                hourly.active &&
                hourly.slots.some((slot) => slot.claimable) && (
                  <i className="world-tab-dot" aria-hidden="true" />
                )}
            </button>
          );
        })}
      </div>
      <div
        key={tab}
        className="world-panel"
        role="tabpanel"
        id={`world-panel-${tab}`}
        aria-labelledby={`world-tab-${tab}`}
      >
        {tab === "objectives" && (
          <>
            <WorldCollection
              zone={zone}
              stats={stats}
              fragmentOwned={
                zone.fragment ? world.fragments[zone.fragment] : false
              }
              drawn={drawn}
            />
            <WorldAuraTrial
              phase={zone}
              progress={progress}
              now={now}
              onTasks={onTasks}
              busy={busy}
              onEquip={(id) =>
                run(
                  { type: "equip", id },
                  "Aura equipped. Your saved roll is unchanged.",
                )
              }
            />
            {worldPhaseComplete(zone.id, stats) && zone.phase < 5 && (
              <div className="world-phase-continue">
                <Check size={15} />
                <span>Phase 0{zone.phase} objectives cleared.</span>
                <button
                  className="secondary-button"
                  disabled={!!pending || busy}
                  onClick={() => setSelected(WORLD_ZONES[zone.phase].id)}
                >
                  Continue to {WORLD_ZONES[zone.phase].name}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            {!key && fragments === fragmentTotal && (
              <div className="world-phase-continue">
                <KeyRound size={15} />
                <span>All four fragments found.</span>
                <button
                  className="secondary-button"
                  onClick={() => setTab("key")}
                >
                  Forge the key <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
        {tab === "key" && (
          <>
            <section
              className="world-key-forge"
              aria-labelledby="world-key-title"
            >
              <div className="world-key-symbol">
                <KeyRound size={32} />
                <span>
                  {key ? <Check size={13} /> : `${fragments}/${fragmentTotal}`}
                </span>
              </div>
              <div>
                <span className="world-eyebrow">The Valley challenge</span>
                <h2 id="world-key-title">
                  {key ? "Your key is ready" : "Forge the challenge key"}
                </h2>
                <p>
                  {key
                    ? "The key unlocks the Valley until Nov 3 UTC. It is not consumed."
                    : "Clear the three objectives in each of the four zones, then combine their fragments for free."}
                </p>
                <div className="world-fragments">
                  {WORLD_ZONES.filter((item) => item.fragment).map((item) => (
                    <span
                      key={item.id}
                      className={world.fragments[item.id] ? " is-found" : ""}
                    >
                      {world.fragments[item.id] ? (
                        <Check size={13} />
                      ) : (
                        <KeyRound size={13} />
                      )}{" "}
                      {item.name} fragment
                    </span>
                  ))}
                </div>
              </div>
              {key ? (
                <button
                  className="secondary-button"
                  disabled={!!pending || busy}
                  onClick={() => {
                    setSelected("valley");
                    setTab("objectives");
                  }}
                >
                  Enter Valley <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={
                    fragments < fragmentTotal ||
                    busy ||
                    !live ||
                    !progress.profile
                  }
                  onClick={() =>
                    run(
                      { type: "forge-rngween-key" },
                      "Key forged. Valley of Horrors unlocked.",
                    )
                  }
                >
                  Forge key · free
                </button>
              )}
            </section>
            <div className="world-lower-shelf">
              <div className="world-prize-note">
                <HexboundMark size={35} />
                <div>
                  <strong>Hexbound</strong>
                  <p>
                    {limited.skinEarned ||
                    progress.owned.includes(RNGWEEN_WORLD_SKIN.id)
                      ? "Unlocked. Preview or equip it in Shop."
                      : "Never sold. Find 6666 in the Valley."}
                  </p>
                </div>
                <button onClick={onShop}>
                  Preview <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
        {tab === "record" && <WorldRecord progress={progress} now={now} />}
        {tab === "commissions" && hourly.open && (
          <RngweenHourly
            progress={progress}
            now={now}
            inWorld
            openSignup={openSignup}
            onAction={onAction}
            notify={notify}
          />
        )}
      </div>
      <p className="world-fine-print">
        <ScrollText size={13} aria-hidden="true" />
        World rolls pay zone points and badges, never EP or Pumpkoins. Reveal
        upgrades are bought with those points and change the wait, not the odds.
        The World opens on the dark theme and leaves yours as it was. Everything
        here retires after Nov 3 UTC; Hexbound and owned auras stay forever.
      </p>
      <ReaperDialog
        open={reaperOpen}
        onClose={() => setReaperOpen(false)}
        phaseId={zone.id}
        progress={progress}
        now={now}
        onAction={onAction}
        onWorld={() => setReaperOpen(false)}
        onTasks={onTasks}
        onShop={onShop}
        openSignup={openSignup}
      />
      <dialog
        className="world-shop-dialog"
        ref={shopDialog}
        aria-labelledby="world-shop-title"
        onCancel={(event) => {
          event.preventDefault();
          closeShop();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeShop();
        }}
      >
        {shopOpen && (
          <>
            <button
              className="world-shop-close"
              aria-label="Close World shop"
              disabled={busy}
              onClick={closeShop}
            >
              <X size={19} />
            </button>
            <span className="world-eyebrow">
              <ShoppingBag size={15} />
              RNGween World · internal shop
            </span>
            <h2 id="world-shop-title">World shop</h2>
            <p>
              Buy upgrades in order to shorten reveals in all five zones. They
              cost World points, the badge points of all your zones together,
              apply from the next roll and expire after Nov 3 UTC.
            </p>
            <div className="world-shop-wallet">
              <Medal size={22} />
              <strong>
                {wallet.toLocaleString("en-US")} World points available
              </strong>
              <span>{worldRevealMS(limited) / 1000}s current reveal</span>
            </div>
            <div className="world-speed-items">
              {WORLD_SPEED_ITEMS.map((item, i) => {
                const Icon = SPEED_ICONS[i];
                const owned = world.upgrades.includes(item.id);
                const available = world.upgrades.length === i;
                return (
                  <article
                    className={`world-speed-item${owned ? " is-owned" : ""}`}
                    key={item.id}
                    data-world-upgrade={item.id}
                  >
                    <span className="world-speed-icon">
                      <Icon size={28} />
                    </span>
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.detail}</p>
                      <small>
                        {i === 0
                          ? "10 → 8 seconds"
                          : i === 1
                            ? "8 → 5 seconds"
                            : "5 → 2 seconds"}
                      </small>
                    </div>
                    <strong className="world-upgrade-price">
                      <Medal size={16} />
                      {item.pointPrice.toLocaleString("en-US")} pts
                    </strong>
                    <button
                      className={owned ? "secondary-button" : "primary-button"}
                      disabled={
                        owned ||
                        !available ||
                        busy ||
                        !live ||
                        !progress.profile ||
                        wallet < item.pointPrice
                      }
                      onClick={() =>
                        run(
                          { type: "buy-rngween-world", id: item.id },
                          `${item.name} purchased. Future World reveals take ${item.revealMS / 1000} seconds.`,
                        )
                      }
                    >
                      {owned ? (
                        <>
                          <Check size={14} />
                          Owned
                        </>
                      ) : !available ? (
                        "Previous upgrade required"
                      ) : (
                        `Buy ${item.name}`
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
            {/* Spare points can leave the World in small fixed blocks. The
                trade comes out of the same spent pool as the upgrades, so
                records and badges stay whole. */}
            <section
              className="world-exchange"
              aria-labelledby="world-exchange-title"
            >
              <h3 id="world-exchange-title">Trade spare points</h3>
              <p>
                {WORLD_POINT_EXCHANGE.points} World points at a time. Your zone
                records and badges keep every point you earned.
              </p>
              <div className="world-exchange-options">
                {[
                  {
                    to: "pumpkoins",
                    label: `${WORLD_POINT_EXCHANGE.pumpkoins} Pumpkoins`,
                    Icon: Pumpkoin,
                    note: "Pumpkoins expire after Nov 3 UTC",
                  },
                  {
                    to: "ep",
                    label: `${WORLD_POINT_EXCHANGE.ep.toLocaleString("en-US")} EP`,
                    Icon: Coins,
                    note: "Added to your EP balance",
                  },
                ].map(({ to, label, Icon, note }) => (
                  <button
                    key={to}
                    className="secondary-button world-exchange-option"
                    data-world-exchange={to}
                    disabled={
                      busy ||
                      !live ||
                      !progress.profile ||
                      wallet < WORLD_POINT_EXCHANGE.points
                    }
                    onClick={() =>
                      run(
                        { type: "exchange-world-points", to, blocks: 1 },
                        `Traded ${WORLD_POINT_EXCHANGE.points} World points for ${label}.`,
                      )
                    }
                  >
                    <Icon size={16} />
                    <strong>
                      {WORLD_POINT_EXCHANGE.points} pts → {label}
                    </strong>
                    <small>{note}</small>
                  </button>
                ))}
              </div>
            </section>
            {pending && (
              <p className="world-shop-pending-note">
                <Clock3 size={14} />
                Your saved roll keeps its original {duration / 1000}s deadline.
                New speed starts next round.
              </p>
            )}
            {error && (
              <p className="world-alert" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="world-notice" role="status">
                {notice}
              </p>
            )}
            <div className="world-shop-actions">
              {!progress.profile && (
                <button
                  className="primary-button"
                  onClick={() => {
                    closeShop();
                    openSignup();
                  }}
                >
                  Create profile
                </button>
              )}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  closeShop();
                  onShop();
                }}
              >
                Exchange EP in Limited Shop <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}
