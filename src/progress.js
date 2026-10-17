import { allTimeTally } from "./profile-stats.js";
import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import {
  productById,
  productPrice,
  offlineSettings,
  ROLL_DURATIONS,
  COOLDOWN_DURATIONS,
  rollSettings,
  skillStock,
  skillStockWindow,
} from "./shop-data.js";
import { flywheelAfterSettlement, flywheelRequired } from "./flywheel.js";
import { validGoal } from "./gameplay-loop.js";
import {
  rebirthBlocker,
  rebirthMultiplier,
  rebirthSurplus,
  surplusMultiplier,
  ultraRebirthBlocker,
  nextRebirthSkill,
  ultraRebirthMultiplier,
  rollbackBlocker,
  rollbackMultiplier,
  rollbackRequirement,
  cycleStarterEp,
  cycleEarnedEp,
  rebirthRequirement,
  ultraRebirthRequirement,
} from "./rebirth.js";
import { petById, PET_IDS, petMultiplier } from "./pets.js";
import manifest from "./data/game-index.json" with { type: "json" };
import {
  chargeAfterSettlement,
  drawPicksFor,
  drawPlanFor,
  parseEquippedSkills,
  parseSkillCharge,
  parseUnlockedSkills,
  rebirthSkill,
  skillById,
  skillChargeFactor,
  skillForPet,
  skillSlots,
  skillTakesSlot,
  skillUnlocked,
  skillWaivesCooldown,
  skillWalletMultiplier,
  SKILL_IDS,
  SKILL_MAX_DRAWS,
  SKILL_SLOTS,
  SKILL_SLOTS_BASE,
  trimToSlots,
} from "./skills.js";
import { parseCooldownWindow } from "./cooldown.js";
import {
  parseOffline,
  matchesOfflineCommitment,
  OFFLINE_INTERVAL,
} from "./offline.js";
import {
  BOOKMARK_LIMIT,
  capHistory,
  HISTORY_LIMIT,
  HISTORY_WARNING,
  pruneCycle,
  pruneOldest,
} from "./history-log.js";
import {
  archiveRemoved,
  parseRemovedTotals,
  tallyEntries,
} from "./history-tally.js";
import {
  CADENCE_NAME,
  claimListBonus,
  claimTask,
  EPIC_OR_BETTER,
  emptyTasks,
  LIST_BONUS,
  MYTHIC_OR_BETTER,
  parseTasks,
  periodKey,
  RARE_OR_BETTER,
  HIGH_ROLL_MIN,
  LOW_ROLL_MAX,
  recordTally,
  SKIP_HOLD_LIMIT,
  boughtSkip,
  skipStatus,
  skipTask,
  taskById,
  TASK_CADENCES,
  waitText,
} from "./tasks.js";
import {
  claimRngweenAura,
  rngweenAuraIds,
  recordRngweenTally,
} from "./rngween.js";
import {
  EP_PER_PUMPKOIN,
  RNGWEEN_PET,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  RNGWEEN_TEMP_SKILL_IDS,
  RNGWEEN_WORLD_TARGET,
  emptyRngweenLimited,
  grantRngweenMissionPumpkoins,
  rngweenWorldUnlocked,
  limitedItemById,
  limitedRewardIds,
  parseRngweenLimited,
  requireRngweenLimited,
  requireRngweenWorld,
  requireRngweenValley,
  retireRngweenLimited,
} from "./rngween-limited.js";
import {
  RNGWEEN_AURAS,
  RNGWEEN_ID,
  RNGWEEN_WORLD_SKIN,
  rngweenCalendar,
} from "./rngween.js";
import {
  hourlyTaskById,
  mainHourlyTally,
  worldHourlyTally,
  claimRngweenHourly,
  recordRngweenHourly,
  refreshRngweenHourly,
} from "./rngween-hourly.js";
import { WORLD_MINI_RULES } from "./rngween-world-badges.js";
import {
  worldState,
  worldRevealMS,
  worldSpeedLevel,
  worldSpeedById,
  requireWorldZone,
  recordWorldOutcome,
  rngweenValleyUnlocked,
} from "./rngween-world-zones.js";
export { HISTORY_LIMIT, HISTORY_WARNING };
export const PROGRESS_KEY = "rng-infinite-progress-v1";
// Guests have no saved account, so the one thing worth protecting — the roll
// they already committed and its deadline — lives in sessionStorage under this
// key for the life of the tab. It is also cleared whenever a save is imported,
// so a stale guest roll can never ride along with the imported one.
export const GUEST_ROLL_KEY = "rng-infinite-guest-roll-v1";
// Before a repaired save is written back, the exact bytes it was repaired
// from are stashed here, so a bad repair can always be undone by hand.
export const PRE_REPAIR_BACKUP_KEY = "rng-infinite-progress-pre-repair-v1";
// A rack holds at most five skills, so four saved racks is a full set: one for
// each thing a player might be doing, and no room to hoard.
export const LOADOUT_LIMIT = 4;
const badgeIds = new Set(metadata.map((b) => b.id));
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;
// The settled rolls the save remembers by id. Older rolls leave the list; the
// watermark (receiptFloor) is what still refuses a copy of one of them.
const RECEIPT_LIMIT = 128;

// Closest legal amount to a stored value: whole EP figures stay untouched,
// finite non-negative numbers are truncated into range, and anything else
// (negatives, strings, objects) falls back — never throws.
function repairAmount(value, fallback = 0) {
  if (validAmount(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER);
  return fallback;
}

// One short phrase for a repair note, so the warning can say what the stored
// value was without pasting an entire object into the interface.
function describeStored(value) {
  if (typeof value === "string") return `"${value.slice(0, 24)}"`;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value == null) return "missing";
  return Array.isArray(value) ? "a list" : "an object";
}

// A profile id for a save whose own id is gone. The game already depends on
// crypto.randomUUID for event ids; the fallback is only for contexts where
// crypto itself is unavailable, so a repair can never throw.
function freshProfileId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `repaired-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
  }
}

// The wallet multiplier of a settled roll: companions, rebirth, prestige and
// Rollback bonuses, and any wallet skill that fired. It only ever scales
// the EP that reaches the wallet — the scored roll, its tier and its rank
// never move.
export function walletMultiplier(
  progress,
  skillIds = progress.pendingRoll?.skills,
) {
  return (
    petMultiplier(progress.activePet) *
    rebirthMultiplier(progress.rebirths ?? 0) *
    ultraRebirthMultiplier(progress.ultraRebirths ?? 0) *
    rollbackMultiplier(progress.rollbacks ?? 0) *
    surplusMultiplier(progress.surplusBanked ?? 0) *
    skillWalletMultiplier(skillIds ?? [])
  );
}

// The skills a settled roll actually fired. Only a committed, online roll can
// activate one, so an offline batch or a duplicate receipt activates nothing.
function firedSkills(state, id, source) {
  if (source === "offline" || state.pendingRoll?.id !== id) return [];
  return (state.pendingRoll.skills ?? []).filter((skillId) =>
    skillById.has(skillId),
  );
}

// The activity log is the account's story, so a new cycle never clears it:
// rebirths, rolls, purchases and unlocks from every past cycle stay readable.
// Entries are only ever appended here. The cap is applied once, in
// applyProgress, so every action makes room the same way: the oldest entries
// that are neither cycle markers nor bookmarked rolls go first.
function appendHistory(history, events = []) {
  return [...(history ?? []), ...events];
}

// Equipping is free. A newly unlocked skill takes a free slot instead of
// silently doing nothing; a full rack is left exactly as the player set it.
function autoEquip(equipped, progress, id) {
  const list = [...new Set(equipped)].filter((skillId) =>
    skillUnlocked(skillId, progress),
  );
  if (!id || !skillById.has(id) || list.includes(id)) return list;
  // Only shop skills and companion signatures count towards the rack's slots:
  // rebirth rewards ride free, so they always fit.
  if (skillTakesSlot(id)) {
    const taken = list.filter(skillTakesSlot).length;
    if (taken >= skillSlots(progress.owned ?? [])) return list;
  }
  return [...list, id];
}

export function emptyProgress() {
  return {
    version: 1,
    profile: null,
    balance: 0,
    totalEarned: 0,
    discovered: [],
    owned: [],
    equipped: "none",
    cooldownUntil: 0,
    receipts: [],
    receiptFloor: 0,
    history: [],
    // What has left the log, one tally per cycle (see history-tally.js).
    removedTotals: [],
    cycleEarnedEP: 0,
    pendingRoll: null,
    offline: null,
    flywheelCharge: 0,
    goalId: null,
    rebirths: 0,
    ultraRebirths: 0,
    rollbacks: 0,
    freshStarts: 0,
    surplusBanked: 0,
    cooldownWindow: null,
    pets: [],
    activePet: "none",
    skills: [],
    equippedSkills: [],
    skillCharge: {},
    loadouts: [],
    bookmarks: [],
    tasks: emptyTasks(),
    rngweenLimited: emptyRngweenLimited(),
    // Events this account has been to: { [eventId]: { at } }, stamped the
    // first time the account opens the game while the event is on. It
    // belongs to the account, not the run: rebirths, prestiges, rollbacks and
    // fresh starts all keep it. Only deleting the account removes it.
    events: {},
  };
}

export const KNOWN_EVENTS = new Set([RNGWEEN_ID]);
// Only known events, each with one valid first-visit time.
function parseEvents(value) {
  const events = {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    return events;
  for (const id of KNOWN_EVENTS) {
    const at = value[id]?.at;
    if (validAmount(at) && at > 0 && at <= 8640000000000000)
      events[id] = { at };
  }
  return events;
}

// Bookmarks pin a few rolls the player wants to find again. They reference
// history entries by id, so a repaired save drops any mark whose roll did not
// survive the repair. The cap lives in history-log.js (next to the pruning
// rules that honour it) and is re-exported here as part of the save's shape.
export { BOOKMARK_LIMIT };

// The fresh-start offer and action share one rule: three prestiges or more.
export const FRESH_START_PRESTIGES = 3;
export function freshStartEligible(progress = {}) {
  return (
    !!progress.profile && (progress.ultraRebirths ?? 0) >= FRESH_START_PRESTIGES
  );
}
function parseBookmarks(value, history) {
  if (!Array.isArray(value)) return [];
  const rolls = new Set(
    history.filter((e) => e.type === "roll").map((e) => e.id),
  );
  const out = [];
  for (const id of value) {
    if (typeof id !== "string" || !id || !rolls.has(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= BOOKMARK_LIMIT) break;
  }
  return out;
}
// Saved racks. Parsed leniently — a preset is only checked against what the
// account can actually equip when it is applied, because a save can outlive the
// skills that were in it.
function parseLoadouts(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value.slice(0, LOADOUT_LIMIT)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || !entry.id) continue;
    if (!Array.isArray(entry.skills)) continue;
    // A saved rack holds free skills without limit; only its shop skills are
    // capped, at the widest the rack can ever be.
    const skills = trimToSlots(
      [
        ...new Set(
          entry.skills.filter(
            (id) => typeof id === "string" && SKILL_IDS.includes(id),
          ),
        ),
      ],
      SKILL_SLOTS_BASE + SKILL_SLOTS.length,
    );
    if (!skills.length) continue;
    const name =
      typeof entry.name === "string" ? entry.name.trim().slice(0, 40) : "";
    if (out.some((saved) => saved.id === entry.id)) continue;
    out.push({ id: entry.id, name: name || loadoutName(skills), skills });
  }
  return out;
}

// The name a saved rack earns for itself: the skills it holds, in order.
export function loadoutName(skills = []) {
  const names = skills.map((id) => skillById.get(id)?.name ?? id);
  if (!names.length) return "Empty rack";
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names.length - 1} more`;
}

