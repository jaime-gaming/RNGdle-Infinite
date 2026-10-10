import { allBadgeMetadata } from "./infinite-badges.js";
import { shopProducts } from "./shop-data.js";
import { rebirthSkills } from "./skills.js";
import { formatEP } from "./roll-data.js";

export const BADGE_TOTAL = allBadgeMetadata.length;
const badgeIds = new Set(allBadgeMetadata.map((b) => b.id));

// Rebirth is a collection milestone, not a spending one. Cosmetic auras and
// optional tools are deliberately excluded from the requirement, and no
// purchase unlocks or blocks a step.
export const REBIRTH_OPTIONAL_KINDS = ["aura", "utility", "offline-cap"];
export const rebirthOptionalProducts = shopProducts
  .filter((product) => REBIRTH_OPTIONAL_KINDS.includes(product.kind))
  .map((product) => product.id);
const optional = new Set(rebirthOptionalProducts);

export function rebirthRelevantPurchases(owned = []) {
  return owned.filter((id) => !optional.has(id));
}

// A rung asks for two things: a slice of the collection and EP the current
// cycle has earned. Badges alone made the late rungs a wall — the last few
// dozen are the rarest in the game, so the ladder used to end where nobody
// could reach it — while EP is something every roll works towards. The
// collection still sets the pace of the ladder; the EP is the second half of
// the price, and it roughly doubles from rung to rung.
//
// The icon appears at 15% of the collection, the first rung opens at 20%, and
// the ladder closes at 45% — where the old one only started.
export const REBIRTH_VISIBLE_AT = Math.ceil(BADGE_TOTAL * 0.15);
export const REBIRTH_STEPS = [
  { badges: 0.2, ep: 250000 },
  { badges: 0.25, ep: 600000 },
  { badges: 0.3, ep: 1500000 },
  { badges: 0.35, ep: 3500000 },
  { badges: 0.4, ep: 7500000 },
  { badges: 0.45, ep: 15000000 },
];
export const REBIRTH_TOTAL = REBIRTH_STEPS.length;
// A prestige (the ultra-rebirth in the save) follows the ladder: half the
// collection and a cycle that has earned real EP. Asking for all 235 badges
// asked for a collection nobody could finish. A prestige can be repeated.
export const ULTRA_REBIRTH_STEP = { badges: 0.5, ep: 30000000 };

// Everything a prestige grants on top of the cosmetic mark: a permanent,
// always-on wallet bonus. It multiplies banked EP only, exactly like a
// companion, so the scored roll and its rank stay identical for everyone.
export const ULTRA_BONUS_PER_REBIRTH = 0.1;

export function ultraRebirthMultiplier(ultraRebirths = 0) {
  return 1 + ULTRA_BONUS_PER_REBIRTH * Math.max(0, ultraRebirths);
}

// Every finished rung also pays a permanent wallet bonus: +2% per rebirth,
// stacking to +12% when the ladder is complete. It is earned forever, so no
// cycle ever removes it — a rebirth restarts the run, not the account, and a
// prestige adds its own larger bonus on top of the rungs it keeps.
export const REBIRTH_BONUS_PER_REBIRTH = 0.02;

export function rebirthMultiplier(rebirths = 0) {
  return 1 + REBIRTH_BONUS_PER_REBIRTH * Math.max(0, rebirths);
}

// A cycle starts with empty pockets, and an empty wallet with 45-second
// reveals is a dead end rather than a restart: every finished rung also pays a
// starting sum, so the new cycle can buy its first upgrades straight away
// instead of waiting on the slowest rolls in the game. It grows with the
// ladder, and every prestige pays its own larger sum on top.
export const REBIRTH_STARTER_EP = 250000;
export const ULTRA_STARTER_EP = 1000000;

export function cycleStarterEp(rebirths = 0, ultraRebirths = 0) {
  return (
    REBIRTH_STARTER_EP * Math.max(0, rebirths) +
    ULTRA_STARTER_EP * Math.max(0, ultraRebirths)
  );
}

