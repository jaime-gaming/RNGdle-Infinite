import { allBadgeMetadata } from "./infinite-badges.js";
import { productById } from "./shop-data.js";
import { rebirthSkills } from "./skills.js";
import { formatEP } from "./roll-data.js";

export const BADGE_TOTAL = allBadgeMetadata.length;
const badgeIds = new Set(allBadgeMetadata.map((b) => b.id));

export const REBIRTH_OPTIONAL_KINDS = [
  "aura",
  "utility",
  "offline-cap",
  "pet-variant",
];
export const rebirthOptionalProducts = [
  ...new Set(
    [...productById.values()]
      .filter((product) => REBIRTH_OPTIONAL_KINDS.includes(product.kind))
      .map((product) => product.id),
  ),
];
const optional = new Set(rebirthOptionalProducts);

export function rebirthRelevantPurchases(owned = []) {
  return owned.filter((id) => !optional.has(id));
}

// The reducer keeps an owned product when it is an aura or a pass reward.
// This is the same rule, so the page can never promise a different outcome.
export function rebirthKeepsPurchase(id) {
  const item = productById.get(id);
  return item?.kind === "aura" || !!item?.passReward;
}

export function rebirthKeptPurchases(owned = []) {
  return [...new Set(owned)].filter(rebirthKeepsPurchase);
}

export function rebirthHandedBackPurchases(owned = []) {
  return [...new Set(owned)].filter((id) => !rebirthKeepsPurchase(id));
}

// A rung asks for a rounded-up slice of a 242-badge collection, so the honest
// share is slightly above the nominal 20/25/... label. Show the real one.
export function badgeGatePercent(badges) {
  const count = Number.isFinite(badges) ? Math.max(0, badges) : 0;
  return Math.round((1000 * count) / BADGE_TOTAL) / 10;
}

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

export const ULTRA_REBIRTH_STEP = { badges: 0.5, ep: 30000000 };

export const ULTRA_BONUS_PER_REBIRTH = 0.1;

export function ultraRebirthMultiplier(ultraRebirths = 0) {
  return 1 + ULTRA_BONUS_PER_REBIRTH * Math.max(0, ultraRebirths);
}

export const REBIRTH_BONUS_PER_REBIRTH = 0.02;

export function rebirthMultiplier(rebirths = 0) {
  return 1 + REBIRTH_BONUS_PER_REBIRTH * Math.max(0, rebirths);
}

export const REBIRTH_STARTER_EP = 250000;
export const ULTRA_STARTER_EP = 1000000;

export function cycleStarterEp(rebirths = 0, ultraRebirths = 0) {
  return (
    REBIRTH_STARTER_EP * Math.max(0, rebirths) +
    ULTRA_STARTER_EP * Math.max(0, ultraRebirths)
  );
}

const PRESTIGE_LIMIT = 3;
export const ROLLBACK_AFTER_PRESTIGES = PRESTIGE_LIMIT;
export const ROLLBACK_BONUS = 0.25;

export const ROLLBACK_STEP = { badges: 0.65, ep: 60000000 };

export function rollbackMultiplier(rollbacks = 0) {
  return 1 + ROLLBACK_BONUS * Math.max(0, rollbacks);
}