// ---- Self-repairing saves -------------------------------------------------
// A save the game itself wrote must never brick an account over one bad
// value: instead of rejecting the whole file, the loader repairs what it can
// — clamping an overcharged circle, discarding an unverifiable roll,
// rebuilding a list from the purchases that paid for it — and reports every
// fix it made. Only data that is not a save at all (unparseable JSON, a
// foreign version envelope) is still rejected.
export function parseAndRepairProgress(raw) {
  if (raw === null) return { progress: emptyProgress(), repairs: [] };
  const repairs = [];
  const note = (message) => repairs.push(message);
  const p = JSON.parse(raw);
  if (!p || p.version !== 1) throw new Error("Unrecognized save version");
  // Wallet figures. The all-time earned total is trusted over the wallet: a
  // balance above it is clamped down so no EP is ever invented, while an
  // unreadable total is rebuilt from a healthy wallet instead of wiping it.
  let totalEarned = repairAmount(p.totalEarned);
  let balance = repairAmount(p.balance);
  if (!validAmount(p.totalEarned) && validAmount(p.balance))
    totalEarned = Math.max(totalEarned, balance);
  else if (balance > totalEarned) balance = totalEarned;
  if (balance !== p.balance)
    note(
      `wallet balance was ${describeStored(p.balance)}, so it was set to ${balance.toLocaleString("en-US")} EP.`,
    );
  if (totalEarned !== p.totalEarned)
    note(
      `all-time earned EP was ${describeStored(p.totalEarned)}, so it was set to ${totalEarned.toLocaleString("en-US")} EP.`,
    );
  const cooldownBase = repairAmount(p.cooldownUntil);
  if (cooldownBase !== p.cooldownUntil)
    note("roll cooldown timer was unreadable, so it was reset.");
  for (const [field, label] of [
    ["discovered", "badge collection"],
    ["owned", "owned upgrades"],
    ["receipts", "roll receipts"],
  ])
    if (!Array.isArray(p[field])) {
      note(`The ${label} list was unreadable, so it was reset.`);
      p[field] = [];
    }
  let owned = [...new Set(p.owned.filter((id) => productById.has(id)))];
  // Prune to a fixed point: late-game chains can be deeper than three levels.
  let priorLength;
  do {
    priorLength = owned.length;
    owned = owned.filter(
      (id) =>
        !productById.get(id).requires ||
        owned.includes(productById.get(id).requires),
    );
  } while (owned.length !== priorLength);
  // An overcharged Flywheel is clamped to what the owned model holds — a
  // cheaper model from a newer balance patch must never brick the save.
  const flywheelMax = owned.includes("flywheel") ? flywheelRequired(owned) : 0;
  const flywheelCharge =
    flywheelMax > 0 ? Math.min(repairAmount(p.flywheelCharge), flywheelMax) : 0;
  if (
    flywheelMax > 0 &&
    p.flywheelCharge != null &&
    flywheelCharge !== p.flywheelCharge
  )
    note(
      `Flywheel charge was ${describeStored(p.flywheelCharge)}, so it was clamped to ${flywheelCharge}.`,
    );
  const rebirths = repairAmount(p.rebirths ?? 0);
  if ((p.rebirths ?? 0) !== rebirths)
    note(
      `rebirth count was ${describeStored(p.rebirths)}, so it was set to ${rebirths}.`,
    );
  const ultraRebirths = repairAmount(p.ultraRebirths ?? 0);
  if ((p.ultraRebirths ?? 0) !== ultraRebirths)
    note(
      `prestige count was ${describeStored(p.ultraRebirths)}, so it was set to ${ultraRebirths}.`,
    );
  // Rollbacks can be taken again and again, so the count is any whole number.
  const rollbacks = repairAmount(p.rollbacks ?? 0);
  if ((p.rollbacks ?? 0) !== rollbacks)
    note(
      `Rollback count was ${describeStored(p.rollbacks)}, so it was set to ${rollbacks}.`,
    );
  const freshStarts = repairAmount(p.freshStarts ?? 0);
  if ((p.freshStarts ?? 0) !== freshStarts)
    note(
      `fresh start count was ${describeStored(p.freshStarts)}, so it was set to ${freshStarts}.`,
    );
  const surplusBanked = Math.min(repairAmount(p.surplusBanked ?? 0), 100);
  if ((p.surplusBanked ?? 0) !== surplusBanked)
    note(
      `surplus dividend was ${describeStored(p.surplusBanked)}, so it was set to ${surplusBanked}.`,
    );
  // An unreadable cycle total is simply recalculated from the activity log
  // below, instead of blocking the whole load.
  const cycleOverride = validAmount(p.cycleEarnedEP) ? p.cycleEarnedEP : null;
  if (p.cycleEarnedEP != null && cycleOverride === null)
    note("cycle EP total was unreadable, so it was recalculated from history.");
  // Skill charges clamp to what each circle holds — exactly the failure an
  // older, more expensive balance used to cause — while unknown keys keep
  // being dropped silently: they are future skills, not corruption.
  const skillCharge = parseSkillCharge(p.skillCharge);
  if (p.skillCharge != null) {
    if (typeof p.skillCharge !== "object" || Array.isArray(p.skillCharge)) {
      note("skill charges were unreadable, so every circle was reset.");
    } else {
      for (const [id, charge] of Object.entries(p.skillCharge)) {
        const skill = skillById.get(id);
        if (!skill || skillCharge[id] === charge) continue;
        note(
          `skill "${skill.name}" had ${describeStored(charge)} charges but holds ${skill.charges}, so it was ${skillCharge[id] === undefined ? "reset" : `clamped to ${skillCharge[id]}`}.`,
        );
      }
    }
  }
  const history = parseHistory(p.history);
  if (Array.isArray(p.history) && history.length < p.history.length) {
    const dropped = p.history.length - history.length;
    note(
      `${dropped} activity-log ${dropped === 1 ? "entry was" : "entries were"} unreadable and ${dropped === 1 ? "was" : "were"} removed.`,
    );
  }
  // What bulk delete or the cap took out of the log is kept as per-cycle
  // tallies, so the profile still counts it. An unreadable tally is reset.
  const removedRead = parseRemovedTotals(p.removedTotals);
  if (removedRead.repaired)
    note(
      "some profile totals from removed activity were unreadable, so they were reset.",
    );
  const removedTotals = removedRead.totals;
  // Aura purchases survive every cycle. A surviving positive purchase
  // receipt can restore a missing ownership entry, but never spend/refund EP.
  let restoredAuras = 0;
  for (const entry of history)
    if (
      entry.type === "purchase" &&
      entry.ep > 0 &&
      productById.get(entry.productId)?.kind === "aura" &&
      !productById.get(entry.productId).eventOnly &&
      !owned.includes(entry.productId)
    ) {
      owned.push(entry.productId);
      restoredAuras++;
    }
  if (restoredAuras)
    note("purchased aura ownership was restored from your receipts.");
  // Task progress belongs to the save alone, so an unreadable slot is simply
  // reset: nothing else in the save can vouch for it.
  // Retire the old task event without losing already-collected cosmetics.
  const retired = p.tasks?.event;
  if (
    retired?.id === "randomness-signal-2026" &&
    Array.isArray(retired.earned)
  ) {
    for (const [id, metric, goal] of [
      ["static", "rolls", 20],
      ["bitstorm", "rare", 5],
      ["scramble", "banked", 400000],
      ["hexdump", "taskClaims", 6],
    ])
      if (
        retired.earned.includes(id) &&
        validAmount(retired.counts?.[metric]) &&
        retired.counts[metric] >= goal &&
        !owned.includes(id)
      )
        owned.push(id);
  }
  const tasksRead = parseTasks(p.tasks);
  if (tasksRead.repaired)
    note("task progress was unreadable, so it was reset.");
  const limitedRead = parseRngweenLimited(p.rngweenLimited, {
    owned,
    history,
    earnedAuras: rngweenAuraIds(tasksRead.tasks),
  });
  const rngweenLimited = limitedRead.limited;
  // A surviving coin-reward receipt also repairs a missing paid-mission flag.
  // History deletion is safe in the other direction: the explicit flag stays.
  if (!rngweenLimited.retired) {
    const paid = rngweenLimited.rewardedMissions;
    for (const entry of history)
      if (entry.type === "rngween-mission" && !paid.includes(entry.productId)) {
        paid.push(entry.productId);
        limitedRead.repaired = true;
      }
  }
  if (limitedRead.repaired)
    note(
      "some limited-shop or world progress was repaired; valid unseen-number receipts were kept.",
    );
  for (const id of limitedRewardIds(rngweenLimited))
    if (!owned.includes(id)) owned.push(id);
  if (rngweenLimited.bought?.includes(RNGWEEN_SKILL.id)) {
    if (!owned.includes(RNGWEEN_SKILL.id)) owned.push(RNGWEEN_SKILL.id);
  } else {
    const index = owned.indexOf(RNGWEEN_SKILL.id);
    if (index >= 0) owned.splice(index, 1);
  }
  for (const id of RNGWEEN_TEMP_SKILL_IDS)
    if (
      !(rngweenLimited.bought ?? []).includes(
        id === RNGWEEN_SKILL.id ? id : RNGWEEN_PET.id,
      )
    )
      delete skillCharge[id];
  // Collected Halloween mission receipts preserve these cosmetics, including
  // after the season ends or a save loses an owned-list entry.
  for (const id of rngweenAuraIds(tasksRead.tasks))
    if (productById.get(id)?.kind === "aura" && !owned.includes(id))
      owned.push(id);
  // Lists that the rest of the save can vouch for are rebuilt from it: the
  // activity log remembers every companion found or bought, and purchases
  // plus rebirths re-unlock every skill. Nothing else can vouch for a wallet
  // figure, so those fall back to zero above instead.
  let petsInput = p.pets;
  if (p.pets != null && !Array.isArray(p.pets)) {
    note("companion list was unreadable, so it was rebuilt from your history.");
    // Companions found or bought in entries that were since removed still count.
    petsInput = [
      ...tallyEntries(history).pets,
      ...removedTotals.flatMap((tally) => tally?.pets ?? []),
    ];
  }
  const pets = [
    ...new Set([
      ...(petsInput ?? []).filter(
        (id) => petById.has(id) && !petById.get(id).eventOnly,
      ),
      ...(rngweenLimited.bought?.includes(RNGWEEN_PET.id)
        ? [RNGWEEN_PET.id]
        : []),
    ]),
  ].sort((a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b));
  // Only an owned pet can be active; anything else falls back to no pet.
  const activePet = pets.includes(p.activePet) ? p.activePet : "none";
  let skillsInput = p.skills;
  if (p.skills != null && !Array.isArray(p.skills)) {
    note(
      "unlocked skills were unreadable, so they were rebuilt from your purchases and rebirths.",
    );
    skillsInput = [
      ...owned.filter((id) => skillById.get(id)?.source === "shop"),
      ...Array.from(
        { length: Math.min(rebirths, 6) },
        (_, rung) => rebirthSkill(rung + 1)?.id,
      ).filter(Boolean),
    ];
  }
  const skills = parseUnlockedSkills(
    [
      ...(Array.isArray(skillsInput) ? skillsInput : []),
      ...(rngweenLimited.bought?.includes(RNGWEEN_SKILL.id)
        ? [RNGWEEN_SKILL.id]
        : []),
    ],
    { owned, rngweenLimited },
  );
  if (p.equippedSkills != null && !Array.isArray(p.equippedSkills))
    note("skill rack was unreadable, so it was emptied.");
  const equippedSkills = parseEquippedSkills(p.equippedSkills, {
    rngweenLimited,
    owned,
    skills,
    pets,
    activePet,
  });
  // An unverifiable committed roll is discarded instead of bricking the
  // account: its number was never revealed, so nothing of value is lost, and
  // the stored cooldown is kept as-is.
  let pendingRoll = null;
  try {
    pendingRoll = parsePending(p.pendingRoll, owned);
  } catch {
    if (p.pendingRoll != null)
      note("a committed roll could not be verified, so it was discarded.");
  }
  // The profile is repaired piece by piece — a fresh id, a placeholder name,
  // the current time — so the save keeps loading as the same funded account
  // instead of degrading into a guest session that a sign-up would wipe.
  let profile = null;
  if (p.profile != null) {
    const stored = typeof p.profile === "object" ? p.profile : {};
    if (typeof p.profile !== "object")
      note(
        "local profile was unreadable, so a new one was issued — wallet, collection and upgrades are untouched.",
      );
    const id =
      typeof stored.id === "string" && stored.id ? stored.id : freshProfileId();
    if (id !== stored.id)
      note(
        "profile id was unreadable, so a new one was issued — device links need re-creating.",
      );
    const username = validUsername(stored.username)
      ? stored.username
      : `player-${id.replace(/-/g, "").slice(0, 8)}`;
    if (username !== stored.username)
      note(`profile name was unreadable, so it was set to "${username}".`);
    const createdAt = validAmount(stored.createdAt)
      ? stored.createdAt
      : Date.now();
    if (createdAt !== stored.createdAt)
      note("profile creation date was unreadable, so it was reset.");
    const avatar = parseAvatar(stored.avatar);
    profile = {
      id,
      username,
      createdAt,
      // A profile only carries a logo once one was uploaded: a save with no
      // picture keeps exactly the shape it had before logos existed.
      ...(avatar ? { avatar } : {}),
    };
  }
  // A committed roll already states when it ends. Trusting a separately stored
  // cooldownUntil let an edited save keep its number while truncating (or
  // zeroing) the deadline, cancelling the wait entirely. The deadline can only
  // ever be extended by the roll in flight, never shortened by one.
  const pendingEnd = pendingRoll
    ? pendingRoll.startedAt + pendingRoll.rollMS + pendingRoll.cooldownMS
    : 0;
  const cooldownUntil = Math.min(
    Math.max(cooldownBase, pendingEnd),
    Number.MAX_SAFE_INTEGER,
  );
  let offline = null;
  try {
    offline = parseOffline(p.offline, owned);
  } catch {
    // Only the timestamp is salvageable: a pending batch or report that fails
    // validation is discarded rather than trusted.
    const lastSeenAt = p.offline?.lastSeenAt;
    offline =
      p.offline != null &&
      owned.includes("offline-roller") &&
      Number.isSafeInteger(lastSeenAt) &&
      lastSeenAt >= 0 &&
      lastSeenAt <= 8640000000000000
        ? { lastSeenAt, batch: null, report: null }
        : null;
    if (p.offline != null)
      note(
        "saved offline rewards were unreadable, so they were discarded — wallet and history are untouched.",
      );
  }
  const progress = {
    version: 1,
    history,
    removedTotals,
    cycleEarnedEP: cycleEarnedEp({
      history,
      ...(cycleOverride != null ? { cycleEarnedEP: cycleOverride } : {}),
    }),
    pendingRoll,
    cooldownWindow: parseCooldownWindow(
      p.cooldownWindow,
      cooldownUntil,
      pendingRoll,
    ),
    rebirths,
    ultraRebirths,
    rollbacks,
    freshStarts,
    surplusBanked,
    offline,
    flywheelCharge,
    profile,
    goalId: validGoal(p.goalId, owned, pets) ? p.goalId : null,
    balance,
    totalEarned,
    discovered: [...new Set(p.discovered.filter((id) => badgeIds.has(id)))],
    owned,
    equipped:
      owned.includes(p.equipped) && productById.get(p.equipped)?.kind === "aura"
        ? p.equipped
        : "none",
    pets: pets,
    activePet,
    skills,
    equippedSkills,
    loadouts: parseLoadouts(p.loadouts),
    bookmarks: parseBookmarks(p.bookmarks, history),
    events: parseEvents(p.events),
    tasks: tasksRead.tasks,
    rngweenLimited,
    skillCharge,
    cooldownUntil,
    receipts: [
      ...new Set(
        p.receipts.filter((id) => typeof id === "string" && id.length <= 100),
      ),
    ].slice(-RECEIPT_LIMIT),
    receiptFloor: validAmount(p.receiptFloor) ? p.receiptFloor : 0,
  };
  return { progress, repairs };
}

