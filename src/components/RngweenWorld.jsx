import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  DoorClosed,
  Flame,
  Ghost,
  Hourglass,
  KeyRound,
  LockKeyhole,
  Moon,
  ShoppingBag,
  Skull,
  X,
} from "lucide-react";
import { RNGWEEN_WORLD_SKIN, rngweenCalendar } from "../rngween.js";
import { RNGWEEN_WORLD_MAX } from "../rngween-limited.js";
import {
  WORLD_ZONES,
  WORLD_SPEED_ITEMS,
  WORLD_VALLEY_TARGET,
  worldZoneById,
  worldState,
  worldRevealMS,
  rngweenValleyUnlocked,
} from "../rngween-world-zones.js";
import {
  WORLD_MINI_RULES,
  emptyWorldMini,
  scoreWorldNumber,
  worldPhaseComplete,
} from "../rngween-world-badges.js";
import { seasonNow } from "../season-clock.js";
import { hourlyView, hourlyTaskById } from "../rngween-hourly.js";
import { useMotionPreference } from "../use-settings.jsx";
import { useModalDialog } from "../use-modal-dialog.js";
import NumberBox from "./NumberBox.jsx";
import WorldScenery from "./WorldScenery.jsx";
import ReaperFigure from "./ReaperFigure.jsx";
import ReaperDialog from "./ReaperDialog.jsx";
import RngweenHourly from "./RngweenHourly.jsx";
import WorldAuraTrial from "./WorldAuraTrial.jsx";
import WorldCollection, { WorldResultBadges } from "./WorldCollection.jsx";
import { Pumpkoin } from "./RngweenShop.jsx";
import { HexboundMark, PumpkinMark } from "./game-icons.jsx";
import "../rngween-limited.css";
import "../rngween-world.css";

