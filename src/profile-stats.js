import { BADGE_TOTAL, cycleEarnedEp, discoveredCount } from "./rebirth.js";
import { PETS } from "./pets.js";
import { SKILLS, skillSlots } from "./skills.js";
import { LATEST_VERSION } from "./changelog.js";

// How far you have come, in numbers.
//
// Every figure here is derived from the saved game and its activity history —
// nothing is stored twice, so the summary can never drift from the log it
// reads. A rebirth restarts the run, not the account: the log keeps every
// cycle, so these are the figures for the whole account.
export function accountStats(progress = {}) {
  const history = Array.isArray(progress.history) ? progress.history : [];
  const rolls = history.filter((event) => event.type === "roll");
  const offline = rolls.filter((event) => event.source === "offline");
  const best = rolls.reduce(
    (top, event) => (!top || event.ep > top.ep ? event : top),
    null,
  );
  const tiers = {};
  for (const roll of rolls) tiers[roll.tier] = (tiers[roll.tier] ?? 0) + 1;
  const favoriteTier =
    Object.entries(tiers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const badges = new Set();
  for (const event of history)
    if (event.type === "unlock" || event.type === "roll")
      for (const id of event.badges ?? []) badges.add(id);
  const spent = history
    .filter((event) => event.type === "purchase")
    .reduce((sum, event) => sum + (event.ep ?? 0), 0);
  return {
    rolls: rolls.length,
    onlineRolls: rolls.length - offline.length,
    offlineRolls: offline.length,
    favoriteTier,
    bestRoll: best
      ? { number: best.number, ep: best.ep, tier: best.tier, at: best.at }
      : null,
    totalEarned: progress.totalEarned ?? 0,
    balance: progress.balance ?? 0,
    spent,
    uniqueBadges: badges.size,
    badgesNow: discoveredCount(progress),
    badgesTotal: BADGE_TOTAL,
    companions: (progress.pets ?? []).length,
    companionsFound: history.filter((event) => event.type === "pet").length,
    companionsTotal: PETS.length,
    skills: (progress.skills ?? []).length,
    skillsTotal: SKILLS.length,
    skillSlots: skillSlots(progress.owned),
    skillsUsed: rolls.filter((event) => (event.skills ?? []).length).length,
    boostsUsed: rolls.filter((event) => event.flywheel === "boost").length,
    rebirths: progress.rebirths ?? 0,
    ultraRebirths: progress.ultraRebirths ?? 0,
    firstEventAt: history[0]?.at ?? null,
    lastEventAt: history.at(-1)?.at ?? null,
  };
}

// The current cycle in numbers: everything since the last rebirth (or since
// the account began, for a first cycle). It reads the same log as the account
// summary, so the rebirth page and the profile can never disagree about what
// this run has done.
export function cycleStats(progress = {}) {
  const history = Array.isArray(progress.history) ? progress.history : [];
  const start = history.findLastIndex(
    (event) => event.type === "rebirth" || event.type === "ultra-rebirth",
  );
  const events = start >= 0 ? history.slice(start + 1) : history;
  const rolls = events.filter((event) => event.type === "roll");
  const best = rolls.reduce(
    (top, event) => (!top || event.ep > top.ep ? event : top),
    null,
  );
  const badges = new Set();
  for (const event of events)
    if (event.type === "unlock")
      for (const id of event.badges ?? []) badges.add(id);
  return {
    startedAt:
      start >= 0
        ? history[start].at
        : (progress.profile?.createdAt ?? history[0]?.at ?? null),
    rebirths: progress.rebirths ?? 0,
    rolls: rolls.length,
    // The gate a rebirth reads: EP this cycle scored, straight from the log.
    earned: cycleEarnedEp(progress),
    spent: events
      .filter((event) => event.type === "purchase")
      .reduce((sum, event) => sum + (event.ep ?? 0), 0),
    badges: badges.size,
    bestRoll: best
      ? { number: best.number, ep: best.ep, tier: best.tier, at: best.at }
      : null,
  };
}

// The export is a read-only snapshot of the local save plus the figures above.
// It exists to be looked at (or kept somewhere safe) — there is deliberately
// no import, so a downloaded file can never overwrite a live game.
export function exportPayload(progress = {}) {
  const stats = accountStats(progress);
  return {
    app: "RNGdle Infinite",
    saveVersion: progress.version ?? 1,
    appVersion: LATEST_VERSION,
    exportedAt: new Date().toISOString(),
    profile: progress.profile ?? null,
    stats,
    save: {
      balance: progress.balance ?? 0,
      totalEarned: progress.totalEarned ?? 0,
      discovered: progress.discovered ?? [],
      owned: progress.owned ?? [],
      equipped: progress.equipped ?? "none",
      pets: progress.pets ?? [],
      activePet: progress.activePet ?? "none",
      skills: progress.skills ?? [],
      equippedSkills: progress.equippedSkills ?? [],
      skillCharge: progress.skillCharge ?? {},
      flywheelCharge: progress.flywheelCharge ?? 0,
      rebirths: stats.rebirths,
      ultraRebirths: stats.ultraRebirths,
      goalId: progress.goalId ?? null,
      history: progress.history ?? [],
    },
  };
}

export function exportFileName(progress = {}) {
  const name = (progress.profile?.username ?? "guest")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const stamp = new Date().toISOString().slice(0, 10);
  return `rngdle-infinite-${name || "guest"}-${stamp}.json`;
}