// The strict-looking loader every caller already uses: it repairs instead of
// rejecting, so a save is only ever unreadable when it is not a save at all.
// Callers that want to tell the player what was fixed use
// parseAndRepairProgress directly.
export function parseProgress(raw) {
  return parseAndRepairProgress(raw).progress;
}
// Cosmetics are never spent or revoked. A same-account linked snapshot that
// loses a redundant ownership field must not erase a known permanent reward.
// A different profile is adopted separately, never given this account's skins.
export function preservePermanentCosmetics(previous, next) {
  if (!previous.profile || previous.profile.id !== next.profile?.id)
    return next;
  const rngweenPermanent = new Set([
    ...RNGWEEN_AURAS.map((aura) => aura.id),
    RNGWEEN_WORLD_SKIN.id,
  ]);
  const known = [
    ...new Set([
      ...(previous.owned ?? []),
      ...limitedRewardIds(previous.rngweenLimited),
    ]),
  ].filter((id) => productById.get(id)?.kind === "aura");
  const missing = known.filter(
    (id) =>
      !next.owned.includes(id) ||
      (rngweenPermanent.has(id) &&
        !limitedRewardIds(next.rngweenLimited).includes(id)),
  );
  if (!missing.length) return next;
  const limited = next.rngweenLimited;
  return {
    ...next,
    owned: [...new Set([...next.owned, ...known])],
    rngweenLimited: {
      ...limited,
      auras: [
        ...new Set([
          ...(limited.auras ?? []),
          ...known.filter(
            (id) => rngweenPermanent.has(id) && id !== RNGWEEN_WORLD_SKIN.id,
          ),
        ]),
      ],
      skinEarned: limited.skinEarned || known.includes(RNGWEEN_WORLD_SKIN.id),
    },
  };
}
// One committed offline number, its wallet credit and its batch pointer move
// together. The caller persists a bounded chunk under the account writer lock.
export function settleOfflineRoll(state, result, reportAt, calendarAt = null) {
  const batch = state.offline?.batch;
  if (!state.profile || !state.owned.includes("offline-roller") || !batch)
    throw new Error("No saved offline batch is waiting to settle.");
  const action = {
    type: "complete",
    source: "offline",
    id: `${batch.id}:${batch.index}`,
    result,
    at:
      batch.since + (batch.index + 1) * (batch.intervalMS ?? OFFLINE_INTERVAL),
    rngweenAt: calendarAt,
    cooldownUntil: state.cooldownUntil,
  };
  if (
    !matchesOfflineCommitment(state.offline, action) ||
    !validAmount(reportAt)
  )
    throw new Error("The offline result does not match the saved commitment.");
  const paid = applyProgress(state, action);
  const index = batch.index + 1;
  const ep = batch.ep + (paid.balance - state.balance);
  const newBadges =
    batch.newBadges + (paid.discovered.length - state.discovered.length);
  if (![ep, newBadges].every(validAmount))
    throw new Error("Offline reward totals could not be saved.");
  const finished = index === batch.numbers.length;
  return {
    ...paid,
    pendingRoll: state.pendingRoll,
    offline: {
      ...state.offline,
      batch: finished ? null : { ...batch, index, ep, newBadges },
      report: finished
        ? {
            id: batch.id,
            at: reportAt,
            rolls: (state.offline.report?.rolls ?? 0) + batch.numbers.length,
            ep: (state.offline.report?.ep ?? 0) + ep,
            newBadges: (state.offline.report?.newBadges ?? 0) + newBadges,
          }
        : state.offline.report,
    },
  };
}

export function validUsername(value) {
  return typeof value === "string" && /^[\p{L}\p{N}_-]{3,20}$/u.test(value);
}

// The profile picture is an optional logo the player uploads. It travels inside
// the save — which is exactly what makes it follow a device link — so it is
// kept small, inline, and strictly validated: one image data URL, no markup,
// no remote address, and a hard ceiling on how much of the save it may take.
export const AVATAR_LIMIT = 240000;
export const AVATAR_MIME = ["image/png", "image/jpeg", "image/webp"];
const AVATAR_RE = new RegExp(
  `^data:(?:${AVATAR_MIME.map((mime) => mime.replace("/", "\\/")).join("|")});base64,[A-Za-z0-9+/]+={0,2}$`,
);

export function validAvatar(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AVATAR_LIMIT &&
    AVATAR_RE.test(value)
  );
}

// A save never carries a half-written picture: an unreadable logo is dropped
// rather than allowed to brick an account over a cosmetic field.
function parseAvatar(value) {
  if (typeof value !== "string" || !value) return "";
  return validAvatar(value) ? value : "";
}

// What a new cycle hands back, shared by a rebirth, a prestige and the Rollback.
//
// A cycle restarts the run, not the account: the badge collection, non-aura
// purchases, companions and wallet start over. Every owned aura is part of the
// lasting collection, so it stays equipped or in the wardrobe. What the
// account *did* is never undone: the activity history, rebirth, prestige and
// Rollback counters with their permanent bonuses, ladder skills, all-time EP
// and profile all stay.
//
// `granted` is the ladder skill this rebirth pays, which is earned rather than
// bought and so joins the skills that survived, and `starter` is the EP the new
// cycle begins with — paid by the rungs, prestiges and Rollback the account keeps.
// `resetLadder` is what a prestige or a Rollback does on top: the six rungs are
// climbed again from zero, so the ladder skills and their +2% go back too.
function startNewCycle(
  state,
  { granted = null, starter = 0, resetLadder = false } = {},
) {
  const owned = [...new Set(state.owned ?? [])].filter(
    (id) =>
      productById.get(id)?.kind === "aura" ||
      (id === RNGWEEN_SKILL.id && state.rngweenLimited?.bought?.includes(id)),
  );
  // Shop skills are purchases: they go back on the stall. Ladder skills were
  // paid for by the rebirths the cycle keeps, so they stay unlocked — unless
  // the ladder itself is being reset, when they return rung by rung.
  const kept = (state.skills ?? []).filter(
    (id) =>
      skillById.get(id)?.source !== "shop" &&
      (!resetLadder || skillById.get(id)?.source !== "rebirth"),
  );
  const skills = granted ? [...new Set([...kept, granted.id])] : kept;
  const base = {
    ...state,
    owned,
    pets: state.rngweenLimited?.bought?.includes(RNGWEEN_PET.id)
      ? [RNGWEEN_PET.id]
      : [],
    activePet:
      state.activePet === RNGWEEN_PET.id &&
      state.rngweenLimited?.bought?.includes(RNGWEEN_PET.id)
        ? RNGWEEN_PET.id
        : "none",
    skills,
  };
  // The rack is rebuilt rather than repaired: the skill this rebirth pays goes
  // on first, then whatever the cycle kept. Ladder skills ride free, so the
  // rack keeps them all; only the shop and pet skills left behind took slots.
  let equippedSkills = autoEquip([], base, granted?.id);
  for (const id of skills) equippedSkills = autoEquip(equippedSkills, base, id);
  const signature = skillForPet(base.activePet);
  if (signature) equippedSkills = autoEquip(equippedSkills, base, signature.id);
  // Charge belongs to the skill it fills: what went back on the shelf — and
  // the companions' signature skills — take their charge with them.
  const skillCharge = Object.fromEntries(
    Object.entries(state.skillCharge ?? {}).filter(([id]) =>
      skills.includes(id),
    ),
  );
  return {
    ...base,
    equippedSkills,
    skillCharge,
    // The wallet empties and the ladder refills it: the starting sum is paid
    // into both figures at once, so the balance can never outgrow what the
    // account has been given.
    balance: starter,
    totalEarned: state.totalEarned + starter,
    discovered: [],
    equipped: owned.includes(state.equipped) ? state.equipped : "none",
    // The tracked goal is a preference, not a reward: it survives when it is
    // still reachable from an empty workshop. Companions go back in the wild
    // at a rebirth too, so a companion goal is reachable again.
    goalId: validGoal(state.goalId, owned, []) ? state.goalId : null,
    flywheelCharge: 0,
    // Offline earnings are a tool, and the tool was handed back.
    offline: null,
    pendingRoll: null,
    cooldownUntil: 0,
    cooldownWindow: null,
    cycleEarnedEP: 0,
    // Saved racks belong to the run: the skills they were built from were
    // handed back with the rest of the shop.
    loadouts: [],
  };
}
// Every action goes through here, so the log is capped the same way for all of
// them. Only an action that actually changed the save can grow the log.
// A repeatable product is bought again and again, and every purchase adds a use
// instead of ownership, so it never enters the owned list. The Task Skip is the
// only one: one purchase a day, and no more than three in any five days, on the
// game clock, so a stack of uses cannot be bought in one sitting.
function buyTaskSkip(state, item, action) {
  const at = action.at ?? Math.ceil(Date.now());
  if (!validAmount(at) || at > 8640000000000000)
    throw new Error("Invalid purchase time");
  const status = skipStatus(state.tasks, at);
  const price = productPrice(item, at);
  if (status.tokens >= SKIP_HOLD_LIMIT)
    throw new Error(
      `You already hold ${SKIP_HOLD_LIMIT} Task Skips. Use one first. No EP was spent.`,
    );
  if (status.waitMs > 0)
    throw new Error(
      `The next Task Skip is available in ${waitText(status.waitMs)}. No EP was spent.`,
    );
  if (state.balance < price) throw new Error("Not enough EP for this item.");
  const tasks = state.tasks ?? emptyTasks();
  return {
    ...state,
    history: appendHistory(state.history, [
      {
        id: action.eventId ?? `buy:${item.id}:${at}`,
        type: "purchase",
        at,
        productId: item.id,
        name: item.name,
        ep: price,
      },
    ]),
    balance: state.balance - price,
    tasks: {
      ...tasks,
      skip: boughtSkip(state.tasks, at),
    },
  };
}

// Collected event missions unlock their matching aura as an ordinary wardrobe
// item. The mission receipt restores that owned-list entry after a save repair.
function grantRngweenAuras(state, tasks) {
  const earned = rngweenAuraIds(tasks).filter(
    (id) => productById.get(id)?.kind === "aura",
  );
  const current = state.owned ?? [];
  const additions = earned.filter((id) => !current.includes(id));
  return {
    ...state,
    tasks,
    rngweenLimited: {
      ...state.rngweenLimited,
      auras: [...new Set([...(state.rngweenLimited?.auras ?? []), ...earned])],
    },
    ...(additions.length
      ? {
          owned: [...current, ...additions],
          // Match a normal aura purchase: the first one is shown straight away,
          // while later mission rewards never replace a player's choice.
          equipped:
            (state.equipped ?? "none") === "none"
              ? additions[0]
              : state.equipped,
          goalId: additions.includes(state.goalId)
            ? null
            : (state.goalId ?? null),
        }
      : {}),
  };
}