// The Rollback is the last stage of the game, and it can be taken again and
// again. It opens after three prestiges. Each one restarts the run from zero:
// it adds no starting sum of its own, so the new run starts with what the
// ladder already pays, and it adds a permanent +25% that stacks with every
// Rollback before it.
// Prestige can be repeated three times. The third closes it for good, and the
// Rollback — which needs those three — becomes the only way out of the ladder.
export const PRESTIGE_LIMIT = 3;
export const ROLLBACK_AFTER_PRESTIGES = PRESTIGE_LIMIT;
export const ROLLBACK_BONUS = 0.25;
// The Rollback asks for more than a prestige does: three quarters of the
// collection, and a cycle that has earned twice a prestige's EP.
export const ROLLBACK_STEP = { badges: 0.75, ep: 60000000 };

export function rollbackMultiplier(rollbacks = 0) {
  return 1 + ROLLBACK_BONUS * Math.max(0, rollbacks);
}

// The gate is a floor, not a ceiling. Badges set the pace of the ladder
// while the cycle keeps earning EP, so the rebirth is usually taken with far
// more EP than the rung asked for — and the overshoot should pay, otherwise
// every roll past the gate is dead weight. Two dividends on the surplus:
// a quarter of it joins the starting sum of the new cycle, and every full
// 5,000,000 surplus EP adds a permanent +1% to the banked wallet, capped at
// +5% on any single rebirth (or ultra-rebirth). The example the player asked
// for: a gate of 100,000 with 1,000,000 in the cycle carries 225,000 EP of
// surplus into the next wallet.
export const SURPLUS_START_SHARE = 0.25;
export const SURPLUS_BANKED_EP_STEP = 5_000_000;
export const SURPLUS_BANKED_PER_STEP = 0.01;
export const SURPLUS_BANKED_CAP = 0.05;

export function rebirthSurplus(earned = 0, gate = 0) {
  const above = Number.isFinite(earned) ? earned : 0;
  const surplus = Math.max(0, above - Math.max(0, gate));
  if (!surplus) return { surplus: 0, starterBonus: 0, bankedBonus: 0 };
  return {
    surplus,
    starterBonus: Math.floor(surplus * SURPLUS_START_SHARE),
    bankedBonus: Math.min(
      SURPLUS_BANKED_CAP,
      Math.floor(surplus / SURPLUS_BANKED_EP_STEP) * SURPLUS_BANKED_PER_STEP,
    ),
  };
}

// The accumulated surplus dividend, stored as whole percent points on the
// save and composed with the rung and ultra bonuses in the wallet.
export function surplusMultiplier(surplusBankedPercent = 0) {
  const percent = Math.max(
    0,
    Number.isFinite(surplusBankedPercent) ? surplusBankedPercent : 0,
  );
  return 1 + percent / 100;
}

// Prestige stays out of sight until the ladder is finished: the sixth rebirth,
// or any prestige already taken. Every screen that names it asks this question.
export function prestigeShown(progress) {
  return (
    (progress?.rebirths ?? 0) >= REBIRTH_TOTAL ||
    (progress?.ultraRebirths ?? 0) > 0
  );
}

// Rebirth stays completely out of sight until the ladder unlocks: no badge, no
// teaser, no counter. The nav entry, the page and the help page all ask this one
// question, so the reveal can never be half-done.
export function rebirthUnlocked(progress) {
  return (
    discoveredCount(progress) >= REBIRTH_VISIBLE_AT ||
    (progress.rebirths ?? 0) > 0 ||
    (progress.ultraRebirths ?? 0) > 0 ||
    (progress.rollbacks ?? 0) > 0
  );
}

export function discoveredCount(progress) {
  return new Set(progress.discovered.filter((id) => badgeIds.has(id))).size;
}

// How many badges and how much cycle EP the next rebirth needs. Null once the
// whole ladder is complete.
export function rebirthRequirement(rebirths = 0) {
  const step = REBIRTH_STEPS[rebirths];
  if (step == null) return null;
  return {
    rebirth: rebirths + 1,
    percent: Math.round(step.badges * 100),
    badges: Math.ceil(BADGE_TOTAL * step.badges),
    ep: step.ep,
  };
}

export function ultraRebirthRequirement() {
  return {
    percent: Math.round(ULTRA_REBIRTH_STEP.badges * 100),
    badges: Math.ceil(BADGE_TOTAL * ULTRA_REBIRTH_STEP.badges),
    ep: ULTRA_REBIRTH_STEP.ep,
  };
}

