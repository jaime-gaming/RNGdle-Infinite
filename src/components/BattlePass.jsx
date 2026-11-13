import React, { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  Coins,
  Crown,
  Gift,
  History,
  Lock,
  Sparkles,
  Ticket,
  Timer,
  Zap,
} from "lucide-react";
import {
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_PREMIUM_PRICE,
  BATTLE_PASS_REWARDS,
  BPEP_PER_LEVEL,
  PASS_BOOSTS,
  PASS_BOOST_PRICE,
  activeBoosts,
  battlePassSeason,
  boostBuyStatus,
  boostCharges,
  boostMultiplier,
  passBoostById,
  passDateLabel,
  passLevelForXp,
  passRewardState,
  passXpIntoLevel,
  seasonLabel,
} from "../battle-pass.js";
import { waitText } from "../tasks.js";
import { gameNow } from "../game-clock.js";
import { useFormatEP } from "../use-settings.jsx";
import { CreatureIcon } from "./game-icons.jsx";
import "./battle-pass.css";

const count = (value) => value.toLocaleString("en-US");

function RewardLabel({ reward, owned, formatEP }) {
  if (reward.kind !== "ep")
    return (
      <span className="pass-reward-aura">
        <span className="pass-reward-name">
          {reward.kind === "pet-variant" ? (
            <CreatureIcon pet="axolotl-prism" size={16} aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          {reward.name}
        </span>
        <small>
          {reward.kind === "pet-variant"
            ? "Comet Axolotl look · yours forever"
            : "Aura · yours forever"}
        </small>
        {owned.includes(reward.id) && (
          <small>Already owned · +{formatEP(reward.repeatEP)} EP</small>
        )}
      </span>
    );
  return (
    <span className="pass-reward-ep">
      <Coins size={13} aria-hidden="true" />+{formatEP(reward.ep)} EP
      {reward.boost && (
        <small className="pass-reward-boost">
          <Zap size={11} aria-hidden="true" />+{reward.boost.charges}{" "}
          {reward.boost.charges === 1 ? "charge" : "charges"} ·{" "}
          {reward.boost.name}
        </small>
      )}
    </span>
  );
}

export default function BattlePass({
  progress,
  now,
  onAction,
  notify,
  cloudUser,
  openSignup,
  onOpenTasks,
}) {
  const formatEP = useFormatEP();
  const pass = progress.battlePass ?? {
    seasonId: "",
    xp: 0,
    premium: false,
    claimed: [],
    missions: {},
    archive: [],
  };
  const season = battlePassSeason(now);
  const level = passLevelForXp(pass.xp);
  const intoLevel = passXpIntoLevel(pass.xp);
  const [pending, setPending] = useState("");
  const [confirmPremium, setConfirmPremium] = useState(false);
  const busy = useRef(false);
  const owned = progress.owned ?? [];
  const currentSeason = pass.seasonId === season.id;
  const ended = !!pass.seasonId && !currentSeason && !season.upcoming;
  const claimedCount = (pass.claimed ?? []).length;
  const trackSlots = BATTLE_PASS_LEVELS * (pass.premium ? 2 : 1);
  const archive = [...(pass.archive ?? [])].reverse();
  // A boost window is short, so it needs its own second-by-second clock: the
  // shared page clock only ticks every thirty seconds.
  const [tick, setTick] = useState(now);
  const running = activeBoosts(pass.boosts, Math.max(now, tick));
  useEffect(() => {
    setTick(now);
    if (!activeBoosts(pass.boosts, now).length) return undefined;
    const timer = setInterval(() => setTick(gameNow()), 1000);
    return () => clearInterval(timer);
  }, [pass.boosts, now]);
  const boostClock = Math.max(now, tick);
  const active = running;
  const multiplier = boostMultiplier(pass.boosts, boostClock);
  const buyStatus = boostBuyStatus(pass.boosts, boostClock);
  const canBuy = buyStatus.waitMs === 0 && progress.balance >= PASS_BOOST_PRICE;

  async function run(action, message) {
    if (busy.current) return;
    busy.current = true;
    setPending(
      action.id ?? `${action.type}-${action.level ?? ""}-${action.track ?? ""}`,
    );
    try {
      const result = await onAction(action);
      if (result?.ok)
        notify?.({ kind: "done", title: "Pass updated", text: message });
      else
        notify?.({
          kind: "error",
          text: result?.message ?? "That pass action could not be saved.",
        });
    } finally {
      busy.current = false;
      setPending("");
    }
  }

  function rewardButton(reward, track) {
    const state = passRewardState(pass, reward.level, track);
    const definition = reward[track];
    const key = `${track}-${reward.level}`;
    return (
      <div className={`pass-reward is-${state} is-${track}`} data-reward={key}>
        <div className="pass-reward-label">
          {track === "premium" && state === "premium-locked" && (
            <Lock size={12} aria-hidden="true" />
          )}
          <RewardLabel reward={definition} owned={owned} formatEP={formatEP} />
        </div>
        {state === "claimable" ? (
          <button
            className="primary-button"
            disabled={!!pending}
            aria-label={`Claim ${track} level ${reward.level} reward`}
            onClick={() =>
              run(
                { type: "claim-pass-reward", level: reward.level, track },
                `Level ${reward.level} ${track} reward claimed.`,
              )
            }
          >
            Claim
          </button>
        ) : (
          <span className="pass-reward-state">
            {state === "claimed" ? (
              <>
                <Check size={12} aria-hidden="true" /> Claimed
              </>
            ) : state === "premium-locked" ? (
              "Premium"
            ) : (
              `Level ${reward.level}`
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="battle-pass">
      {!cloudUser && !progress.profile && (
        <div className="guest-save-notice">
          <p>Guest pass progress is temporary. Name a profile to keep it.</p>
          <button className="secondary-button" onClick={openSignup}>
            Name profile
          </button>
        </div>
      )}
      <section
        className="pass-hero"
        aria-label="Season summary"
        style={{ "--pass-accent": season.accent }}
      >
        <div className="pass-hero-mark" aria-hidden="true">
          <Ticket size={28} />
        </div>
        <div className="pass-hero-copy">
          <span className="eyebrow">
            Season {season.index}
            {!season.upcoming &&
              !ended &&
              ` · day ${season.day} of ${season.daysLong}`}
          </span>
          <h2>
            {season.upcoming
              ? "The pass opens soon"
              : ended
                ? "Season complete"
                : season.name}
          </h2>
          {!season.upcoming && !ended && (
            <p className="pass-hero-theme">{season.theme}</p>
          )}
          <p>
            {season.upcoming
              ? `${season.name} starts ${passDateLabel(season.start)} UTC.`
              : ended
                ? `Claim any rewards you earned. Your next online roll opens ${season.name} and delivers anything still waiting.`
                : `${passDateLabel(season.start)} – ${passDateLabel(season.end)} UTC. BPEP moves the pass; EP stays your shop wallet.`}
          </p>
        </div>
        <div className="pass-hero-stats">
          <div>
            <span>Level</span>
            <strong>
              {level} / {BATTLE_PASS_LEVELS}
            </strong>
          </div>
          <div>
            <span>BPEP</span>
            <strong>{count(pass.xp)}</strong>
          </div>
          <div>
            <span>Claimed</span>
            <strong>
              {claimedCount} / {trackSlots}
            </strong>
          </div>
          <div>
            <span>{season.upcoming ? "Opens in" : "Ends in"}</span>
            <strong>
              <Timer size={14} aria-hidden="true" />
              {season.upcoming
                ? waitText(season.start - season.now)
                : waitText(season.endsInMs)}
            </strong>
          </div>
        </div>
        <div className="pass-level-progress">
          <progress
            max={BPEP_PER_LEVEL}
            value={intoLevel}
            aria-label="Progress to the next pass level"
            aria-valuetext={`${count(intoLevel)} of ${count(BPEP_PER_LEVEL)} BPEP`}
          />
          <span>
            {level >= BATTLE_PASS_LEVELS
              ? "Track complete"
              : `${count(BPEP_PER_LEVEL - intoLevel)} BPEP to level ${level + 1}`}
          </span>
        </div>
        {!season.upcoming && (
          <p className="pass-hero-next">
            <CalendarDays size={13} aria-hidden="true" />
            Next season: <strong>{season.nextName}</strong>
          </p>
        )}
      </section>

      <section
        className={`pass-premium ${pass.premium ? "is-owned" : ""}`}
        aria-label="Premium track"
      >
        <div>
          <h3>
            <Crown size={16} aria-hidden="true" /> Premium track
          </h3>
          <p>
            Optional. Paid with EP, never real money. Extra EP rewards, double
            the boost charges at levels 5, 15 and 25, the Prism Axolotl variant
            at level 20 and the Prism Circuit aura at level 30; the free track
            keeps every core reward. Cosmetics you claim are yours forever, even
            after a Rebirth.
          </p>
        </div>
        {pass.premium ? (
          <span className="pass-premium-owned">
            <Check size={14} aria-hidden="true" /> Unlocked for {season.name}
          </span>
        ) : confirmPremium ? (
          <div className="pass-confirm">
            <span>Unlock for {formatEP(BATTLE_PASS_PREMIUM_PRICE)} EP?</span>
            <button
              className="primary-button"
              disabled={
                !!pending ||
                progress.balance < BATTLE_PASS_PREMIUM_PRICE ||
                !season.active
              }
              onClick={() =>
                run(
                  { type: "buy-pass-premium" },
                  "Premium track unlocked for this season.",
                ).then(() => setConfirmPremium(false))
              }
            >
              Confirm unlock
            </button>
            <button
              className="secondary-button"
              onClick={() => setConfirmPremium(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="primary-button"
            disabled={
              !!pending ||
              !season.active ||
              progress.balance < BATTLE_PASS_PREMIUM_PRICE
            }
            onClick={() => setConfirmPremium(true)}
          >
            Unlock · {formatEP(BATTLE_PASS_PREMIUM_PRICE)} EP
          </button>
        )}
      </section>

      <section className="pass-track" aria-label="Reward track">
        <div className="pass-track-head">
          <h3>Reward track</h3>
          <span>
            Every reward is visible. Claim each one once. Levels 10, 20 and 30
            carry the season cosmetics.
          </span>
        </div>
        <div className="pass-track-legend" aria-hidden="true">
          <span className="pass-legend-free">
            <Gift size={12} /> Free
          </span>
          <span className="pass-legend-premium">
            <Crown size={12} /> Premium
          </span>
        </div>
        <div className="pass-track-scroll">
          <ol className="pass-track-grid">
            {BATTLE_PASS_REWARDS.map((reward) => {
              const milestone =
                reward.free.kind !== "ep" || reward.premium.kind !== "ep";
              const isNext = reward.level === level + 1;
              return (
                <li
                  key={reward.level}
                  className={[
                    "pass-level",
                    level >= reward.level ? "is-reached" : "",
                    milestone ? "is-milestone" : "",
                    isNext ? "is-next" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="pass-level-number">{reward.level}</span>
                  {rewardButton(reward, "free")}
                  {rewardButton(reward, "premium")}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section
        className="pass-boosts"
        aria-labelledby="pass-boosts-title"
        style={{ "--pass-accent": season.accent }}
      >
        <header>
          <div>
            <h3 id="pass-boosts-title">
              <Zap size={16} aria-hidden="true" /> Consumable boosts
            </h3>
            <p>
              Extra rewards from levels 5, 15 and 25. One boost runs at a time;
              another charge of the same type extends its window without
              multiplying the bonus again. It changes banked roll EP only, and
              unused charges carry into the next season and survive every reset.
            </p>
          </div>
          <span
            className={`pass-boost-mult ${active.length ? "is-on" : ""}`}
            data-boost-multiplier={multiplier.toFixed(2)}
            aria-live="polite"
          >
            {active.length
              ? `${active[0].name} · ×${Number(multiplier.toFixed(2))} · ${waitText(active[0].until - boostClock)}`
              : "Rolls bank ×1"}
          </span>
        </header>
        <ul>
          {PASS_BOOSTS.map((boost) => {
            const charges = boostCharges(pass.boosts, boost.id);
            const live = active.find((entry) => entry.id === boost.id);
            const busy = !!pending;
            return (
              <li
                key={boost.id}
                className={`pass-boost ${live ? "is-active" : ""} ${charges ? "is-held" : ""}`}
                data-boost={boost.id}
              >
                <div className="pass-boost-copy">
                  <strong>{boost.name}</strong>
                  <span>{boost.blurb}</span>
                </div>
                <span className="pass-boost-charges">
                  {charges
                    ? `${charges} charge${charges === 1 ? "" : "s"}`
                    : live
                      ? "In use"
                      : "No charges"}
                </span>
                {live ? (
                  <span className="pass-boost-running">
                    <Clock size={13} aria-hidden="true" />
                    Running · {waitText(live.until - now)}
                    {charges > 0 && (
                      <button
                        type="button"
                        className="pass-boost-extend"
                        disabled={busy || ended}
                        aria-label={`Extend ${boost.name} by ${boost.minutes} minutes`}
                        title={`Use one charge to add ${boost.minutes} minutes. The multiplier stays the same.`}
                        onClick={() =>
                          run(
                            { type: "activate-boost", id: boost.id },
                            `${boost.name} extended by ${boost.minutes} minutes.`,
                          )
                        }
                      >
                        Extend · +{boost.minutes} min
                      </button>
                    )}
                  </span>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={busy || charges < 1 || !!active.length || ended}
                    aria-label={`Activate ${boost.name}`}
                    title={
                      ended
                        ? "The season is closed."
                        : charges < 1
                          ? "Earn a charge at level 5, 15 or 25."
                          : active.length
                            ? `${active[0].name} is already running.`
                            : `Starts now, for ${boost.minutes} minutes.`
                    }
                    onClick={() =>
                      run(
                        { type: "activate-boost", id: boost.id },
                        `${boost.name} running for ${boost.minutes} minutes.`,
                      )
                    }
                  >
                    {pending === `activate-boost-${boost.id}`
                      ? "Activating…"
                      : "Activate"}
                  </button>
                )}
                {!live && (
                  <button
                    className="pass-boost-buy"
                    disabled={!!pending || !canBuy || ended}
                    aria-label={`Buy ${boost.name} with EP`}
                    title={
                      ended
                        ? "The season is closed."
                        : buyStatus.waitMs > 0
                          ? `One charge a day. Next in ${waitText(buyStatus.waitMs)}.`
                          : progress.balance < PASS_BOOST_PRICE
                            ? "Not enough EP."
                            : "Adds one charge to this boost."
                    }
                    onClick={() =>
                      run(
                        { type: "buy-boost", id: boost.id },
                        `${boost.name} charge bought.`,
                      )
                    }
                  >
                    {pending === `buy-boost-${boost.id}`
                      ? "Buying…"
                      : `Buy · ${formatEP(PASS_BOOST_PRICE)} EP`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {archive.length > 0 && (
        <section className="pass-archive" aria-labelledby="pass-archive-title">
          <header>
            <h3 id="pass-archive-title">
              <History size={16} aria-hidden="true" /> Past seasons
            </h3>
            <span>{archive.length} closed</span>
          </header>
          <ul>
            {archive.map((entry) => (
              <li key={entry.seasonId}>
                <span className="pass-archive-name">
                  {seasonLabel(entry.seasonId)}
                </span>
                <span className="pass-archive-level">
                  Level {passLevelForXp(entry.xp)} / {BATTLE_PASS_LEVELS}
                </span>
                <span className="pass-archive-claimed">
                  {entry.claimed} reward{entry.claimed === 1 ? "" : "s"} claimed
                </span>
                {entry.premium && (
                  <span className="pass-archive-premium">
                    <Crown size={12} aria-hidden="true" /> Premium
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="pass-link-banner" onClick={onOpenTasks}>
        <Zap size={16} aria-hidden="true" />
        <span>
          Daily, weekly and season pass missions now live on the Tasks page.
        </span>
      </button>

      <p className="pass-note">
        The same online roll can advance Tasks and the pass. Offline rolls pay
        EP but do not advance pass missions. BPEP is not spendable. Rewards you
        earned are kept; when a season closes, any unclaimed earned rewards are
        delivered on your next online roll. Premium unlocks last for that season
        only. Rebirth, Prestige and Rollback never touch the pass: your level,
        missions, boost charges and claimed cosmetics all carry on. Pass
        missions live on the Tasks page.
      </p>
    </div>
  );
}