// Pays one finished task of a cadence into the wallet, logged as income with the
// name it had when paid, like any other task reward. The list bonus is not paid
// here: finishing the list only unlocks it, and collectBonus pays it.
function payTask(state, task, at, eventId = null, rngweenAt = at) {
  let tasks = claimTask(state.tasks ?? emptyTasks(), task, at);
  tasks = {
    ...tasks,
    rngween: recordRngweenTally(tasks, { taskClaims: 1 }, rngweenAt),
  };
  const balance = state.balance + task.reward;
  const totalEarned = state.totalEarned + task.reward;
  if (!validAmount(balance) || !validAmount(totalEarned))
    throw new Error("EP balance limit reached.");
  return grantRngweenAuras(
    {
      ...state,
      balance,
      totalEarned,
      history: appendHistory(state.history, [
        {
          id: eventId ?? `task:${task.id}:${periodKey(task.cadence, at)}`,
          type: "task",
          at,
          taskId: task.id,
          cadence: task.cadence,
          name: task.title,
          ep: task.reward,
        },
      ]),
    },
    tasks,
  );
}

// Pays the list bonus of one cadence once every task on its list is claimed. It
// is logged as a task line, and never counts towards a rebirth.
function collectBonus(state, cadence, at, eventId = null) {
  const tasks = claimListBonus(state.tasks ?? emptyTasks(), cadence, at);
  const paid = LIST_BONUS[cadence];
  const balance = state.balance + paid;
  const totalEarned = state.totalEarned + paid;
  if (!validAmount(balance) || !validAmount(totalEarned))
    throw new Error("EP balance limit reached.");
  return {
    ...state,
    tasks,
    balance,
    totalEarned,
    history: appendHistory(state.history, [
      {
        id: eventId ?? `bonus:${cadence}:${periodKey(cadence, at)}`,
        type: "task",
        at,
        taskId: `${cadence}-list`,
        cadence,
        name: `${CADENCE_NAME[cadence]} list bonus`,
        ep: paid,
      },
    ]),
  };
}

export function applyProgress(state, action) {
  const verifiedAt =
    action.rngweenAt === undefined ? action.at : action.rngweenAt;
  const next = applyEvent(retireRngweenLimited(state, verifiedAt), action);
  if (next === state || !Array.isArray(next.history)) return next;
  if (next.history.length <= HISTORY_LIMIT) return next;
  // What the cap trims out of the log is kept in the profile's totals.
  const cut = capHistory(next.history, next.bookmarks);
  return {
    ...next,
    history: cut.history,
    removedTotals: archiveRemoved(
      next.removedTotals,
      next.history,
      cut.removed,
    ),
  };
}