// The Rollback asks for more than a prestige. Prestige is the stage you can
// repeat; the Rollback is the last stage there is, so it is the hardest gate.
export function rollbackRequirement() {
  return {
    percent: Math.round(ROLLBACK_STEP.badges * 100),
    badges: Math.ceil(BADGE_TOTAL * ROLLBACK_STEP.badges),
    ep: ROLLBACK_STEP.ep,
  };
}

// The step the page is working towards: a rung, then Prestige until three are
// done, then the Rollback. Null once the Rollback is taken.
export function nextStep(progress) {
  const rung = rebirthRequirement(progress.rebirths ?? 0);
  if (rung) return { kind: "rung", ...rung };
  if ((progress.ultraRebirths ?? 0) < PRESTIGE_LIMIT)
    return { kind: "prestige", ...ultraRebirthRequirement() };
  return { kind: "rollback", ...rollbackRequirement() };
}

const fractionOf = (done, goal) => Math.min(1, done / Math.max(1, goal));

// The one percentage the Rebirth page and the top-bar ring show. It mixes the
// collection and the cycle's EP half and half, and it is rounded down, so it
// only reads 100% when both are done: a full collection with no EP is not a
// finished step.
export function rebirthProgress(progress) {
  const step = nextStep(progress);
  const count = discoveredCount(progress);
  const earned = cycleEarnedEp(progress);
  if (!step)
    return {
      step: null,
      count,
      earned,
      badgeFraction: 1,
      epFraction: 1,
      percent: 100,
    };
  return {
    step,
    count,
    earned,
    badgeFraction: fractionOf(count, step.badges),
    epFraction: fractionOf(earned, step.ep),
    percent: blendedPercent(count, earned, step),
  };
}

// The blend itself, for any step: the collection count and the cycle's EP
// against that step's gate. The page gauge, the top-bar ring and every rung bar
// all read it, so the same step never shows two numbers.
export function blendedPercent(count, earned, step) {
  const badges = fractionOf(count, step.badges);
  const ep = fractionOf(earned, step.ep);
  return Math.min(100, Math.floor(((badges + ep) / 2) * 100));
}

// What the cycle in play has earned: the scored EP of every roll since the
// last rebirth. It is a gate, not a spend — a rebirth empties the wallet
// anyway, so charging the balance would only punish buying things with EP
// that is about to be handed back.
export function cycleEarnedEp(progress) {
  const history = Array.isArray(progress?.history) ? progress.history : [];
  const start = history.findLastIndex(
    (event) =>
      event.type === "rebirth" ||
      event.type === "ultra-rebirth" ||
      event.type === "rollback",
  );
  const events = start >= 0 ? history.slice(start + 1) : history;
  let total = 0;
  for (const event of events)
    if (
      event?.type === "roll" &&
      Number.isSafeInteger(event.ep) &&
      event.ep >= 0
    )
      total = Math.min(Number.MAX_SAFE_INTEGER, total + event.ep);
  const saved = progress?.cycleEarnedEP;
  return Math.max(total, Number.isSafeInteger(saved) && saved >= 0 ? saved : 0);
}

export function nextRebirthSkill(rebirths = 0) {
  return rebirthSkills.find((skill) => skill.rebirth === rebirths + 1) ?? null;
}

function commitmentBlocker(progress, now) {
  if (progress.pendingRoll || progress.offline?.batch)
    return "Finish your committed rolls before rebirthing.";
  if (now < progress.cooldownUntil) {
    // A live countdown, not a bare refusal: the button opens the moment the
    // clock reaches zero, and the player can watch it get there.
    const secs = Math.max(0, Math.ceil((progress.cooldownUntil - now) / 1000));
    const stamp = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    return `Wait for the current cooldown to finish (${stamp} left).`;
  }
  return "";
}

