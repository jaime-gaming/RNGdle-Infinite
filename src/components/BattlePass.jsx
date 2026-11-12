import React, { useRef, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  Coins,
  Crown,
  Gift,
  History,
  Lock,
  Sparkles,
  Ticket,
  Timer,
} from "lucide-react";
import {
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_PREMIUM_PRICE,
  BATTLE_PASS_REWARDS,
  BPEP_PER_LEVEL,
  PASS_CADENCES,
  PASS_DAILY_REROLLS,
  activePassMissions,
  battlePassSeason,
  passDateLabel,
  passLevelForXp,
  passMissionProgress,
  passNextReset,
  passRewardEP,
  passRewardState,
  passXpIntoLevel,
  seasonLabel,
} from "../battle-pass.js";
import { waitText as taskWaitText } from "../tasks.js";
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
                ? taskWaitText(season.start - season.now)
                : taskWaitText(season.endsInMs)}
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
            Optional. Paid with EP, never real money. Extra EP rewards, the
            Prism Axolotl variant at level 20 and the Prism Circuit aura at
            level 30; the free track keeps every core reward. Cosmetics you
            claim are yours forever, even after a Rebirth.
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

      {PASS_CADENCES.map((cadence) => {
        const missions = activePassMissions(pass, cadence, now);
        const slot = pass.missions?.[cadence];
        const rerolls = slot?.rerolls ?? 0;
        return (
          <section
            className="pass-missions"
            key={cadence}
            aria-labelledby={`pass-missions-${cadence}`}
          >
            <header>
              <div>
                <h3 id={`pass-missions-${cadence}`}>
                  {cadence === "daily"
                    ? "Daily missions"
                    : cadence === "weekly"
                      ? "Weekly missions"
                      : "Season milestones"}
                </h3>
                <p>
                  {cadence === "season"
                    ? "Long goals that stay with the season."
                    : `Resets in ${taskWaitText(passNextReset(cadence, now) - now)} UTC.`}
                  {cadence === "daily" &&
                    ` Free swaps: ${Math.max(0, PASS_DAILY_REROLLS - rerolls)} left today.`}
                </p>
              </div>
              <span>{missions.length} active</span>
            </header>
            <ul>
              {missions.map((mission) => {
                const view = passMissionProgress(pass, mission, now);
                const shown = Math.min(view.count, view.goal);
                const actionKey = `mission-${mission.id}`;
                return (
                  <li
                    key={mission.id}
                    className={`pass-mission is-${view.state}`}
                    data-mission={mission.id}
                  >
                    <div className="pass-mission-copy">
                      <strong>{mission.title}</strong>
                      <span>{mission.detail}</span>
                    </div>
                    <div className="pass-mission-progress">
                      <progress
                        max={mission.goal}
                        value={shown}
                        aria-label={mission.title}
                        aria-valuetext={`${count(shown)} of ${count(mission.goal)}`}
                      />
                      <span>
                        {count(shown)} / {count(mission.goal)}
                      </span>
                    </div>
                    <span className="pass-mission-reward">
                      +{count(mission.reward)} BPEP
                    </span>
                    <div className="pass-mission-actions">
                      {view.state === "claimable" && (
                        <button
                          className="primary-button"
                          disabled={!!pending || ended}
                          aria-label={`Claim BPEP for ${mission.title}`}
                          onClick={() =>
                            run(
                              { type: "claim-pass-mission", id: mission.id },
                              `${mission.title} claimed.`,
                            )
                          }
                        >
                          {pending === actionKey ? "Claiming…" : "Claim"}
                        </button>
                      )}
                      {view.state === "claimed" && (
                        <span className="pass-claimed">
                          <Check size={13} aria-hidden="true" /> Claimed
                        </span>
                      )}
                      {view.state === "open" && cadence === "daily" && (
                        <button
                          className="secondary-button"
                          disabled={
                            !!pending || ended || rerolls >= PASS_DAILY_REROLLS
                          }
                          aria-label={`Swap ${mission.title}`}
                          onClick={() =>
                            run(
                              { type: "reroll-pass-mission", id: mission.id },
                              "Daily pass mission swapped.",
                            )
                          }
                        >
                          <ArrowRightLeft size={13} aria-hidden="true" /> Swap
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

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

      <p className="pass-note">
        The same online roll can advance Tasks and the pass. Offline rolls pay
        EP but do not advance pass missions. BPEP is not spendable. Rewards you
        earned are kept; when a season closes, any unclaimed earned rewards are
        delivered on your next online roll. Premium unlocks last for that season
        only. Rebirth, Prestige and Rollback never touch the pass: your level,
        missions and claimed cosmetics all carry on.
      </p>
    </div>
  );
}