function applyEvent(state, action) {
  if (action.type === "retire-rngween-limited") return state;
  if (action.type === "refresh-rngween-hourly") {
    const at = action.rngweenAt === undefined ? action.at : action.rngweenAt;
    requireRngweenLimited(state, at);
    return refreshRngweenHourly(
      state,
      at,
      rngweenWorldUnlocked(state.tasks, state.rngweenLimited),
    );
  }
  if (action.type === "claim-rngween-coins") {
    const at = action.rngweenAt === undefined ? action.at : action.rngweenAt;
    requireRngweenLimited(state, at);
    return grantRngweenMissionPumpkoins(state, at);
  }
  if (action.type === "claim-rngween-hourly") {
    const at = action.rngweenAt === undefined ? action.at : action.rngweenAt;
    requireRngweenLimited(state, at);
    return claimRngweenHourly(
      state,
      action.serial,
      at,
      rngweenWorldUnlocked(state.tasks, state.rngweenLimited),
    );
  }
  if (
    ["buy-rngween-world", "forge-rngween-key", "rngween-world-reveal"].includes(
      action.type,
    )
  ) {
    const at = action.rngweenAt === undefined ? action.at : action.rngweenAt;
    if (action.type === "rngween-world-reveal" && state.rngweenLimited?.retired)
      return state;
    requireRngweenLimited(state, at);
    const limited = state.rngweenLimited;
    const world = worldState(limited);
    if (action.type === "buy-rngween-world") {
      const item = worldSpeedById.get(action.id);
      if (!item) throw new Error("That World upgrade is not for sale.");
      if (world.upgrades.includes(item.id))
        throw new Error("You already own this World upgrade.");
      if (world.upgrades.length !== item.level - 1)
        throw new Error("Buy the previous World speed upgrade first.");
      if (limited.pumpkoins < item.pumpkoinPrice)
        throw new Error("Not enough Pumpkoins for this World upgrade.");
      return {
        ...state,
        rngweenLimited: {
          ...limited,
          pumpkoins: limited.pumpkoins - item.pumpkoinPrice,
          world: { ...world, upgrades: [...world.upgrades, item.id] },
        },
        history: appendHistory(state.history, [
          {
            id: action.eventId ?? `world-upgrade:${item.id}`,
            type: "rngween-world-purchase",
            at,
            productId: item.id,
            name: item.name,
            pumpkoins: item.pumpkoinPrice,
          },
        ]),
      };
    }
    if (action.type === "forge-rngween-key") {
      if (rngweenValleyUnlocked(limited))
        throw new Error(
          "Your Valley challenge is already unlocked. Keep your Pumpkoins.",
        );
      if (!world.fragments.graveyard || !world.fragments["haunted-house"])
        throw new Error(
          "Find one fragment in Graveyard and one in Haunted House first.",
        );
      return {
        ...state,
        rngweenLimited: { ...limited, world: { ...world, keyForged: true } },
        history: appendHistory(state.history, [
          {
            id: `rngween-forged-key:${RNGWEEN_ID}`,
            type: "rngween-forged-key",
            at,
            name: "Valley Challenge Key",
          },
        ]),
      };
    }
    const pending = world.pending;
    if (!pending) return state;
    if (action.id !== pending.id)
      throw new Error("This reveal belongs to a different saved World roll.");
    if (at < pending.revealsAt)
      throw new Error(
        "The World result is still revealing. Speed upgrades apply to future rolls only.",
      );
    if (
      pending.zone === "valley" &&
      (limited.drawn.length !== pending.expectedCount ||
        limited.drawn.includes(pending.number))
    )
      throw new Error(
        "The Valley pool changed. No duplicate number was rewarded.",
      );
    const earned =
      limited.skinEarned ||
      (pending.zone === "valley" && pending.number === RNGWEEN_WORLD_TARGET);
    const next = {
      ...state,
      rngweenLimited: {
        ...limited,
        drawn:
          pending.zone === "valley"
            ? [...limited.drawn, pending.number]
            : limited.drawn,
        skinEarned: earned,
        world: recordWorldOutcome(limited, pending),
      },
      ...(earned && !state.owned.includes(RNGWEEN_WORLD_SKIN.id)
        ? {
            owned: [...state.owned, RNGWEEN_WORLD_SKIN.id],
            equipped:
              state.equipped === "none"
                ? RNGWEEN_WORLD_SKIN.id
                : state.equipped,
          }
        : {}),
    };
    return recordRngweenHourly(
      next,
      "world",
      worldHourlyTally(
        limited,
        next.rngweenLimited,
        pending.number,
        pending.zone,
      ),
      at,
      true,
      pending.startedAt,
    );
  }

  if (
    [
      "exchange-pumpkoins",
      "buy-rngween-limited",
      "rngween-world-roll",
    ].includes(action.type)
  ) {
    const at = action.rngweenAt === undefined ? action.at : action.rngweenAt;
    requireRngweenLimited(state, at);
    const limited = state.rngweenLimited ?? emptyRngweenLimited();
    if (action.type === "exchange-pumpkoins") {
      const quantity = action.amount;
      const cost = quantity * EP_PER_PUMPKOIN;
      if (!validAmount(quantity) || quantity < 1 || !validAmount(cost))
        throw new Error("Choose a whole, positive number of Pumpkoins.");
      if (state.balance < cost)
        throw new Error("Not enough EP for this exchange.");
      if (!validAmount(limited.pumpkoins + quantity))
        throw new Error("Pumpkoin balance limit reached.");
      if (
        action.eventId &&
        state.history.some((entry) => entry.id === action.eventId)
      )
        return state;
      return {
        ...state,
        balance: state.balance - cost,
        rngweenLimited: { ...limited, pumpkoins: limited.pumpkoins + quantity },
        history: appendHistory(state.history, [
          {
            id: action.eventId ?? `pumpkoins:${at}:${quantity}`,
            type: "rngween-exchange",
            at,
            name: "Pumpkoin exchange",
            ep: cost,
            pumpkoins: quantity,
          },
        ]),
      };
    }
    if (action.type === "buy-rngween-limited") {
      const item = limitedItemById.get(action.id);
      if (!item) throw new Error("That limited item is not for sale.");
      if (item.kind === "aura" && !rngweenCalendar(at).aurasBuyable)
        throw new Error(
          "Aura purchases open November 1, 2026 (UTC). Earn them from Halloween tasks until October 31.",
        );
      if (item.id === RNGWEEN_WORLD_KEY.id && rngweenValleyUnlocked(limited))
        throw new Error(
          "Your Valley challenge is already unlocked. No key or Pumpkoins are needed.",
        );
      if (
        item.id === RNGWEEN_WORLD_KEY.id &&
        worldState(limited).fragments.graveyard &&
        worldState(limited).fragments["haunted-house"]
      )
        throw new Error(
          "Both fragments are ready. Forge your Valley key for free inside the World.",
        );
      if (
        state.owned.includes(item.id) ||
        limited.bought.includes(item.id) ||
        limited.auras.includes(item.id)
      )
        throw new Error("You already own this limited item.");
      if (limited.pumpkoins < item.pumpkoinPrice)
        throw new Error("Not enough Pumpkoins. Exchange EP first.");
      let next = {
        ...state,
        rngweenLimited: {
          ...limited,
          pumpkoins: limited.pumpkoins - item.pumpkoinPrice,
          ...(item.kind === "aura"
            ? { auras: [...limited.auras, item.id] }
            : { bought: [...limited.bought, item.id] }),
        },
        history: appendHistory(state.history, [
          {
            id: action.eventId ?? `limited:${item.id}:${at}`,
            type: "rngween-purchase",
            at,
            productId: item.id,
            name: item.name,
            pumpkoins: item.pumpkoinPrice,
          },
        ]),
      };
      if (item.kind === "world-key") return next;
      if (item.kind === "companion") {
        const leaving = skillForPet(state.activePet);
        next = {
          ...next,
          pets: [...(state.pets ?? []), item.id],
          activePet: item.id,
          equippedSkills: (state.equippedSkills ?? []).filter(
            (id) => id !== leaving?.id,
          ),
        };
        next.equippedSkills = autoEquip(
          next.equippedSkills,
          next,
          skillForPet(item.id)?.id,
        );
      } else {
        next.owned = [...state.owned, item.id];
        if (item.kind === "skill") {
          next.skills = [...(state.skills ?? []), item.id];
          next.equippedSkills = autoEquip(
            state.equippedSkills ?? [],
            next,
            item.id,
          );
        } else if (state.equipped === "none") next.equipped = item.id;
      }
      return next;
    }
    requireRngweenWorld(state, at);
    const world = worldState(limited);
    if (world.pending) return state;
    const zone = requireWorldZone(action.zone ?? "valley");
    const max = zone.max;
    if (zone.id === "valley") requireRngweenValley(state, at);
    const duration = worldRevealMS(limited);
    if (at + duration >= rngweenCalendar(at).limitedEndsAt)
      throw new Error(
        "The World closes before this reveal can finish. No roll was started.",
      );
    const number = action.number;
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > max ||
      (zone.id === "valley" && limited.drawn.includes(number))
    )
      throw new Error(
        "This zone only accepts a valid secure result; the Valley requires unseen numbers from 1 to 9999.",
      );
    if (zone.id === "valley" && action.expectedCount !== limited.drawn.length)
      throw new Error(
        "The Valley's pool changed. Retry with the current saved pool.",
      );
    if (!validAmount(world.nextSerial + 1))
      throw new Error("The World roll limit has been reached.");
    const pending = {
      id: `${RNGWEEN_ID}:world:${world.nextSerial}`,
      serial: world.nextSerial,
      zone: zone.id,
      rules: WORLD_MINI_RULES,
      choice: null,
      number,
      startedAt: at,
      revealsAt: at + duration,
      speedLevel: worldSpeedLevel(limited),
      expectedCount: zone.id === "valley" ? limited.drawn.length : 0,
    };
    // Commit the result and its full duration before animation. No fragments,
    // Pumpkoins, pool entries or skin are paid until the saved reveal settles.
    const { adventure: _legacyExpedition, ...currentLimited } = limited;
    return {
      ...state,
      rngweenLimited: {
        ...currentLimited,
        world: { ...world, nextSerial: world.nextSerial + 1, pending },
      },
    };
  }

  if (action.type === "rebirth") {
    const count = state.rebirths ?? 0;
    if (action.expectedRebirths !== count)
      throw new Error(
        "This rebirth belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid rebirth time");
    const blocked = rebirthBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(count + 1))
      throw new Error("Rebirth count limit reached.");
    const granted = nextRebirthSkill(count);
    // Whatever the cycle scored over this rung's gate pays its dividend now:
    // a quarter of the surplus joins the starting sum, and whole 5M blocks of
    // it bank a permanent +1% (up to +5% on a single rebirth).
    const gate = rebirthRequirement(count);
    const surplus = rebirthSurplus(cycleEarnedEp(state), gate.ep);
    const starter =
      cycleStarterEp(count + 1, state.ultraRebirths ?? 0) +
      surplus.starterBonus;
    // The rung's price — badges and the EP this cycle earned — is written into
    // the log entry, so the history can say what a cycle was bought with.
    const cost = gate;
    // The run starts over — collection, non-aura purchases, companions and the
    // wallet — while every owned aura and account record stays. Receipts stay
    // too, so a roll from an earlier cycle can never settle into the new one.
    return {
      ...startNewCycle(state, { granted, starter }),
      profile: state.profile,
      rebirths: count + 1,
      surplusBanked:
        (state.surplusBanked ?? 0) + Math.round(surplus.bankedBonus * 100),
      history: appendHistory(state.history, [
        {
          id: action.eventId ?? `rebirth:${count + 1}`,
          type: "rebirth",
          at: now,
          count: count + 1,
          ...(granted ? { skill: granted.id } : {}),
          ...(starter ? { grant: starter } : {}),
          ...(cost ? { cost: cost.ep } : {}),
        },
      ]),
    };
  }
  if (action.type === "ultra-rebirth") {
    const count = state.ultraRebirths ?? 0;
    if (action.expectedUltraRebirths !== count)
      throw new Error(
        "This prestige belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid prestige time");
    const blocked = ultraRebirthBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(count + 1)) throw new Error("Prestige limit reached.");
    // The same fresh start a rebirth gives, taken at the top of the ladder
    // with half the collection in hand. It costs the run and the ladder, never
    // the account: history, aura collection, prestiges and every permanent
    // bonus stay, and the prestige adds ten more points forever. The six
    // rungs — their skills and their +2% each — are climbed again from zero,
    // so the next prestige is earned the long way too.
    // The same overshoot dividend as a rung: the ultra gate is a floor too.
    const ultraCost = ultraRebirthRequirement();
    const surplus = rebirthSurplus(cycleEarnedEp(state), ultraCost.ep);
    const ladder = state.rebirths ?? 0;
    const starter = cycleStarterEp(0, count + 1) + surplus.starterBonus;
    const cost = ultraCost;
    return {
      ...startNewCycle(state, { starter, resetLadder: true }),
      profile: state.profile,
      rebirths: 0,
      ultraRebirths: count + 1,
      surplusBanked:
        (state.surplusBanked ?? 0) + Math.round(surplus.bankedBonus * 100),
      history: appendHistory(state.history, [
        {
          id: action.eventId ?? `ultra:${count + 1}`,
          type: "ultra-rebirth",
          at: now,
          count: count + 1,
          ...(ladder ? { ladder } : {}),
          ...(starter ? { grant: starter } : {}),
          ...(cost ? { cost: cost.ep } : {}),
        },
      ]),
    };
  }
  if (action.type === "rollback") {
    const rollbacks = state.rollbacks ?? 0;
    if (action.expectedRollbacks !== rollbacks)
      throw new Error(
        "This Rollback belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid Rollback time");
    const blocked = rollbackBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(rollbacks + 1))
      throw new Error("Rollback count limit reached.");
    // Repeated Rollbacks keep permanent bonuses but always reset the wallet
    // to zero, and — like a prestige — send the rebirth ladder back to its
    // first rung. Existing saved balances are not revalued retroactively.
    const rollbackCost = rollbackRequirement();
    const surplus = rebirthSurplus(cycleEarnedEp(state), rollbackCost.ep);
    const ladder = state.rebirths ?? 0;
    const starter = 0;
    return {
      ...startNewCycle(state, { starter, resetLadder: true }),
      profile: state.profile,
      rebirths: 0,
      rollbacks: rollbacks + 1,
      surplusBanked:
        (state.surplusBanked ?? 0) + Math.round(surplus.bankedBonus * 100),
      history: appendHistory(state.history, [
        {
          id: action.eventId ?? `rollback:${rollbacks + 1}`,
          type: "rollback",
          at: now,
          count: rollbacks + 1,
          ...(ladder ? { ladder } : {}),
          ...(starter ? { grant: starter } : {}),
          ...(rollbackCost ? { cost: rollbackCost.ep } : {}),
        },
      ]),
    };
  }
  // A fresh start is for accounts that have seen everything: three prestiges
  // or more. It wipes the run, the ladder and the history, and keeps only the
  // profile, event cosmetics, event entitlements and one keepsake row.
  if (action.type === "fresh-start") {
    if (!freshStartEligible(state))
      throw new Error("A fresh start opens after three prestiges.");
    if (state.pendingRoll)
      throw new Error("Finish the roll in progress first.");
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid fresh start time");
    const count = (state.freshStarts ?? 0) + 1;
    if (!validAmount(count)) throw new Error("Fresh start limit reached.");
    const keepsake = {
      id: action.eventId ?? `fresh-start:${count}`,
      type: "fresh-start",
      at: now,
      count,
      before: {
        rebirths: state.rebirths ?? 0,
        ultraRebirths: state.ultraRebirths ?? 0,
        rollbacks: state.rollbacks ?? 0,
        totalEarned: state.totalEarned ?? 0,
        rolls: allTimeTally(state).rolls,
      },
    };
    // Cosmetics are the one thing a fresh start keeps: every aura, bought or
    // earned, plus event-only items that never return to the shop.
    const cosmetics = [...new Set(state.owned ?? [])].filter((id) => {
      const product = productById.get(id);
      return product?.eventOnly || product?.kind === "aura";
    });
    const next = {
      ...emptyProgress(),
      profile: state.profile,
      owned: cosmetics,
      equipped: cosmetics.includes(state.equipped) ? state.equipped : "none",
      freshStarts: count,
      tasks: { ...emptyTasks(), rngween: state.tasks?.rngween },
      rngweenLimited: state.rngweenLimited,
      events: state.events ?? {},
      history: [keepsake],
    };
    return preservePermanentCosmetics(state, next);
  }
  // The account was here for an event. Stamped once, on the first visit
  // while the event is on; later visits and every reset leave it alone.
  if (action.type === "attend-event") {
    if (!state.profile) throw new Error("Only accounts attend events.");
    if (!KNOWN_EVENTS.has(action.id)) throw new Error("Unknown event.");
    const at = action.at;
    if (!validAmount(at) || at <= 0 || at > 8640000000000000)
      throw new Error("Invalid event time");
    if (state.events?.[action.id]) return state;
    return {
      ...state,
      events: { ...(state.events ?? {}), [action.id]: { at } },
    };
  }
  if (action.type === "goal") {
    if (action.id !== null && !validGoal(action.id, state.owned, state.pets))
      throw new Error(
        "Choose an unowned item with its prerequisites unlocked.",
      );
    return state.goalId === action.id ? state : { ...state, goalId: action.id };
  }
  if (action.type === "bookmark") {
    const id = typeof action.id === "string" ? action.id : "";
    if (
      !id ||
      !(state.history ?? []).some((e) => e.type === "roll" && e.id === id)
    )
      throw new Error("Only rolled numbers can be bookmarked.");
    const bookmarks = state.bookmarks ?? [];
    if (bookmarks.includes(id))
      return { ...state, bookmarks: bookmarks.filter((b) => b !== id) };
    if (bookmarks.length >= BOOKMARK_LIMIT)
      throw new Error(
        `You can keep up to ${BOOKMARK_LIMIT} bookmarked rolls. Remove one first.`,
      );
    return { ...state, bookmarks: [...bookmarks, id] };
  }
  // A Task Skip uses one token from the save to swap an open task on the list.
  // The token was bought in the Shop; using it costs no EP and is not logged,
  // because it changes what you are asked to do, not what you have paid.
  if (action.type === "skip-task") {
    if (hourlyTaskById.has(action.id))
      throw new Error("Hourly commissions cannot be skipped.");
    const task = taskById(action.id);
    if (!task) throw new Error("That task does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return { ...state, tasks: skipTask(state.tasks, task, at) };
  }
  // New Halloween rewards can only be collected while this one-off event is live.
  if (action.type === "claim-rngween-aura") {
    const at =
      action.rngweenAt === undefined
        ? (action.at ?? Math.ceil(Date.now()))
        : action.rngweenAt;
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid event claim time");
    const tasks = claimRngweenAura(state.tasks ?? emptyTasks(), action.id, at);
    return grantRngweenMissionPumpkoins(grantRngweenAuras(state, tasks), at);
  }
  // A task pays its reward into the wallet once per reset. It is a reward for
  // play, not a sale, so it is logged as income and never counts towards the
  // rebirth gate, which reads only rolls. Finishing the last task of a list only
  // unlocks its bonus: the bonus has its own action, below.
  if (action.type === "claim-task") {
    const task = taskById(action.id);
    if (!task) throw new Error("That task does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return payTask(
      state,
      task,
      at,
      action.eventId,
      action.rngweenAt === undefined ? at : action.rngweenAt,
    );
  }
  // The list bonus of a finished list, collected on its own from the Tasks page.
  // It pays once per reset, and only when every task on the list is claimed.
  if (action.type === "collect-list-bonus") {
    if (!TASK_CADENCES.includes(action.cadence))
      throw new Error("That task list does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return collectBonus(state, action.cadence, at, action.eventId);
  }
  // Bulk delete from History. The cut is worked out here, from the save as it
  // is now, so a stale screen can never remove the wrong entries. Cycle markers
  // and bookmarked rolls are never part of a cut.
  if (action.type === "history-prune") {
    const bookmarks = state.bookmarks ?? [];
    const history = state.history ?? [];
    const cut =
      action.mode === "cycle"
        ? pruneCycle(
            history,
            bookmarks,
            typeof action.marker === "string" ? action.marker : "",
          )
        : action.mode === "oldest" &&
            Number.isSafeInteger(action.count) &&
            action.count >= 1
          ? pruneOldest(
              history,
              bookmarks,
              Math.min(action.count, HISTORY_LIMIT),
            )
          : null;
    if (!cut)
      throw new Error("Choose a finished cycle or a number of entries.");
    // What leaves the log is kept in the profile's totals, not forgotten.
    return {
      ...state,
      history: cut.history,
      removedTotals: archiveRemoved(state.removedTotals, history, cut.removed),
    };
  }
  if (action.type === "avatar") {
    if (!state.profile) throw new Error("Create a local profile first.");
    const avatar = typeof action.avatar === "string" ? action.avatar : "";
    if (avatar && !validAvatar(avatar))
      throw new Error(
        "That picture is too large or not a PNG, JPEG or WebP image.",
      );
    if ((state.profile.avatar ?? "") === avatar) return state;
    if (avatar) return { ...state, profile: { ...state.profile, avatar } };
    // Removing the logo removes the field, so the profile reads like a fresh
    // one again rather than carrying an empty picture around.
    const { avatar: _removed, ...profile } = state.profile;
    return { ...state, profile };
  }
  if (action.type === "register") {
    if (state.profile)
      throw new Error("A local profile already exists on this browser.");
    const username =
      typeof action.username === "string"
        ? action.username.trim().normalize("NFKC")
        : "";
    if (!validUsername(username))
      throw new Error("Use 3–20 letters, numbers, underscores, or hyphens.");
    if (
      typeof action.id !== "string" ||
      !action.id ||
      !validAmount(action.createdAt)
    )
      throw new Error("Invalid profile");
    // Guest play is a demo, not a save file. Signing up starts a genuinely
    // fresh account: nothing rolled, earned, discovered or bought beforehand
    // carries over, so an account's history always matches what it did. The one
    // exception is the tracked goal — a preference, like the theme, not a
    // reward — which survives so the player keeps the target they picked.
    return {
      ...emptyProgress(),
      goalId: state.goalId ?? null,
      profile: { id: action.id, username, createdAt: action.createdAt },
    };
  }
  // A scored roll, checked the same way wherever it comes from: the committed
  // number, or one of the numbers a draw skill kept alongside it.
  function validRollResult(result) {
    return (
      validAmount(result?.totalEP) &&
      validAmount(result?.number) &&
      result.number <= 1000000 &&
      Array.isArray(result?.badges) &&
      [
        "trash",
        "common",
        "uncommon",
        "rare",
        "epic",
        "anomaly",
        "mythic",
        "godly",
      ].includes(result?.tier)
    );
  }

  if (action.type === "complete") {
    const { result, id, cooldownUntil } = action;
    if (!validRollResult(result) || !validAmount(cooldownUntil))
      throw new Error("Invalid roll");
    if (
      state.receipts.includes(id) ||
      state.history?.some((e) => e.id === id && e.type === "roll")
    )
      return state;
    // Once the receipts have started forgetting, the newest forgotten roll sets
    // a watermark: a settlement timed at or before it that is no longer
    // remembered is an old copy of a roll already paid, so it is refused. The
    // roll that is pending right now always passes, so a clock that moved
    // backwards between sessions cannot cost a live roll its EP.
    const receiptFloor = state.receiptFloor ?? 0;
    if (
      state.pendingRoll?.id !== id &&
      !(
        state.owned.includes("offline-roller") &&
        matchesOfflineCommitment(state.offline, action)
      ) &&
      validAmount(action.at) &&
      action.at <= receiptFloor
    )
      return state;
    // Every other number a draw skill kept is a banked roll of its own: same
    // verified index, same multipliers, its own badges and its own line in the
    // history. Only the committed number carries the roll's own id — the rest
    // hang off it, so a replay can never pay them twice.
    const extra = (action.extras ?? []).map((entry, index) => {
      const scored = entry?.result ?? entry;
      if (!validRollResult(scored)) throw new Error("Invalid roll");
      return {
        result: scored,
        skill:
          typeof entry?.skill === "string" && skillById.has(entry.skill)
            ? entry.skill
            : null,
        // How many draws the skill that kept this number actually spent, so
        // the history can say it was kept out of two rather than out of the
        // whole roll's six.
        spent:
          validAmount(entry?.spent) && entry.spent >= 1
            ? Math.min(Math.floor(entry.spent), SKILL_MAX_DRAWS)
            : 0,
        key: index + 1,
      };
    });
    const paid = [{ result, skill: null, key: 0 }, ...extra];
    // Companions, rebirth bonuses and wallet skills multiply only banked EP.
    // result.totalEP — the scored value shown, ranked and recorded — is never
    // modified.
    const fired = firedSkills(state, id, action.source);
    const calendarAt =
      action.rngweenAt === undefined ? action.at : action.rngweenAt;
    const petFactor =
      state.activePet === RNGWEEN_PET.id &&
      rngweenCalendar(calendarAt).limitedPhase !== "active"
        ? 1
        : petMultiplier(state.activePet);
    const baseMultiplier =
      petFactor *
      rebirthMultiplier(state.rebirths ?? 0) *
      ultraRebirthMultiplier(state.ultraRebirths ?? 0) *
      rollbackMultiplier(state.rollbacks ?? 0) *
      surplusMultiplier(state.surplusBanked ?? 0);
    const skillMultiplier = skillWalletMultiplier(fired);
    // The wallet pays for every number the roll kept, and every one of them
    // counts towards the cycle: a stacked rack is meant to earn more, not the
    // same reward spread over more draws.
    let credited = 0,
      cycleEP = cycleEarnedEp(state);
    const discovered = new Set(state.discovered);
    const paidEvents = paid.map(({ result: scored, skill, key, spent }) => {
      // Every number the roll keeps is a banked roll of its own, so every one
      // of them pays the same multipliers, wallet skills included.
      const multiplier = baseMultiplier * skillMultiplier;
      const credit =
        multiplier === 1
          ? scored.totalEP
          : Math.round(scored.totalEP * multiplier);
      credited += credit;
      cycleEP += scored.totalEP;
      const earned = [
        ...new Set(
          scored.badges.map((b) => b.id).filter((id) => badgeIds.has(id)),
        ),
      ];
      const unlocked = earned.filter((id) => !discovered.has(id));
      for (const badge of earned) discovered.add(badge);
      return {
        scored,
        skill,
        key,
        credit,
        spent,
        earned,
        unlocked,
        multiplier,
      };
    });
    const balance = state.balance + credited,
      totalEarned = state.totalEarned + credited;
    if (
      !validAmount(balance) ||
      !validAmount(totalEarned) ||
      !validAmount(cycleEP)
    )
      throw new Error("EP balance limit reached.");
    // Only the committed roll itself knows how many numbers it took, and only
    // when the roll is the one settling — never on a replay or an offline one.
    const drawCount =
      state.pendingRoll?.id === id &&
      Array.isArray(state.pendingRoll.draws) &&
      state.pendingRoll.draws.length > 1
        ? Math.min(
            state.pendingRoll.draws.length,
            state.pendingRoll.drawLimit === undefined ? 9 : SKILL_MAX_DRAWS,
          )
        : 0;
    const at = action.at ?? Math.ceil(Date.now());
    // One banked roll per number the roll kept: the committed one first, then
    // each number another draw skill chose. The extra lines carry the roll
    // they came from, so the feed can keep them together without pretending
    // they were separate rolls.
    const events = paidEvents.flatMap(
      ({
        scored,
        skill,
        key,
        credit,
        spent,
        earned: badges,
        unlocked,
        multiplier,
      }) => {
        const first = key === 0;
        const ownBonus = credit - scored.totalEP;
        const ownPetBonus =
          petFactor === 1
            ? 0
            : Math.round(scored.totalEP * petFactor) - scored.totalEP;
        return [
          {
            id: first ? id : `${id}:draw${key}`,
            type: "roll",
            at,
            // Keep verified UTC for failed-write recovery. A device timestamp
            // in `at` must never reopen, retire or credit a seasonal board.
            ...(first ? { rngweenAt: action.rngweenAt ?? null } : {}),
            number: scored.number,
            tier: scored.tier,
            ep: scored.totalEP,
            ...(ownPetBonus
              ? { petBonus: ownPetBonus, pet: state.activePet }
              : {}),
            ...(ownBonus && ownBonus !== ownPetBonus
              ? { walletBonus: ownBonus, walletMultiplier: multiplier }
              : {}),
            ...(skill ? { skills: [skill] } : {}),
            ...(!skill && fired.length && first ? { skills: fired } : {}),
            // How many numbers the roll actually took, when a skill paid for
            // more than one: the history can then say the number was kept out
            // of several.
            ...(first
              ? drawCount > 1
                ? { draws: drawCount }
                : {}
              : spent > 1
                ? { draws: spent }
                : {}),
            // The extra numbers name the roll that drew them.
            ...(first ? {} : { with: id }),
            badges,
            ...(action.source === "offline" ? { source: "offline" } : {}),
            ...(first &&
            action.source !== "offline" &&
            state.pendingRoll?.id === id &&
            state.pendingRoll.flywheel
              ? { flywheel: state.pendingRoll.flywheel }
              : {}),
          },
          ...(unlocked.length
            ? [
                {
                  id: first ? `${id}:unlock` : `${id}:unlock:${key}`,
                  type: "unlock",
                  at,
                  number: scored.number,
                  badges: unlocked,
                },
              ]
            : []),
        ];
      },
    );
    // Tasks count online rolls only: an offline roll is a passive reward, not
    // something the player went and did. The committed number is the roll;
    // the numbers a draw skill kept are wallet income, not extra rolls.
    const committed = paidEvents[0];
    const droppedPet =
      typeof action.petDrop === "string" &&
      petById.has(action.petDrop) &&
      !petById.get(action.petDrop).eventOnly &&
      !(state.pets ?? []).includes(action.petDrop)
        ? action.petDrop
        : null;
    // Tasks count the committed number, which is the roll. Peaks take the
    // number's own EP and badge count, before any bonus or multiplier.
    const tasks =
      action.source === "offline"
        ? (state.tasks ?? emptyTasks())
        : recordTally(
            state.tasks,
            {
              rolls: 1,
              rare: RARE_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
              epic: EPIC_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
              mythic: MYTHIC_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
              // A roll that paid more than one number, which only a draw skill
              // can make happen.
              multi: paidEvents.length > 1 ? 1 : 0,
              discovered: paidEvents.reduce(
                (total, paid) => total + paid.unlocked.length,
                0,
              ),
              banked: credited,
              skills: fired.length ? 1 : 0,
              pets: droppedPet ? 1 : 0,
              peakEP: committed.scored.totalEP,
              peakBadges: committed.scored.badges.length,
              anomaly: committed.scored.tier === "anomaly" ? 1 : 0,
              trash: committed.scored.tier === "trash" ? 1 : 0,
              high: committed.scored.number >= HIGH_ROLL_MIN ? 1 : 0,
              low: committed.scored.number <= LOW_ROLL_MAX ? 1 : 0,
              low1k: committed.scored.number <= 1000 ? 1 : 0,
              badges: paidEvents.reduce(
                (total, paid) => total + paid.scored.badges.length,
                0,
              ),
            },
            at,
            action.rngweenAt === undefined ? at : action.rngweenAt,
          );
    if (droppedPet)
      events.push({
        id: `${id}:pet`,
        type: "pet",
        at,
        productId: droppedPet,
        name: petById.get(droppedPet).name,
      });
    const next = grantRngweenAuras(
      {
        ...state,
        history: appendHistory(state.history, events),
        tasks,
        pendingRoll: null,
        // Turbo makes the settled roll count more than once towards Flywheel.
        flywheelCharge: flywheelAfterSettlement(
          state,
          id,
          action.source,
          skillChargeFactor(fired),
        ),
        skillCharge: chargeAfterSettlement(state, id, action.source),
        balance,
        totalEarned,
        cycleEarnedEP: cycleEP,
        discovered: [...discovered],
        cooldownUntil: Math.max(state.cooldownUntil, cooldownUntil),
        receipts: [...state.receipts, id].slice(-RECEIPT_LIMIT),
        receiptFloor:
          state.receipts.length >= RECEIPT_LIMIT && validAmount(action.at)
            ? Math.max(receiptFloor, action.at)
            : receiptFloor,
        ...(droppedPet
          ? {
              pets: [...new Set([...(state.pets ?? []), droppedPet])].sort(
                (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
              ),
              // A first pet is worn immediately; later drops never swap your choice.
              activePet:
                (state.activePet ?? "none") === "none"
                  ? droppedPet
                  : state.activePet,
              // The worn companion's signature docks when a slot is free,
              // the same as when it is equipped by hand.
              equippedSkills:
                (state.activePet ?? "none") === "none"
                  ? autoEquip(
                      state.equippedSkills ?? [],
                      state,
                      skillForPet(droppedPet)?.id,
                    )
                  : state.equippedSkills,
              // A companion you were saving for turns up on its own: met.
              goalId:
                state.goalId === droppedPet ? null : (state.goalId ?? null),
            }
          : {}),
      },
      tasks,
    );
    return action.source === "offline"
      ? next
      : recordRngweenHourly(
          next,
          "main",
          mainHourlyTally(committed.scored, { banked: credited }),
          action.rngweenAt === undefined ? at : action.rngweenAt,
          rngweenWorldUnlocked(next.tasks, next.rngweenLimited),
        );
  }
  if (action.type === "buy") {
    const item = productById.get(action.id);
    if (!item) throw new Error("That item is not available.");
    if (item.eventOnly)
      throw new Error(
        "RNGween items are never for sale for EP. Use Pumpkoins in the Limited Shop; the world skin cannot be bought.",
      );
    if (item.repeatable) return buyTaskSkip(state, item, action);
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid purchase time");
    const price = productPrice(item, at);
    if (state.owned.includes(item.id))
      throw new Error("You already own this item.");
    if (item.requires && !state.owned.includes(item.requires))
      throw new Error(`Requires ${productById.get(item.requires).name} first.`);
    if (item.requiresProfile && !state.profile)
      throw new Error(`Create a local profile before buying ${item.name}.`);
    if (
      ["offline", "offline-cap"].includes(item.kind) &&
      (state.offline?.batch ||
        (state.offline &&
          at - state.offline.lastSeenAt >=
            offlineSettings(state.owned).intervalMS))
    )
      throw new Error(
        "Restore offline rewards before upgrading offline earnings. No EP was spent.",
      );
    // The skills shelf only ever sells the stall's rotating stock. The guard
    // reads the same clock windows as the shelf itself, so a card that was
    // buyable when the dialog opened simply sells out past the rotation.
    if (
      item.kind === "skill" &&
      !skillStock(skillStockWindow(at), state.owned).includes(item.id)
    )
      throw new Error(
        `${item.name} is out of stock. The skill shelf restocks every five minutes; no EP was spent.`,
      );
    if (state.balance < price) throw new Error("Not enough EP for this item.");
    return {
      ...state,
      history: appendHistory(state.history, [
        {
          id:
            action.eventId ??
            `buy:${item.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
          type: "purchase",
          at,
          productId: item.id,
          name: item.name,
          ep: price,
        },
      ]),
      balance: state.balance - price,
      goalId: state.goalId === item.id ? null : (state.goalId ?? null),
      ...(item.kind === "pace"
        ? {
            flywheelCharge:
              item.id === "flywheel"
                ? 0
                : Math.min(state.flywheelCharge ?? 0, item.charges),
          }
        : {}),
      ...(item.id === "offline-roller" ||
      ["offline", "offline-cap"].includes(item.kind)
        ? {
            offline: {
              lastSeenAt: action.at ?? Math.ceil(Date.now()),
              batch: null,
              report:
                item.id === "offline-roller"
                  ? null
                  : (state.offline?.report ?? null),
            },
          }
        : {}),
      owned: [...state.owned, item.id],
      equipped: item.kind === "aura" ? item.id : state.equipped,
      // A bought skill joins the rack straight away if a slot is free.
      ...(item.kind === "skill"
        ? {
            skills: [...new Set([...(state.skills ?? []), item.id])],
            equippedSkills: autoEquip(
              state.equippedSkills ?? [],
              { ...state, owned: [...state.owned, item.id] },
              item.id,
            ),
          }
        : {}),
    };
  }
  if (action.type === "buy-pet") {
    const pet = petById.get(action.id);
    if (!pet) throw new Error("That companion is not available.");
    if (pet.eventOnly)
      throw new Error("This limited companion is only sold for Pumpkoins.");
    if ((state.pets ?? []).includes(pet.id))
      throw new Error("You already have this companion.");
    if (state.balance < pet.price)
      throw new Error("Not enough EP for this companion.");
    const pets = [...new Set([...(state.pets ?? []), pet.id])].sort(
      (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
    );
    // Buying a companion equips it, matching how auras behave. The swap goes
    // through equip-pet so the old signature leaves the rack and the new one
    // docks, exactly as a manual swap would.
    const worn = applyEvent(
      { ...state, pets },
      { type: "equip-pet", id: pet.id, at: action.at },
    );
    return {
      ...worn,
      balance: state.balance - pet.price,
      goalId: state.goalId === pet.id ? null : (state.goalId ?? null),
      history: appendHistory(state.history, [
        {
          id:
            action.eventId ??
            `pet:${pet.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
          type: "purchase",
          at: action.at ?? Math.ceil(Date.now()),
          productId: pet.id,
          name: pet.name,
          ep: pet.price,
        },
      ]),
    };
  }
  if (action.type === "equip-pet") {
    if (action.id !== "none" && !(state.pets ?? []).includes(action.id))
      throw new Error("Find or buy this companion before equipping it.");
    if ((state.activePet ?? "none") === action.id) return state;
    // A signature skill only exists while its companion is the active one, so
    // the rack follows the swap. Swapping is free and spends nothing.
    const leaving = skillForPet(state.activePet);
    const equippedSkills = (state.equippedSkills ?? []).filter(
      (id) => !leaving || id !== leaving.id,
    );
    const next = { ...state, activePet: action.id, equippedSkills };
    const arriving = skillForPet(action.id);
    return arriving
      ? {
          ...next,
          equippedSkills: autoEquip(equippedSkills, next, arriving.id),
        }
      : next;
  }
  if (action.type === "equip-skill") {
    const skill = skillById.get(action.id);
    if (!skill) throw new Error("That skill is not available.");
    if (!skillUnlocked(skill.id, state))
      throw new Error(
        skill.source === "pet"
          ? "Equip this companion to use its signature skill."
          : "Unlock this skill before equipping it.",
      );
    const equipped = [...new Set(state.equippedSkills ?? [])];
    const wanted = action.equipped ?? !equipped.includes(skill.id);
    if (wanted && !equipped.includes(skill.id)) {
      const slots = skillSlots(state.owned ?? []);
      // The slots only hold shop and companion skills: rebirth rewards
      // ride free beside the rack.
      if (
        skillTakesSlot(skill.id) &&
        equipped.filter(skillTakesSlot).length >= slots
      )
        throw new Error(
          `Your rack holds ${slots} shop skills. Unequip one, or buy a bigger Skill Bay.`,
        );
      equipped.push(skill.id);
    }
    if (!wanted) {
      const index = equipped.indexOf(skill.id);
      if (index >= 0) equipped.splice(index, 1);
    }
    if (
      equipped.length === (state.equippedSkills ?? []).length &&
      equipped.every((id, i) => id === state.equippedSkills[i])
    )
      return state;
    // Swapping skills is free, so there is no history entry and no charge lost.
    return { ...state, equippedSkills: equipped };
  }
  // ---- Saved racks -------------------------------------------------------
  // Equipping is free, so a saved rack is a convenience, never a purchase:
  // these three actions move no EP, write no history and change no odds.
  if (action.type === "save-loadout") {
    const equipped = [...new Set(state.equippedSkills ?? [])].filter((id) =>
      skillUnlocked(id, state),
    );
    if (!equipped.length) throw new Error("Equip a rack worth saving first.");
    const saved = state.loadouts ?? [];
    if (saved.length >= LOADOUT_LIMIT)
      throw new Error(
        `Your rack holds ${LOADOUT_LIMIT} saved racks. Delete one to save another.`,
      );
    // Identical racks are not saved twice.
    const same = saved.find(
      (entry) =>
        entry.skills.length === equipped.length &&
        entry.skills.every((id, index) => id === equipped[index]),
    );
    if (same) return state;
    return {
      ...state,
      loadouts: [
        ...saved,
        // The id is the rack itself, so the same rack can never be saved twice
        // and nothing depends on the clock.
        {
          id: `rack-${equipped.join("+")}`,
          name: loadoutName(equipped),
          skills: equipped,
        },
      ],
    };
  }
  if (action.type === "apply-loadout") {
    const entry = (state.loadouts ?? []).find(
      (saved) => saved.id === action.id,
    );
    if (!entry) throw new Error("That saved rack is gone.");
    const slots = skillSlots(state.owned ?? []);
    const equipped = entry.skills.filter((id) => skillUnlocked(id, state));
    if (!equipped.length)
      throw new Error("None of those skills are unlocked right now.");
    const trimmed = trimToSlots(equipped, slots);
    if (
      trimmed.length === (state.equippedSkills ?? []).length &&
      trimmed.every((id, index) => id === state.equippedSkills[index])
    )
      return state;
    return { ...state, equippedSkills: trimmed };
  }
  if (action.type === "delete-loadout") {
    const saved = state.loadouts ?? [];
    if (!saved.some((entry) => entry.id === action.id)) return state;
    return {
      ...state,
      loadouts: saved.filter((entry) => entry.id !== action.id),
    };
  }
  if (action.type === "equip") {
    if (
      action.id !== "none" &&
      (!state.owned.includes(action.id) ||
        productById.get(action.id)?.kind !== "aura")
    )
      throw new Error(
        productById.get(action.id)?.eventOnly
          ? "You must own this aura before equipping it."
          : "Purchase this aura before equipping it.",
      );
    if (state.equipped === action.id) return state;
    return {
      ...state,
      equipped: action.id,
      history: appendHistory(state.history, [
        {
          id:
            action.eventId ??
            `equip:${action.id}:${state.history?.length ?? 0}`,
          type: "equip",
          at: action.at ?? Math.ceil(Date.now()),
          productId: action.id,
          name: productById.get(action.id)?.name ?? "Original appearance",
        },
      ]),
    };
  }
  throw new Error("Unknown progress action");
}

// Old saves have no activity log. Keep valid historical entries, never invent
// previous rolls from a wallet total or discard an otherwise usable save.
function parseHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const rolls = new Set();
  return value.flatMap((e) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      e.id.length > 160 ||
      seen.has(e.id) ||
      !validAmount(e.at) ||
      e.at > 8640000000000000
    )
      return [];
    const base = { id: e.id, type: e.type, at: e.at };
    let next;
    if (["roll", "unlock"].includes(e.type)) {
      if (
        !validAmount(e.number) ||
        e.number > 1000000 ||
        !Array.isArray(e.badges)
      )
        return [];
      next = {
        ...base,
        number: e.number,
        badges: [...new Set(e.badges.filter((id) => badgeIds.has(id)))],
      };
      if (e.type === "roll") {
        if (
          !validAmount(e.ep) ||
          ![
            "trash",
            "common",
            "uncommon",
            "rare",
            "epic",
            "anomaly",
            "mythic",
            "godly",
          ].includes(e.tier)
        )
          return [];
        next = {
          ...next,
          ep: e.ep,
          tier:
            manifest.tiers.findLast((tier) => e.ep >= tier.minEP)?.id ?? e.tier,
          ...(e.source === "offline" ? { source: "offline" } : {}),
          ...(e.rngweenAt === null ||
          (validAmount(e.rngweenAt) && e.rngweenAt <= 8640000000000000)
            ? { rngweenAt: e.rngweenAt }
            : {}),
          ...(typeof e.with === "string" &&
          e.with.length <= 160 &&
          rolls.has(e.with)
            ? { with: e.with }
            : {}),
          ...(["boost", "charge"].includes(e.flywheel)
            ? { flywheel: e.flywheel }
            : {}),
          ...(typeof e.pet === "string" && petById.has(e.pet)
            ? { pet: e.pet }
            : {}),
          ...(validAmount(e.petBonus) && e.petBonus
            ? { petBonus: e.petBonus }
            : {}),
          ...(validAmount(e.walletBonus) && e.walletBonus
            ? {
                walletBonus: e.walletBonus,
                ...(typeof e.walletMultiplier === "number" &&
                Number.isFinite(e.walletMultiplier) &&
                e.walletMultiplier > 1
                  ? { walletMultiplier: e.walletMultiplier }
                  : {}),
              }
            : {}),
          // Which charged skills fired on this roll: the receipt of the charge
          // it spent, kept for the activity feed.
          ...(Array.isArray(e.skills)
            ? { skills: e.skills.filter((id) => skillById.has(id)) }
            : {}),
          // A draw skill's receipt: the roll took this many numbers and kept
          // the best. Two or more, and never more than the shelf allows.
          ...(e.draws >= 2 && e.draws <= 9
            ? { draws: Math.floor(e.draws) }
            : {}),
        };
      }
    } else if (e.type === "rngween-hourly") {
      const task = hourlyTaskById.get(e.taskId);
      const match = /^rngween-hourly:(opening|farewell):([1-9]\d*)$/.exec(e.id);
      if (
        !task ||
        e.pumpkoins !== task.pumpkoins ||
        !match ||
        !validAmount(Number(match[2])) ||
        rngweenCalendar(e.at).hourlyWindow !== match[1]
      )
        return [];
      next = {
        ...base,
        taskId: task.id,
        name: task.title,
        pumpkoins: task.pumpkoins,
      };
    } else if (e.type === "rebirth") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = {
        ...base,
        count: e.count,
        ...(skillById.has(e.skill) ? { skill: e.skill } : {}),
        ...(validAmount(e.grant) && e.grant ? { grant: e.grant } : {}),
        ...(validAmount(e.cost) && e.cost ? { cost: e.cost } : {}),
      };
    } else if (e.type === "ultra-rebirth") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = {
        ...base,
        count: e.count,
        ...(validAmount(e.grant) && e.grant ? { grant: e.grant } : {}),
        ...(validAmount(e.cost) && e.cost ? { cost: e.cost } : {}),
        // The rungs this reset sent back, so the log can say what it cost.
        ...(validAmount(e.ladder) && e.ladder ? { ladder: e.ladder } : {}),
      };
    } else if (e.type === "rollback") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = {
        ...base,
        count: e.count,
        ...(validAmount(e.grant) && e.grant ? { grant: e.grant } : {}),
        ...(validAmount(e.cost) && e.cost ? { cost: e.cost } : {}),
        // The rungs this reset sent back, so the log can say what it cost.
        ...(validAmount(e.ladder) && e.ladder ? { ladder: e.ladder } : {}),
      };
    } else if (e.type === "fresh-start") {
      // What the account had before it chose to start over, kept as a keepsake.
      if (!validAmount(e.count) || e.count < 1) return [];
      const before = e.before && typeof e.before === "object" ? e.before : {};
      next = {
        ...base,
        count: e.count,
        before: Object.fromEntries(
          ["rebirths", "ultraRebirths", "rollbacks", "totalEarned", "rolls"]
            .filter((key) => validAmount(before[key]))
            .map((key) => [key, before[key]]),
        ),
      };
    } else if (e.type === "pet") {
      if (
        typeof e.productId !== "string" ||
        !petById.has(e.productId) ||
        typeof e.name !== "string" ||
        e.name.length > 100
      )
        return [];
      next = { ...base, productId: e.productId, name: e.name };
    } else if (["purchase", "equip"].includes(e.type)) {
      // Companions are purchased from their own shelf, outside productById,
      // but their transactions still belong in the account history.
      if (
        typeof e.productId !== "string" ||
        !(
          productById.has(e.productId) ||
          (e.type === "purchase" && petById.has(e.productId)) ||
          (e.type === "equip" && e.productId === "none")
        ) ||
        typeof e.name !== "string" ||
        e.name.length > 100
      )
        return [];
      next = { ...base, productId: e.productId, name: e.name };
      if (e.type === "purchase") {
        if (!validAmount(e.ep)) return [];
        next.ep = e.ep;
      }
    } else if (
      ["rngween-exchange", "rngween-purchase", "rngween-mission"].includes(
        e.type,
      )
    ) {
      if (
        typeof e.name !== "string" ||
        e.name.length > 100 ||
        !validAmount(e.pumpkoins) ||
        e.pumpkoins < 1
      )
        return [];
      if (e.type === "rngween-exchange") {
        if (!validAmount(e.ep) || e.ep !== e.pumpkoins * EP_PER_PUMPKOIN)
          return [];
        next = { ...base, name: e.name, ep: e.ep, pumpkoins: e.pumpkoins };
      } else {
        if (
          !limitedItemById.has(e.productId) ||
          (e.type === "rngween-mission" &&
            !RNGWEEN_AURAS.some((aura) => aura.id === e.productId))
        )
          return [];
        next = {
          ...base,
          name: e.name,
          productId: e.productId,
          pumpkoins: e.pumpkoins,
        };
      }
    } else if (e.type === "rngween-world-purchase") {
      const item = worldSpeedById.get(e.productId);
      if (
        !item ||
        !validAmount(e.pumpkoins) ||
        e.pumpkoins !== item.pumpkoinPrice
      )
        return [];
      next = {
        ...base,
        productId: item.id,
        name: item.name,
        pumpkoins: item.pumpkoinPrice,
      };
    } else if (e.type === "rngween-forged-key") {
      if (e.id !== `rngween-forged-key:${RNGWEEN_ID}`) return [];
      next = { ...base, name: "Valley Challenge Key" };
    } else if (e.type === "task") {
      // A claimed task: the reward it paid, with the name it had when claimed.
      if (
        !TASK_CADENCES.includes(e.cadence) ||
        typeof e.taskId !== "string" ||
        !e.taskId ||
        e.taskId.length > 60 ||
        typeof e.name !== "string" ||
        e.name.length > 100 ||
        !validAmount(e.ep)
      )
        return [];
      next = {
        ...base,
        taskId: e.taskId,
        cadence: e.cadence,
        name: e.name,
        ep: e.ep,
      };
    } else return [];
    seen.add(e.id);
    if (e.type === "roll") rolls.add(e.id);
    return [next];
  });
}