export function prestigeBenefits(progress = {}) {
  const count = Math.min(
    PRESTIGE_LIMIT,
    Math.max(0, progress.ultraRebirths ?? 0),
  );
  const next = Math.min(PRESTIGE_LIMIT, count + 1);
  const rows = [
    {
      id: "wallet",
      title: `+${Math.round(ULTRA_BONUS_PER_REBIRTH * 100)}% banked EP per Prestige`,
      detail: `Permanent. ${count ? `Current bonus: +${Math.round(count * ULTRA_BONUS_PER_REBIRTH * 100)}%.` : "Applies to online and offline income."}`,
    },
    {
      id: "starter",
      title: "A stronger new cycle",
      detail: `${formatEP(cycleStarterEp(0, next))} EP to start the next Prestige cycle, before surplus.`,
    },
    {
      id: "ladder",
      title: "The ladder starts over",
      detail:
        "All six rebirths, their skills and their +2% each go back to zero. Climb it again before the next Prestige.",
    },
    {
      id: "legacy",
      title: "Prestige title",
      detail:
        "A profile title from the first Prestige. Owned auras and Prestige bonuses stay.",
    },
  ];
  if (count >= PRESTIGE_LIMIT)
    rows.push({
      id: "next-stage",
      title: "Rollback unlocked",
      detail: "The third Prestige opens the repeatable final stage.",
    });
  else
    rows.push({
      id: "next-stage",
      title: "A further stage",
      detail: `${PRESTIGE_LIMIT - count} Prestige${PRESTIGE_LIMIT - count === 1 ? "" : "s"} left to complete this stage.`,
    });
  return rows;
}
export function rollbackBenefits(progress = {}) {
  const count = Math.max(0, progress.rollbacks ?? 0);
  return [
    {
      id: "wallet",
      title: `+${Math.round(ROLLBACK_BONUS * 100)}% banked EP per Rollback`,
      detail: `Stacks without a limit. After the next one: +${Math.round((count + 1) * ROLLBACK_BONUS * 100)}%.`,
    },
    {
      id: "repeat",
      title: "Repeatable",
      detail: "Meet the gate again each cycle. There is no final-use limit.",
    },
    {
      id: "keeps",
      title: "Keeps the Rollback bonus and the account",
      detail:
        "Rollback bonuses, the surplus bank, owned auras and account history stay. The rebirth ladder and the three prestiges start over.",
    },
    {
      id: "reset",
      title: "Starts at 0 EP",
      detail:
        "No starting grant or surplus EP transfer. Surplus can still add a permanent banked-EP bonus.",
    },
  ];
}

export const SURPLUS_START_SHARE = 0.5;
export const SURPLUS_BANKED_EP_STEP = 2_000_000;
const SURPLUS_BANKED_PER_STEP = 0.01;
export const SURPLUS_BANKED_CAP = 0.1;

export function rebirthSurplus(earned = 0, gate = 0, stage = "rebirth") {
  const above = Number.isFinite(earned) ? earned : 0;
  const surplus = Math.max(0, above - Math.max(0, gate));
  if (!surplus) return { surplus: 0, starterBonus: 0, bankedBonus: 0 };
  return {
    surplus,
    starterBonus: Math.floor(surplus * SURPLUS_START_SHARE),
    bankedBonus: Math.min(
      SURPLUS_BANKED_CAP *
        (stage === "rollback" ? 3 : stage === "prestige" ? 2 : 1),
      Math.floor(surplus / SURPLUS_BANKED_EP_STEP) * SURPLUS_BANKED_PER_STEP,
    ),
  };
}

export function surplusMultiplier(surplusBankedPercent = 0) {
  const percent = Math.max(
    0,
    Number.isFinite(surplusBankedPercent) ? surplusBankedPercent : 0,
  );
  return 1 + percent / 100;
}

export function prestigeShown(progress) {
  return (
    (progress?.rebirths ?? 0) >= REBIRTH_TOTAL ||
    (progress?.ultraRebirths ?? 0) > 0
  );
}

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

export function rollbackRequirement() {
  return {
    percent: Math.round(ROLLBACK_STEP.badges * 100),
    badges: Math.ceil(BADGE_TOTAL * ROLLBACK_STEP.badges),
    ep: ROLLBACK_STEP.ep,
  };
}

export function nextStep(progress) {
  const rung = rebirthRequirement(progress.rebirths ?? 0);
  if (rung) return { kind: "rung", ...rung };
  if ((progress.ultraRebirths ?? 0) < PRESTIGE_LIMIT)
    return { kind: "prestige", ...ultraRebirthRequirement() };
  return { kind: "rollback", ...rollbackRequirement() };
}

const fractionOf = (done, goal) => Math.min(1, done / Math.max(1, goal));

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

export function blendedPercent(count, earned, step) {
  const badges = fractionOf(count, step.badges);
  const ep = fractionOf(earned, step.ep);
  return Math.min(100, Math.floor(((badges + ep) / 2) * 100));
}

export function cycleEarnedEp(progress) {
  const history = Array.isArray(progress?.history) ? progress.history : [];
  const start = history.findLastIndex(
    (event) =>
      event.type === "rebirth" ||
      event.type === "ultra-rebirth" ||
      event.type === "rollback" ||
      event.type === "fresh-start",
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