const ZONE_ICONS = {
  "pumpkin-patch": PumpkinMark,
  graveyard: Skull,
  "haunted-house": DoorClosed,
  valley: Flame,
};
const SPEED_ICONS = [Moon, Clock3, Hourglass];
// Scenery never consumes gameplay randomness.

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
}) {
  const world = worldState(progress.rngweenLimited);
  const limited = progress.rngweenLimited;
  const drawn = limited?.drawn ?? [];
  const wallet = limited?.pumpkoins ?? 0;
  const reduced = useMotionPreference();
  const [selected, setSelected] = useState(
    () => world.pending?.zone ?? world.last?.zone ?? "pumpkin-patch",
  );
  const [shopOpen, setShopOpen] = useState(false);
  const [reaperOpen, setReaperOpen] = useState(false);
  const [commissionsOpen, setCommissionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const fragments =
    Number(world.fragments.graveyard) +
    Number(world.fragments["haunted-house"]);
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
  const digits = outcome
    ? String(outcome.number).padStart(zone.digits, "0")
    : "?".repeat(zone.digits);
  const jackpot =
    !pending && last?.zone === "valley" && last.number === WORLD_VALLEY_TARGET;
  const hourly = hourlyView(progress, now);
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
        ? `${result.tier[0].toUpperCase() + result.tier.slice(1)} · +${result.points.toLocaleString("en-US")} event points`
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
          aria-label={`World shop · ${wallet.toLocaleString("en-US")} Pumpkoins`}
          onClick={() => {
            setShopOpen(true);
            setError("");
            setNotice("");
          }}
          aria-haspopup="dialog"
        >
          <Pumpkoin size={20} />
          <strong>{wallet.toLocaleString("en-US")}</strong>
          <ShoppingBag size={16} />
          <span>World shop</span>
        </button>
      </header>
      <div className="world-heading">
        <span className="world-eyebrow">
          <PumpkinMark size={17} />
          The Halloween mini-RNGdle
        </span>
        <h1>RNGween World</h1>
        <p>
          {key
            ? "Valley unlocked. Find 6666 to earn Hexbound."
            : "Earn both key fragments, or buy a Valley Challenge Key."}
        </p>
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
          return (
            <button
              key={item.id}
              className={`world-zone${active ? " is-selected" : ""}`}
              style={{ "--zone-accent": item.accent }}
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
              <span className="world-zone-number">Phase 0{item.phase}</span>
              <strong>{item.name}</strong>
              <span>{item.subtitle}</span>
              <small>
                {item.id === "pumpkin-patch" ? (
                  complete ? (
                    <>
                      <Check size={12} />
                      Objectives cleared
                    </>
                  ) : (
                    "Free entry"
                  )
                ) : item.fragment ? (
                  ready ? (
                    <>
                      <Check size={12} />
                      Fragment found
                    </>
                  ) : (
                    "Key fragment"
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
      <div className="world-workbench">
        <section
          className={`world-playground${pending ? " is-revealing" : ""}${jackpot ? " is-jackpot" : ""}`}
          data-zone={zone.id}
          aria-labelledby="world-zone-title"
        >
          <div className="world-scene">
            <WorldScenery zone={zone.id} />
            <span className="world-fog world-fog-back" />
            <span className="world-fog world-fog-front" />
            <span className="world-wisps" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <i key={i} style={{ "--wisp": i }} />
              ))}
            </span>
          </div>
          <div className="world-zone-heading">
            <span className="world-eyebrow">
              <ZoneIcon size={15} />
              Phase 0{zone.phase} · {zone.subtitle}
            </span>
            <h2 id="world-zone-title">{zone.name}</h2>
            <p>{zone.detail}</p>
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
              className={`world-number-box${pending ? " is-revealing" : ""}`}
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
                    >
                      {shown ? digit : "?"}
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
          {!pending && result && <WorldResultBadges result={result} />}
          {pending ? (
            <div className="world-reveal-timer">
              <div>
                <Clock3 size={14} />
                <span>
                  {remaining > 0 ? "Revealing…" : "Saving the result…"}
                </span>
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
              {zone.id === "valley" && !key ? (
                <div className="world-challenge-lock">
                  <LockKeyhole size={19} />
                  <p>
                    Complete the Graveyard and Haunted House badge objectives,
                    then forge your key below. Or buy the complete key in
                    Limited Shop.
                  </p>
                  <button className="secondary-button" onClick={onShop}>
                    View key <ArrowRight size={14} />
                  </button>
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
              <small>
                {zone.id !== "valley"
                  ? `1–${zone.max} · repeats allowed · free rolls`
                  : `${(RNGWEEN_WORLD_MAX - drawn.length).toLocaleString("en-US")} unseen numbers remain · 6666 alone earns Hexbound`}
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
              {world.rounds[zone.id].toLocaleString("en-US")} rounds completed
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
          </div>
        </section>
        <WorldCollection
          zone={zone}
          stats={stats}
          fragmentOwned={zone.fragment ? world.fragments[zone.fragment] : false}
          drawn={drawn}
        />
      </div>
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
      {worldPhaseComplete(zone.id, stats) && zone.phase < 4 && (
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
      <section className="world-key-forge" aria-labelledby="world-key-title">
        <div className="world-key-symbol">
          <KeyRound size={32} />
          <span>{key ? <Check size={13} /> : `${fragments}/2`}</span>
        </div>
        <div>
          <span className="world-eyebrow">The Valley challenge</span>
          <h2 id="world-key-title">
            {key ? "Your key is ready" : "Forge the challenge key"}
          </h2>
          <p>
            {key
              ? "The key unlocks the Valley until Nov 3 UTC. It is not consumed."
              : "Complete both zones' objectives, then combine their fragments for free."}
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
            onClick={() => setSelected("valley")}
          >
            Enter Valley <ArrowRight size={14} />
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={fragments < 2 || busy || !live || !progress.profile}
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
                : "Permanent. Never sold. Find 6666 in the Valley."}
            </p>
          </div>
          <button onClick={onShop}>
            Preview <ArrowRight size={13} />
          </button>
        </div>
        {hourly.active && (
          <div className="world-hourly-toggle">
            <Ghost size={25} />
            <div>
              <strong>The Reaper's commissions</strong>
              <span>{hourly.slots.length}/4 active · one hour · no skips</span>
            </div>
            <button
              className="secondary-button"
              aria-expanded={commissionsOpen}
              onClick={() => setCommissionsOpen(!commissionsOpen)}
            >
              {commissionsOpen ? "Hide commissions" : "View commissions"}
            </button>
          </div>
        )}
      </div>
      {hourly.active && commissionsOpen && (
        <RngweenHourly
          progress={progress}
          now={now}
          inWorld
          openSignup={openSignup}
        />
      )}
      <footer className="world-footer">
        <PumpkinMark size={18} />
        <p>
          World rolls never grant EP, skill charges, companion drops or ordinary
          task/aura progress. Only active World commissions can award Pumpkoins.
          Event badges and points stay separate from ordinary play. Speed
          changes reveal time, never odds. Collections, fragments, key and
          upgrades retire after Nov 3 UTC; Hexbound and owned auras stay.
        </p>
      </footer>
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
              Buy upgrades in order to shorten reveals in all four phases. They
              apply from the next roll and expire after Nov 3 UTC.
            </p>
            <div className="world-shop-wallet">
              <Pumpkoin size={22} />
              <strong>{wallet.toLocaleString("en-US")} Pumpkoins</strong>
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
                      <Pumpkoin size={16} />
                      {item.pumpkoinPrice.toLocaleString("en-US")}
                    </strong>
                    <button
                      className={owned ? "secondary-button" : "primary-button"}
                      disabled={
                        owned ||
                        !available ||
                        busy ||
                        !live ||
                        !progress.profile ||
                        wallet < item.pumpkoinPrice
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