export function parsePending(p, owned = null) {
  if (p == null) return null;
  // A committed roll snapshots the armed skills that fired on it, so a reload
  // can never re-fire a circle. The snapshot is validated like the timings.
  const skills =
    p.skills == null
      ? []
      : Array.isArray(p.skills)
        ? p.skills.filter((id) => skillById.has(id))
        : null;
  if (skills === null || skills.length !== (p.skills?.length ?? 0))
    throw new Error("Invalid committed roll");
  const plan = drawPlanFor(skills);
  const waived = skillWaivesCooldown(skills);
  const draws = p.draws == null ? null : p.draws;
  // Which draw skill kept which number: the list the settlement pays, so it is
  // checked as strictly as the draws themselves. Every pick has to be a number
  // this roll actually drew, a skill that fired on it, and each skill may
  // appear once.
  const picks = p.picks == null ? null : p.picks;
  const pickDefs = drawPicksFor(skills);
  const pickIds = picks ? pickDefs.map((pick) => pick.id) : [];
  // Pre-cap commits must still pay what they already drew. New commits carry
  // drawLimit, so no new roll can accept a seventh number during reload/sync.
  const maxDraws = Math.min(
    p.drawLimit === undefined ? 9 : SKILL_MAX_DRAWS,
    pickDefs.reduce((sum, pick) => sum + pick.attempts, 0) + 1,
  );
  if (
    picks !== null &&
    (!plan ||
      !Array.isArray(picks) ||
      picks.length < 1 ||
      picks.length > pickIds.length ||
      new Set(picks.map((pick) => pick?.skill)).size !== picks.length ||
      !picks.every(
        (pick) =>
          pickIds.includes(pick?.skill) &&
          validAmount(pick?.number) &&
          pick.number <= 1000000 &&
          validAmount(pick?.spent) &&
          pick.spent >= 1 &&
          pick.spent <=
            pickDefs.find((def) => def.id === pick.skill).attempts &&
          (draws ? draws.includes(pick.number) : pick.number === p.number),
      ))
  )
    throw new Error("Invalid committed roll");
  const hasWinnerSkill = Object.prototype.hasOwnProperty.call(p, "winnerSkill");
  const hasWinnerIndex = Object.prototype.hasOwnProperty.call(p, "winnerIndex");
  let winnerSkill = null;
  if (picks !== null) {
    if (hasWinnerSkill) {
      if (
        p.winnerSkill !== null &&
        (typeof p.winnerSkill !== "string" || !pickIds.includes(p.winnerSkill))
      )
        throw new Error("Invalid committed roll");
      winnerSkill = p.winnerSkill;
    } else {
      // Saves written before winner tracking can still tell which skill's pick
      // supplied the committed number: ties have always kept the first pick.
      winnerSkill =
        picks.find((pick) => pick.number === p.number)?.skill ?? null;
    }
    if (
      (winnerSkill !== null &&
        !picks.some(
          (pick) => pick.skill === winnerSkill && pick.number === p.number,
        )) ||
      (winnerSkill === null && picks.some((pick) => pick.number === p.number))
    )
      throw new Error("Invalid committed roll");
  } else if (hasWinnerSkill || hasWinnerIndex) {
    throw new Error("Invalid committed roll");
  }
  let winnerIndex = null;
  if (draws !== null && Array.isArray(draws)) {
    let inferredIndex = draws.indexOf(p.number);
    if (picks !== null) {
      if (winnerSkill !== null) {
        let start = 0;
        inferredIndex = null;
        for (const pick of picks) {
          const end = Math.min(start + Math.trunc(pick.spent), draws.length);
          if (pick.skill === winnerSkill) {
            for (let index = start; index < end; index++)
              if (draws[index] === pick.number) {
                inferredIndex = index;
                break;
              }
            break;
          }
          start = end;
        }
      } else if (
        hasWinnerSkill &&
        draws.length > 0 &&
        draws.at(-1) === p.number
      ) {
        // A plain draw is always the final draw in a live multi-draw roll.
        inferredIndex = draws.length - 1;
      }
    }
    winnerIndex = hasWinnerIndex ? p.winnerIndex : inferredIndex;
    if (
      !Number.isSafeInteger(winnerIndex) ||
      winnerIndex < 0 ||
      winnerIndex >= draws.length ||
      draws[winnerIndex] !== p.number ||
      (winnerSkill !== null && winnerIndex !== inferredIndex) ||
      (hasWinnerSkill &&
        winnerSkill === null &&
        picks !== null &&
        winnerIndex !== draws.length - 1)
    )
      throw new Error("Invalid committed roll");
  } else if (hasWinnerIndex) {
    throw new Error("Invalid committed roll");
  }
  if (
    typeof p.id !== "string" ||
    !p.id ||
    p.id.length > 100 ||
    !validAmount(p.number) ||
    p.number > 1000000 ||
    !validAmount(p.startedAt) ||
    !ROLL_DURATIONS.includes(p.rollMS) ||
    ![...COOLDOWN_DURATIONS, 0].includes(p.cooldownMS) ||
    (p.flywheel != null && !["charge", "boost"].includes(p.flywheel)) ||
    // A free roll must be explained: a Flywheel boost or a cooldown-waiving
    // skill. Nothing else may commit a zero cooldown.
    (p.cooldownMS === 0) !== (p.flywheel === "boost" || waived) ||
    !validAmount(p.startedAt + p.rollMS + p.cooldownMS) ||
    (p.drawLimit !== undefined && p.drawLimit !== SKILL_MAX_DRAWS) ||
    (draws !== null &&
      (!plan ||
        !Array.isArray(draws) ||
        draws.length < 1 ||
        // The skills' draws, plus the roll's own ordinary draw when it made one.
        draws.length > maxDraws ||
        !draws.every((number) => validAmount(number) && number <= 1000000) ||
        !draws.includes(p.number)))
  )
    throw new Error("Invalid committed roll");
  // Tamper guard: a committed roll may never be faster than the timings its own
  // save has actually paid for. Without this, editing storage (or a plugin
  // doing it) could hand an upgrade-free profile the fastest reveal and
  // cooldown. Slower snapshots stay valid: buying an upgrade mid-roll must not
  // invalidate the roll already in flight.
  if (owned) {
    const allowed = rollSettings(owned);
    if (
      p.rollMS < allowed.rollMS ||
      (p.cooldownMS < allowed.cooldownMS && p.cooldownMS !== 0)
    )
      throw new Error("Committed roll timings do not match your upgrades");
  }
  return {
    id: p.id,
    number: p.number,
    startedAt: p.startedAt,
    rollMS: p.rollMS,
    cooldownMS: p.cooldownMS,
    ...(skills.length ? { skills } : {}),
    ...(draws ? { draws } : {}),
    ...(p.drawLimit !== undefined ? { drawLimit: p.drawLimit } : {}),
    ...(picks
      ? {
          picks: picks.map((pick) => ({
            skill: pick.skill,
            number: pick.number,
            spent: Math.trunc(pick.spent),
          })),
          winnerSkill,
          ...(winnerIndex !== null ? { winnerIndex } : {}),
        }
      : {}),
    ...(p.flywheel ? { flywheel: p.flywheel } : {}),
  };
}

