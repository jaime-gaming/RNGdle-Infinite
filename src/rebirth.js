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
  { badges: 0.2, ep: 100000 },
  { badges: 0.25, ep: 250000 },
  { badges: 0.3, ep: 500000 },
  { badges: 0.35, ep: 1250000 },
  { badges: 0.4, ep: 3000000 },
  { badges: 0.45, ep: 7000000 },
];
export const REBIRTH_TOTAL = REBIRTH_STEPS.length;
// The ultra-rebirth closes the ladder: half the collection and a cycle that
// has earned real EP. Asking for all 235 badges asked for a collection nobody
// could finish.
export const ULTRA_REBIRTH_STEP = { badges: 0.5, ep: 15000000 };

// Everything an ultra-rebirth grants on top of the cosmetic mark: a permanent,
// always-on wallet bonus. It multiplies banked EP only, exactly like a
// companion, so the scored roll and its rank stay identical for everyone.
export const ULTRA_BONUS_PER_REBIRTH = 0.1;

export function ultraRebirthMultiplier(ultraRebirths = 0) {
  return 1 + ULTRA_BONUS_PER_REBIRTH * Math.max(0, ultraRebirths);
}

// Every finished rung also pays a permanent wallet bonus: +2% per rebirth,
// stacking to +12% when the ladder is complete. It is earned forever, so no
// cycle ever removes it — a rebirth restarts the run, not the account, and the
// ultra-rebirth adds its own larger bonus on top of the rungs it keeps.
export const REBIRTH_BONUS_PER_REBIRTH = 0.02;

export function rebirthMultiplier(rebirths = 0) {
  return 1 + REBIRTH_BONUS_PER_REBIRTH * Math.max(0, rebirths);
}

// A cycle starts with empty pockets, and an empty wallet with 45-second
// reveals is a dead end rather than a restart: every finished rung also pays a
// starting sum, so the new cycle can buy its first upgrades straight away
// instead of waiting on the slowest rolls in the game. It grows with the
// ladder, and every ultra-rebirth pays its own larger sum on top.
export const REBIRTH_STARTER_EP = 250000;
export const ULTRA_STARTER_EP = 1000000;

export function cycleStarterEp(rebirths = 0, ultraRebirths = 0) {
  return (
    REBIRTH_STARTER_EP * Math.max(0, rebirths) +
    ULTRA_STARTER_EP * Math.max(0, ultraRebirths)
  );
}

// Rebirth stays completely out of sight until the ladder unlocks: no badge, no
// teaser, no counter. The nav entry, the page and the help page all ask this one
// question, so the reveal can never be half-done.
export function rebirthUnlocked(progress) {
  return (
    discoveredCount(progress) >= REBIRTH_VISIBLE_AT ||
    (progress.rebirths ?? 0) > 0 ||
    (progress.ultraRebirths ?? 0) > 0
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

// What the cycle in play has earned: the scored EP of every roll since the
// last rebirth. It is a gate, not a spend — a rebirth empties the wallet
// anyway, so charging the balance would only punish buying things with EP
// that is about to be handed back.
export function cycleEarnedEp(progress) {
  const history = Array.isArray(progress?.history) ? progress.history : [];
  const start = history.findLastIndex(
    (event) => event.type === "rebirth" || event.type === "ultra-rebirth",
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
  if (now < progress.cooldownUntil)
    return "Wait for the current cooldown to finish.";
  return "";
}

export function rebirthBlocker(progress, now) {
  const requirement = rebirthRequirement(progress.rebirths ?? 0);
  if (!requirement) {
    const ultra = ultraRebirthRequirement();
    return `The rebirth ladder is complete. Ultra-rebirth is unlocked at ${ultra.badges} badges and ${formatEP(ultra.ep)} EP earned in a cycle.`;
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

// An ultra-rebirth needs the last rung of the ladder and a complete
// collection. It is optional: a completed ladder is a legitimate resting
// place, and the button only ever appears once the requirement is met. It
// gives the same fresh run a rebirth does — collection, purchases, companions
// and wallet — and keeps the account's history, rebirths and bonuses.
export function ultraRebirthBlocker(progress, now) {
  if ((progress.rebirths ?? 0) < REBIRTH_TOTAL)
    return `Finish the whole rebirth ladder first: ${REBIRTH_TOTAL - (progress.rebirths ?? 0)} rebirths to go.`;
  const requirement = ultraRebirthRequirement();
  const count = discoveredCount(progress);
  if (count < requirement.badges)
    return `An ultra-rebirth starts the run over: the wallet, every purchase and every companion. Discover ${requirement.badges} badges (${requirement.percent}%) first — ${requirement.badges - count} to go.`;
  const earned = cycleEarnedEp(progress);
  if (earned < requirement.ep)
    return `Earn ${formatEP(requirement.ep)} EP this cycle to ultra-rebirth. ${formatEP(requirement.ep - earned)} to go.`;
  return commitmentBlocker(progress, now);
}

export function ultraRebirthAvailable(progress, now) {
  const requirement = ultraRebirthRequirement();
  return (
    (progress.rebirths ?? 0) >= REBIRTH_TOTAL &&
    discoveredCount(progress) >= requirement.badges &&
    cycleEarnedEp(progress) >= requirement.ep &&
    !commitmentBlocker(progress, now)
  );
}