export function rebirthBlocker(progress, now) {
  const requirement = rebirthRequirement(progress.rebirths ?? 0);
  if (!requirement) {
    if ((progress.ultraRebirths ?? 0) >= PRESTIGE_LIMIT)
      return "Three prestiges are done. The Rollback is the only way out now.";
    const prestige = ultraRebirthRequirement();
    return `The rebirth ladder is complete. Prestige is unlocked at ${prestige.badges} badges and ${formatEP(prestige.ep)} EP earned in a cycle.`;
  }
  const count = discoveredCount(progress);
  if (count < requirement.badges)
    return `Discover ${requirement.badges} badges (${requirement.percent}%) to rebirth. ${requirement.badges - count} to go.`;
  const earned = cycleEarnedEp(progress);
  if (earned < requirement.ep)
    return `Earn ${formatEP(requirement.ep)} EP this cycle to rebirth. ${formatEP(requirement.ep - earned)} to go.`;
  return commitmentBlocker(progress, now);
}

export function rebirthReady(progress, now) {
  const requirement = rebirthRequirement(progress.rebirths ?? 0);
  if (!requirement) return false;
  return (
    discoveredCount(progress) >= requirement.badges &&
    cycleEarnedEp(progress) >= requirement.ep &&
    !commitmentBlocker(progress, now)
  );
}

// A prestige (the ultra-rebirth in the save) needs the last rung of the ladder
// and a complete collection. It is optional: a completed ladder is a legitimate
// resting place, and the button only ever appears once the requirement is met.
// It gives the same fresh run a rebirth does — collection, purchases,
// companions and wallet — and keeps the account's history, rebirths and bonuses.
// Once three prestiges are done, prestige closes for good; the Rollback is the
// only way out from there, and it can be taken again and again.
export function ultraRebirthBlocker(progress, now) {
  if ((progress.ultraRebirths ?? 0) >= PRESTIGE_LIMIT)
    return "Three prestiges are done. Prestige is closed; the Rollback is the only way out.";
  if ((progress.rebirths ?? 0) < REBIRTH_TOTAL)
    return `Finish the whole rebirth ladder first: ${REBIRTH_TOTAL - (progress.rebirths ?? 0)} rebirths to go.`;
  const requirement = ultraRebirthRequirement();
  const count = discoveredCount(progress);
  if (count < requirement.badges)
    return `A prestige starts the run over: the wallet, every purchase and every companion. Discover ${requirement.badges} badges (${requirement.percent}%) first — ${requirement.badges - count} to go.`;
  const earned = cycleEarnedEp(progress);
  if (earned < requirement.ep)
    return `Earn ${formatEP(requirement.ep)} EP this cycle to prestige. ${formatEP(requirement.ep - earned)} to go.`;
  return commitmentBlocker(progress, now);
}

export function ultraRebirthAvailable(progress, now) {
  const requirement = ultraRebirthRequirement();
  return (
    (progress.ultraRebirths ?? 0) < PRESTIGE_LIMIT &&
    (progress.rebirths ?? 0) >= REBIRTH_TOTAL &&
    discoveredCount(progress) >= requirement.badges &&
    cycleEarnedEp(progress) >= requirement.ep &&
    !commitmentBlocker(progress, now)
  );
}

// The Rollback opens after the third prestige and can be taken again and
// again. It needs the whole ladder, the prestige count, and the collection and
// EP the Rollback asks for. Taking it restarts the run from zero.
export function rollbackBlocker(progress, now) {
  if ((progress.rebirths ?? 0) < REBIRTH_TOTAL)
    return `Finish the whole rebirth ladder first: ${REBIRTH_TOTAL - (progress.rebirths ?? 0)} rebirths to go.`;
  const prestiges = progress.ultraRebirths ?? 0;
  if (prestiges < ROLLBACK_AFTER_PRESTIGES)
    return `Reach ${ROLLBACK_AFTER_PRESTIGES} prestiges to open the Rollback: ${ROLLBACK_AFTER_PRESTIGES - prestiges} to go.`;
  const requirement = rollbackRequirement();
  const count = discoveredCount(progress);
  if (count < requirement.badges)
    return `A Rollback starts the run over: the wallet, every purchase and every companion. Discover ${requirement.badges} badges (${requirement.percent}%) first — ${requirement.badges - count} to go.`;
  const earned = cycleEarnedEp(progress);
  if (earned < requirement.ep)
    return `Earn ${formatEP(requirement.ep)} EP this cycle to Rollback. ${formatEP(requirement.ep - earned)} to go.`;
  return commitmentBlocker(progress, now);
}

export function rollbackAvailable(progress, now) {
  return !rollbackBlocker(progress, now);
}