// Only roll settlement can succeed in memory after a failed write. Reapply those
// receipts to the latest shared wallet instead of overwriting other tabs' spending.
// `unsaved` names the rolls this tab settled while saving was failing. Without
// it, every roll the tab remembers that the stored log lacks would be replayed,
// and a roll that was saved earlier and has since been removed from the log
// (by bulk delete, or by the cap) would be credited a second time.
export function recoverUnsavedRolls(stored, temporary, unsaved = null) {
  // A roll from an earlier cycle can never be replayed into a later one.
  if (
    (stored.rebirths ?? 0) !== (temporary.rebirths ?? 0) ||
    (stored.ultraRebirths ?? 0) !== (temporary.ultraRebirths ?? 0) ||
    (stored.rollbacks ?? 0) !== (temporary.rollbacks ?? 0)
  )
    return stored;
  let merged = stored;
  const rolls = (temporary.history ?? []).filter(
    (event) => event.type === "roll",
  );
  const rollById = new Map(rolls.map((event) => [event.id, event]));
  const roots = new Set();
  for (const event of rolls) {
    if (unsaved && !unsaved.has(event.id)) continue;
    // Secondary numbers belong to their committed roll. Replaying one as a new
    // roll would lose the original multipliers, task tally and receipt.
    roots.add(typeof event.with === "string" ? event.with : event.id);
  }
  for (const id of roots) {
    const event = rollById.get(id);
    if (!event) continue;
    if (
      merged.receipts?.includes(id) ||
      merged.history.some((entry) => entry.type === "roll" && entry.id === id)
    )
      continue;
    const extras = rolls
      .filter(
        (entry) =>
          entry.with === id &&
          !merged.history.some(
            (saved) => saved.type === "roll" && saved.id === entry.id,
          ),
      )
      .map((entry) => ({
        skill: entry.skills?.find((skill) => skillById.has(skill)) ?? null,
        spent: validAmount(entry.draws) && entry.draws >= 1 ? entry.draws : 1,
        result: {
          number: entry.number,
          totalEP: entry.ep,
          tier: entry.tier,
          badges: entry.badges.map((badge) => ({ id: badge })),
        },
      }));
    const petDrop = (temporary.history ?? []).find(
      (entry) => entry.type === "pet" && entry.id === `${id}:pet`,
    )?.productId;
    const pending = merged.pendingRoll;
    merged = applyProgress(merged, {
      type: "complete",
      id,
      source: event.source,
      at: event.at,
      // Legacy receipts lack proof. Recover their EP, never use `at` as UTC.
      rngweenAt: event.rngweenAt ?? null,
      result: {
        number: event.number,
        totalEP: event.ep,
        tier: event.tier,
        badges: event.badges.map((badge) => ({ id: badge })),
      },
      ...(extras.length ? { extras } : {}),
      ...(typeof petDrop === "string" ? { petDrop } : {}),
      cooldownUntil: Math.max(merged.cooldownUntil, temporary.cooldownUntil),
    });
    if (pending && pending.id !== id)
      merged = { ...merged, pendingRoll: pending };
  }
  return merged;
}
