import { unpackVaultSave } from "./save-codec.js";

import { reaperAct } from "./rngween-legacy.js";
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
  parseRngween,
  rngweenAuraIds,
  RNGWEEN_ID,
  RNGWEEN_AURAS,
  RNGWEEN_FINALE_SKIN,
  RNGWEEN_WORLD_SKIN,
} from "./rngween.js";
import {
  emptyRngweenLimited,
  grantRngweenCosmetic,
  limitedRewardIds,
  parseRngweenLimited,
} from "./rngween-limited.js";
import {
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_PREMIUM_PRICE,
  BATTLE_PASS_REWARDS,
  battlePassSeason,
  claimPassMission,
  emptyBattlePass,
  activateBoost,
  activeBoosts,
  boostBuyStatus,
  boughtBoost,
  PASS_BOOST_PRICE,
  boostCharges,
  boostMultiplier,
  emptyBoosts,
  grantBoost,
  parseBattlePass,
  passBoostById,
  passLevelForXp,
  passMissionById,
  passRewardEP,
  passRewardState,
  recordPassTally,
  rerollPassDaily,
  rewardKey,
  seasonNumber,
} from "./battle-pass.js";
import {
  BLACK_FRIDAY_SKIN,
  blackFridayActive,
  emptyBlackFriday,
  isResaleCosmetic,
  parseBlackFriday,
  resalePrice,
  saleCompanionPrice,
  stampForPurchase,
} from "./black-friday.js";
export { HISTORY_LIMIT, HISTORY_WARNING };
export const PROGRESS_KEY = "rng-infinite-progress-v1";

export const GUEST_ROLL_KEY = "rng-infinite-guest-roll-v1";

export const PRE_REPAIR_BACKUP_KEY = "rng-infinite-progress-pre-repair-v1";

export const LOADOUT_LIMIT = 4;
const badgeIds = new Set(metadata.map((b) => b.id));
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;

const RECEIPT_LIMIT = 128;

function repairAmount(value, fallback = 0) {
  if (validAmount(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER);
  return fallback;
}

function describeStored(value) {
  if (typeof value === "string") return `"${value.slice(0, 24)}"`;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value == null) return "missing";
  return Array.isArray(value) ? "a list" : "an object";
}

function freshProfileId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `repaired-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
  }
}

export function walletMultiplier(
  progress,
  skillIds = progress.pendingRoll?.skills,
  at = null,
) {
  return (
    petMultiplier(progress.activePet) *
    rebirthMultiplier(progress.rebirths ?? 0) *
    ultraRebirthMultiplier(progress.ultraRebirths ?? 0) *
    rollbackMultiplier(progress.rollbacks ?? 0) *
    surplusMultiplier(progress.surplusBanked ?? 0) *
    skillWalletMultiplier(skillIds ?? []) *
    // Consumable pass boosts are the only temporary factor in the wallet.
    (at === null ? 1 : boostMultiplier(progress.battlePass?.boosts, at))
  );
}

function firedSkills(state, id, source) {
  if (source === "offline" || state.pendingRoll?.id !== id) return [];
  return (state.pendingRoll.skills ?? []).filter((skillId) =>
    skillById.has(skillId),
  );
}

function appendHistory(history, events = []) {
  return [...(history ?? []), ...events];
}

function autoEquip(equipped, progress, id) {
  const list = [...new Set(equipped)].filter((skillId) =>
    skillUnlocked(skillId, progress),
  );
  if (!id || !skillById.has(id) || list.includes(id)) return list;

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
    // RETIREMENT: keep parsing the Black Friday save record.
    blackFriday: emptyBlackFriday(),
    battlePass: emptyBattlePass(),

    events: {},
  };
}

const KNOWN_EVENTS = new Set([RNGWEEN_ID]);

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

export { BOOKMARK_LIMIT };

export const FRESH_START_PRESTIGES = 3;
export function freshStartEligible(progress = {}) {
  return (
    !!progress.profile &&
    ((progress.ultraRebirths ?? 0) >= FRESH_START_PRESTIGES ||
      (progress.rollbacks ?? 0) > 0)
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

function parseLoadouts(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value.slice(0, LOADOUT_LIMIT)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || !entry.id) continue;
    if (!Array.isArray(entry.skills)) continue;

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

export function loadoutName(skills = []) {
  const names = skills.map((id) => skillById.get(id)?.name ?? id);
  if (!names.length) return "Empty rack";
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names.length - 1} more`;
}

export function parseAndRepairProgress(raw) {
  if (raw === null) return { progress: emptyProgress(), repairs: [] };
  const repairs = [];
  const note = (message) => repairs.push(message);
  let p;
  try {
    p = JSON.parse(unpackVaultSave(raw));
  } catch {
    throw new Error("Unrecognized save version");
  }
  if (!p || p.version !== 1) throw new Error("Unrecognized save version");

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

  let priorLength;
  do {
    priorLength = owned.length;
    owned = owned.filter(
      (id) =>
        !productById.get(id).requires ||
        owned.includes(productById.get(id).requires),
    );
  } while (owned.length !== priorLength);

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
  const surplusBanked = repairAmount(p.surplusBanked ?? 0);
  if ((p.surplusBanked ?? 0) !== surplusBanked)
    note(
      `surplus dividend was ${describeStored(p.surplusBanked)}, so it was set to ${surplusBanked}.`,
    );

  const cycleOverride = validAmount(p.cycleEarnedEP) ? p.cycleEarnedEP : null;
  if (p.cycleEarnedEP != null && cycleOverride === null)
    note("cycle EP total was unreadable, so it was recalculated from history.");

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

  const removedRead = parseRemovedTotals(p.removedTotals);
  if (removedRead.repaired)
    note(
      "some profile totals from removed activity were unreadable, so they were reset.",
    );
  const removedTotals = removedRead.totals;

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
  const legacyRngween = parseRngween(p.tasks?.rngween);
  const tasksRead = parseTasks(p.tasks);
  if (tasksRead.repaired)
    note("task progress was unreadable, so it was reset.");
  const limitedRead = parseRngweenLimited(p.rngweenLimited, {
    owned,
    history,
    earnedAuras: rngweenAuraIds(legacyRngween.rngween),
  });
  const rngweenLimited = limitedRead.limited;
  if (limitedRead.repaired)
    note(
      "retired RNGween progress was discarded; valid permanent aura receipts were kept.",
    );
  for (const id of limitedRewardIds(rngweenLimited))
    if (!owned.includes(id)) owned.push(id);

  const blackFriday = parseBlackFriday(p.blackFriday, { owned });
  if (
    p.blackFriday != null &&
    (typeof p.blackFriday !== "object" || Array.isArray(p.blackFriday))
  )
    note("the sale stamp card was unreadable, so it was reset.");
  if (blackFriday.skinEarned && !owned.includes(BLACK_FRIDAY_SKIN.id)) {
    owned.push(BLACK_FRIDAY_SKIN.id);
    note("your limited Black Friday 2026 skin was restored from its stamps.");
  }
  const passRead = parseBattlePass(p.battlePass);
  if (p.battlePass != null && passRead.repaired)
    note("battle pass progress was unreadable, so it was reset.");
  const battlePass = passRead.pass;
  for (const reward of BATTLE_PASS_REWARDS) {
    for (const track of ["free", "premium"]) {
      const definition = reward[track];
      if (
        definition.kind !== "ep" &&
        battlePass.claimed.includes(rewardKey(track, reward.level)) &&
        !owned.includes(definition.id)
      ) {
        owned.push(definition.id);
        note("a claimed battle pass reward was restored from its receipt.");
      }
    }
  }

  let petsInput = p.pets;
  if (p.pets != null && !Array.isArray(p.pets)) {
    note("companion list was unreadable, so it was rebuilt from your history.");

    petsInput = [
      ...tallyEntries(history).pets,
      ...removedTotals.flatMap((tally) => tally?.pets ?? []),
    ];
  }
  const pets = [
    ...new Set([...(petsInput ?? []).filter((id) => petById.has(id))]),
  ].sort((a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b));

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
    Array.isArray(skillsInput) ? skillsInput : [],
    { owned },
  );
  if (p.equippedSkills != null && !Array.isArray(p.equippedSkills))
    note("skill rack was unreadable, so it was emptied.");
  const equippedSkills = parseEquippedSkills(p.equippedSkills, {
    owned,
    skills,
    pets,
    activePet,
  });

  let pendingRoll = null;
  try {
    pendingRoll = parsePending(p.pendingRoll, owned);
  } catch {
    if (p.pendingRoll != null)
      note("a committed roll could not be verified, so it was discarded.");
  }

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
        "profile id was unreadable, so a new local identity was issued; the rest of the save was kept.",
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

      ...(avatar ? { avatar } : {}),
    };
  }

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
    blackFriday,
    battlePass,
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

export function parseProgress(raw) {
  return parseAndRepairProgress(raw).progress;
}

export function preservePermanentCosmetics(previous, next) {
  if (!previous?.profile || previous.profile.id !== next.profile?.id)
    return next;
  const rngweenPermanent = new Set([
    ...RNGWEEN_AURAS.map((aura) => aura.id),
    RNGWEEN_WORLD_SKIN.id,
    RNGWEEN_FINALE_SKIN.id,
  ]);
  const known = [
    ...new Set([
      ...(previous.owned ?? []),
      ...limitedRewardIds(previous.rngweenLimited),
    ]),
  ].filter((id) => {
    const item = productById.get(id);
    return item?.kind === "aura" || item?.passReward;
  });
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
      finaleEarned:
        limited.finaleEarned || known.includes(RNGWEEN_FINALE_SKIN.id),
    },
  };
}

export function settleOfflineRoll(state, result, reportAt) {
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

export const AVATAR_LIMIT = 240000;
const AVATAR_MIME = ["image/png", "image/jpeg", "image/webp"];
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

function parseAvatar(value) {
  if (typeof value !== "string" || !value) return "";
  return validAvatar(value) ? value : "";
}

function startNewCycle(
  state,
  { granted = null, starter = 0, resetLadder = false } = {},
) {
  const owned = [...new Set(state.owned ?? [])].filter((id) => {
    const item = productById.get(id);
    return item?.kind === "aura" || item?.passReward;
  });

  const kept = (state.skills ?? []).filter(
    (id) =>
      skillById.get(id)?.source !== "shop" &&
      (!resetLadder || skillById.get(id)?.source !== "rebirth"),
  );
  const skills = granted ? [...new Set([...kept, granted.id])] : kept;
  const base = {
    ...state,
    owned,
    pets: [],
    activePet: "none",
    skills,
  };

  let equippedSkills = autoEquip([], base, granted?.id);
  for (const id of skills) equippedSkills = autoEquip(equippedSkills, base, id);
  const signature = skillForPet(base.activePet);
  if (signature) equippedSkills = autoEquip(equippedSkills, base, signature.id);

  const skillCharge = Object.fromEntries(
    Object.entries(state.skillCharge ?? {}).filter(([id]) =>
      skills.includes(id),
    ),
  );
  return {
    ...base,
    equippedSkills,
    skillCharge,

    balance: starter,
    totalEarned: state.totalEarned + starter,
    discovered: [],
    equipped: owned.includes(state.equipped) ? state.equipped : "none",

    goalId: state.goalId ?? null,
    flywheelCharge: 0,

    offline: null,
    pendingRoll: null,
    cooldownUntil: 0,
    cooldownWindow: null,
    cycleEarnedEP: 0,
  };
}

function withSaleStamp(state, at, ep = null) {
  if (!blackFridayActive(at)) return state;
  const last = state.history?.[state.history.length - 1];
  const spent =
    ep ??
    (last && last.type === "purchase" && validAmount(last.ep) ? last.ep : 0);
  const { record, newStamps, skinUnlocked } = stampForPurchase(
    state.blackFriday,
    spent,
    at,
  );
  if (!newStamps && !skinUnlocked) return { ...state, blackFriday: record };
  const skin = BLACK_FRIDAY_SKIN;
  return {
    ...state,
    blackFriday: record,
    owned:
      skinUnlocked && !state.owned.includes(skin.id)
        ? [...state.owned, skin.id]
        : state.owned,
    history: appendHistory(state.history, [
      {
        id: `sale-reward:${skin.id}:${record.stamps}`,
        type: "sale-reward",
        at,
        productId: skin.id,
        name: skin.name,
        stamps: record.stamps,
      },
    ]),
  };
}

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
  return withSaleStamp(
    {
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
    },
    at,
  );
}

function payTask(state, task, at, eventId = null) {
  const tasks = claimTask(state.tasks ?? emptyTasks(), task, at);
  const balance = state.balance + task.reward;
  const totalEarned = state.totalEarned + task.reward;
  if (!validAmount(balance) || !validAmount(totalEarned))
    throw new Error("EP balance limit reached.");
  return {
    ...state,
    balance,
    totalEarned,
    tasks,
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
  };
}

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

function grantPassReward(state, level, track, at, eventId = null) {
  const pass = state.battlePass ?? emptyBattlePass();
  const reward = BATTLE_PASS_REWARDS.find((entry) => entry.level === level)?.[
    track
  ];
  if (!reward) throw new Error("That pass reward does not exist.");
  if (passRewardState(pass, level, track) !== "claimable")
    throw new Error("This pass reward is not ready to claim.");
  const ep = passRewardEP(reward, state.owned ?? []);
  const balance = state.balance + ep;
  const totalEarned = state.totalEarned + ep;
  if (!validAmount(balance) || !validAmount(totalEarned))
    throw new Error("EP balance limit reached.");
  const permanent =
    reward.kind !== "ep" && !(state.owned ?? []).includes(reward.id);
  // Some levels also hand out consumable boosts; the EP above is unchanged.
  const boosts = reward.boost
    ? grantBoost(pass.boosts, reward.boost.id, reward.boost.charges, at)
    : (pass.boosts ?? emptyBoosts());
  return {
    ...state,
    balance,
    totalEarned,
    owned: permanent ? [...(state.owned ?? []), reward.id] : state.owned,
    battlePass: {
      ...pass,
      boosts,
      claimed: [...pass.claimed, rewardKey(track, level)],
    },
    history: appendHistory(state.history, [
      {
        id: eventId ?? `pass-reward:${pass.seasonId}:${track}-${level}`,
        type: "pass-reward",
        at,
        seasonId: pass.seasonId,
        level,
        track,
        name: reward.name ?? `Level ${level} ${track} reward`,
        ep,
        ...(reward.boost ? { boostId: reward.boost.id } : {}),
        ...(reward.kind !== "ep" ? { productId: reward.id } : {}),
      },
    ]),
  };
}

function ensurePassSeason(state, at) {
  const season = battlePassSeason(at);
  const pass = state.battlePass ?? emptyBattlePass();
  if (!season.active)
    return state.battlePass ? state : { ...state, battlePass: pass };
  if (pass.seasonId === season.id)
    return state.battlePass ? state : { ...state, battlePass: pass };
  if (pass.seasonId && seasonNumber(pass.seasonId) >= season.index)
    return state.battlePass ? state : { ...state, battlePass: pass };
  let next = { ...state, battlePass: pass };
  if (pass.seasonId) {
    const level = passLevelForXp(pass.xp);
    for (const reward of BATTLE_PASS_REWARDS) {
      if (reward.level > level) continue;
      for (const track of ["free", "premium"]) {
        if (
          passRewardState(next.battlePass, reward.level, track) === "claimable"
        )
          next = grantPassReward(
            next,
            reward.level,
            track,
            at,
            `pass-auto:${pass.seasonId}:${track}-${reward.level}`,
          );
      }
    }
    const archive = [
      ...(next.battlePass.archive ?? []),
      {
        seasonId: pass.seasonId,
        xp: pass.xp,
        premium: pass.premium,
        claimed: next.battlePass.claimed.length,
      },
    ].slice(-24);
    next = {
      ...next,
      battlePass: {
        ...emptyBattlePass(),
        seasonId: season.id,
        // Boosts are consumables, not season rewards: unused charges and a
        // window still running carry into the new season.
        boosts: pass.boosts ?? emptyBoosts(),
        archive,
      },
    };
  } else {
    next = {
      ...next,
      battlePass: {
        ...emptyBattlePass(),
        seasonId: season.id,
        boosts: pass.boosts ?? emptyBoosts(),
        archive: pass.archive ?? [],
      },
    };
  }
  return next;
}

export function applyProgress(state, action) {
  const next = applyEvent(state, action);
  if (next === state || !Array.isArray(next.history)) return next;
  if (next.history.length <= HISTORY_LIMIT) return next;

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

    const gate = rebirthRequirement(count);
    const surplus = rebirthSurplus(cycleEarnedEp(state), gate.ep);
    const starter =
      cycleStarterEp(count + 1, state.ultraRebirths ?? 0) +
      surplus.starterBonus;

    const cost = gate;

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

    const ultraCost = ultraRebirthRequirement();
    const surplus = rebirthSurplus(
      cycleEarnedEp(state),
      ultraCost.ep,
      "prestige",
    );
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

    const rollbackCost = rollbackRequirement();
    const surplus = rebirthSurplus(
      cycleEarnedEp(state),
      rollbackCost.ep,
      "rollback",
    );
    const ladder = state.rebirths ?? 0;
    const prestiges = state.ultraRebirths ?? 0;
    const starter = 0;
    return {
      ...startNewCycle(state, { starter, resetLadder: true }),
      profile: state.profile,
      rebirths: 0,
      ultraRebirths: 0,
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
          ...(prestiges ? { prestiges } : {}),
          ...(starter ? { grant: starter } : {}),
          ...(rollbackCost ? { cost: rollbackCost.ep } : {}),
        },
      ]),
    };
  }

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

    const cosmetics = [...new Set(state.owned ?? [])].filter((id) => {
      const item = productById.get(id);
      return item?.kind === "aura" || item?.passReward;
    });
    const next = {
      ...emptyProgress(),
      profile: state.profile,
      owned: cosmetics,
      equipped: cosmetics.includes(state.equipped) ? state.equipped : "none",
      freshStarts: count,
      tasks: emptyTasks(),
      rngweenLimited: state.rngweenLimited,

      blackFriday: state.blackFriday ?? emptyBlackFriday(),
      battlePass: state.battlePass ?? emptyBattlePass(),
      loadouts: state.loadouts ?? [],
      goalId: state.goalId ?? null,
      events: state.events ?? {},
      history: [keepsake],
    };
    return preservePermanentCosmetics(state, next);
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

  if (action.type === "skip-task") {
    const task = taskById(action.id);
    if (!task) throw new Error("That task does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return { ...state, tasks: skipTask(state.tasks, task, at) };
  }

  if (action.type === "claim-task") {
    const task = taskById(action.id);
    if (!task) throw new Error("That task does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return payTask(state, task, at, action.eventId);
  }

  if (action.type === "collect-list-bonus") {
    if (!TASK_CADENCES.includes(action.cadence))
      throw new Error("That task list does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    return collectBonus(state, action.cadence, at, action.eventId);
  }

  if (action.type === "claim-pass-mission") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid pass mission time");
    const ready = ensurePassSeason(state, at);
    const mission = passMissionById(action.id);
    const claimed = claimPassMission(ready.battlePass, action.id, at);
    // A milestone can pay a boost charge as well as BPEP.
    const battlePass = mission.boost
      ? {
          ...claimed,
          boosts: grantBoost(
            claimed.boosts,
            mission.boost.id,
            mission.boost.charges,
            at,
          ),
        }
      : claimed;
    return {
      ...ready,
      battlePass,
      history: appendHistory(ready.history, [
        {
          id:
            action.eventId ??
            `pass-mission:${battlePass.seasonId}:${action.id}`,
          type: "pass-mission",
          at,
          seasonId: battlePass.seasonId,
          missionId: action.id,
          name: mission.title,
          bpep: mission.reward,
        },
      ]),
    };
  }
  if (action.type === "reroll-pass-mission") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid pass mission time");
    const ready = ensurePassSeason(state, at);
    return {
      ...ready,
      battlePass: rerollPassDaily(ready.battlePass, action.id, at),
    };
  }
  if (action.type === "claim-pass-reward") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid pass reward time");
    const level = Number(action.level);
    const track = action.track;
    if (!Number.isInteger(level) || level < 1 || level > BATTLE_PASS_LEVELS)
      throw new Error("That pass reward does not exist.");
    if (track !== "free" && track !== "premium")
      throw new Error("That pass track does not exist.");
    const ready = state.battlePass?.seasonId
      ? state
      : ensurePassSeason(state, at);
    return grantPassReward(ready, level, track, at, action.eventId);
  }
  if (action.type === "activate-boost") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid boost time");
    const pass = state.battlePass ?? emptyBattlePass();
    const boost = passBoostById(action.id);
    if (!boost) throw new Error("That boost does not exist.");
    if (boostCharges(pass.boosts, boost.id) < 1)
      throw new Error("You have no charge of that boost.");
    if (activeBoosts(pass.boosts, at).length)
      throw new Error("A boost is already running. Let it finish first.");
    return {
      ...state,
      battlePass: { ...pass, boosts: activateBoost(pass.boosts, boost.id, at) },
      history: appendHistory(state.history, [
        {
          id: action.eventId ?? `boost:${boost.id}:${at}`,
          type: "boost",
          at,
          boostId: boost.id,
          name: boost.name,
          minutes: boost.minutes,
          until: at + boost.minutes * 60 * 1000,
        },
      ]),
    };
  }
  if (action.type === "buy-boost") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid boost time");
    const pass = state.battlePass ?? emptyBattlePass();
    const boost = passBoostById(action.id);
    if (!boost) throw new Error("That boost does not exist.");
    const status = boostBuyStatus(pass.boosts, at);
    if (status.waitMs > 0)
      throw new Error("That boost is already on the counter today.");
    if (state.balance < PASS_BOOST_PRICE)
      throw new Error("Not enough EP for that boost charge.");
    return withSaleStamp(
      {
        ...state,
        balance: state.balance - PASS_BOOST_PRICE,
        battlePass: {
          ...pass,
          boosts: boughtBoost(pass.boosts, boost.id, at),
        },
        history: appendHistory(state.history, [
          {
            id: action.eventId ?? `boost-buy:${boost.id}:${at}`,
            type: "purchase",
            at,
            productId: boost.id,
            name: `${boost.name} charge`,
            ep: PASS_BOOST_PRICE,
          },
        ]),
      },
      at,
      PASS_BOOST_PRICE,
    );
  }
  if (action.type === "buy-pass-premium") {
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid pass purchase time");
    const ready = ensurePassSeason(state, at);
    const season = battlePassSeason(at);
    if (!season.active || ready.battlePass.seasonId !== season.id)
      throw new Error("The pass season is not open for upgrades.");
    if (ready.battlePass.premium)
      throw new Error("This season's premium track is already unlocked.");
    if (ready.balance < BATTLE_PASS_PREMIUM_PRICE)
      throw new Error("Not enough EP for the premium track.");
    return withSaleStamp(
      {
        ...ready,
        balance: ready.balance - BATTLE_PASS_PREMIUM_PRICE,
        battlePass: { ...ready.battlePass, premium: true },
        history: appendHistory(ready.history, [
          {
            id: action.eventId ?? `pass-upgrade:${ready.battlePass.seasonId}`,
            type: "pass-upgrade",
            at,
            seasonId: ready.battlePass.seasonId,
            name: "Premium track",
            ep: BATTLE_PASS_PREMIUM_PRICE,
          },
        ]),
      },
      at,
      BATTLE_PASS_PREMIUM_PRICE,
    );
  }

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

    return {
      ...state,
      history: cut.history,
      removedTotals: archiveRemoved(state.removedTotals, history, cut.removed),
    };
  }
  if (action.type === "rename-profile") {
    if (!state.profile) throw new Error("Create a local profile first.");
    const username =
      typeof action.username === "string"
        ? action.username.trim().normalize("NFKC")
        : "";
    if (!validUsername(username))
      throw new Error("Use 3–20 letters, numbers, underscores, or hyphens.");
    if (state.profile.username === username) return state;
    return { ...state, profile: { ...state.profile, username } };
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

    const { avatar: _removed, ...profile } = state.profile;
    return { ...state, profile };
  }
  if (action.type === "register" || action.type === "register-cloud") {
    if (state.profile)
      throw new Error("A saved profile already exists on this browser.");
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
    const profile = { id: action.id, username, createdAt: action.createdAt };
    if (action.type === "register-cloud" || action.preserveGuest) {
      return { ...state, profile };
    }

    return { ...emptyProgress(), goalId: state.goalId ?? null, profile };
  }

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

    if (action.source !== "offline")
      state = ensurePassSeason(state, action.at ?? Math.ceil(Date.now()));
    const extra = (action.extras ?? []).map((entry, index) => {
      const scored = entry?.result ?? entry;
      if (!validRollResult(scored)) throw new Error("Invalid roll");
      return {
        result: scored,
        skill:
          typeof entry?.skill === "string" && skillById.has(entry.skill)
            ? entry.skill
            : null,

        spent:
          validAmount(entry?.spent) && entry.spent >= 1
            ? Math.min(Math.floor(entry.spent), SKILL_MAX_DRAWS)
            : 0,
        key: index + 1,
      };
    });
    const paid = [{ result, skill: null, key: 0 }, ...extra];

    const fired = firedSkills(state, id, action.source);
    const petFactor = petMultiplier(state.activePet);
    const baseMultiplier =
      petFactor *
      rebirthMultiplier(state.rebirths ?? 0) *
      ultraRebirthMultiplier(state.ultraRebirths ?? 0) *
      rollbackMultiplier(state.rollbacks ?? 0) *
      surplusMultiplier(state.surplusBanked ?? 0);
    const skillMultiplier = skillWalletMultiplier(fired);
    // A running pass boost multiplies what this roll banks. It is counted
    // separately so the activity log can show it honestly.
    const boostFactor = boostMultiplier(
      state.battlePass?.boosts,
      action.at ?? Date.now(),
    );

    const pending =
      action.source === "offline" || state.pendingRoll?.id !== id
        ? null
        : state.pendingRoll;
    const act = pending ? reaperAct(pending.reaperAt) : null;
    const reaperMultiplier =
      act?.epMultiplier > 1 && pending.reaperBonus === act.epMultiplier
        ? act.epMultiplier
        : 1;

    let credited = 0,
      cycleEP = cycleEarnedEp(state);
    const discovered = new Set(state.discovered);
    const paidEvents = paid.map(({ result: scored, skill, key, spent }) => {
      const multiplier =
        baseMultiplier *
        skillMultiplier *
        boostFactor *
        (key === 0 ? reaperMultiplier : 1);
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

            ...(first
              ? drawCount > 1
                ? { draws: drawCount }
                : {}
              : spent > 1
                ? { draws: spent }
                : {}),

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

    const committed = paidEvents[0];
    const droppedPet =
      typeof action.petDrop === "string" &&
      petById.has(action.petDrop) &&
      !(state.pets ?? []).includes(action.petDrop)
        ? action.petDrop
        : null;

    const tally = {
      rolls: 1,
      rare: RARE_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
      epic: EPIC_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
      mythic: MYTHIC_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
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
    };
    const tasks =
      action.source === "offline"
        ? (state.tasks ?? emptyTasks())
        : recordTally(state.tasks, tally, at);
    const battlePass =
      action.source === "offline"
        ? (state.battlePass ?? emptyBattlePass())
        : recordPassTally(state.battlePass ?? emptyBattlePass(), tally, at);
    if (droppedPet)
      events.push({
        id: `${id}:pet`,
        type: "pet",
        at,
        productId: droppedPet,
        name: petById.get(droppedPet).name,
      });
    return {
      ...state,
      history: appendHistory(state.history, events),
      tasks,
      battlePass,
      pendingRoll: null,
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
            activePet:
              (state.activePet ?? "none") === "none"
                ? droppedPet
                : state.activePet,
            equippedSkills:
              (state.activePet ?? "none") === "none"
                ? autoEquip(
                    state.equippedSkills ?? [],
                    state,
                    skillForPet(droppedPet)?.id,
                  )
                : state.equippedSkills,
            goalId: state.goalId === droppedPet ? null : (state.goalId ?? null),
          }
        : {}),
    };
  }
  if (action.type === "buy") {
    const item = productById.get(action.id);
    if (!item) throw new Error("That item is not available.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid purchase time");

    if (item.eventOnly && resalePrice(item, at) === null)
      throw new Error(
        item.limited
          ? "This limited skin is paid by sale stamps, not by EP."
          : "This permanent aura is not available for purchase.",
      );
    if (item.repeatable) return buyTaskSkip(state, item, action);
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

    if (
      item.kind === "skill" &&
      !skillStock(skillStockWindow(at), state.owned).includes(item.id)
    )
      throw new Error(
        `${item.name} is out of stock. The skill shelf restocks every five minutes; no EP was spent.`,
      );
    if (state.balance < price) throw new Error("Not enough EP for this item.");
    return withSaleStamp(
      {
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
                lastSeenAt: at,
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

        ...(isResaleCosmetic(item)
          ? {
              rngweenLimited: grantRngweenCosmetic(
                state.rngweenLimited,
                item.id,
              ),
            }
          : {}),

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
      },
      at,
    );
  }
  if (action.type === "buy-pet") {
    const pet = petById.get(action.id);
    if (!pet) throw new Error("That companion is not available.");
    if ((state.pets ?? []).includes(pet.id))
      throw new Error("You already have this companion.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid purchase time");

    const price = saleCompanionPrice(pet, at);
    if (state.balance < price)
      throw new Error("Not enough EP for this companion.");
    const pets = [...new Set([...(state.pets ?? []), pet.id])].sort(
      (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
    );

    const worn = applyEvent(
      { ...state, pets },
      { type: "equip-pet", id: pet.id, at },
    );
    return withSaleStamp(
      {
        ...worn,
        balance: state.balance - price,
        goalId: state.goalId === pet.id ? null : (state.goalId ?? null),
        history: appendHistory(state.history, [
          {
            id:
              action.eventId ??
              `pet:${pet.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
            type: "purchase",
            at,
            productId: pet.id,
            name: pet.name,
            ep: price,
          },
        ]),
      },
      at,
    );
  }
  if (action.type === "equip-pet") {
    if (action.id !== "none" && !(state.pets ?? []).includes(action.id))
      throw new Error("Find or buy this companion before equipping it.");
    if ((state.activePet ?? "none") === action.id) return state;

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

    return { ...state, equippedSkills: equipped };
  }

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

          ...(Array.isArray(e.skills)
            ? { skills: e.skills.filter((id) => skillById.has(id)) }
            : {}),

          ...(e.draws >= 2 && e.draws <= 9
            ? { draws: Math.floor(e.draws) }
            : {}),
        };
      }
    } else if (e.type === "rngween-hourly") {
      const match = /^rngween-hourly:(opening|farewell):([1-9]\d*)$/.exec(e.id);
      if (
        !match ||
        !validAmount(Number(match[2])) ||
        typeof e.taskId !== "string" ||
        e.taskId.length > 100 ||
        typeof e.name !== "string" ||
        e.name.length > 100 ||
        !validAmount(e.pumpkoins) ||
        e.pumpkoins < 1
      )
        return [];
      next = {
        ...base,
        taskId: e.taskId,
        name: e.name,
        pumpkoins: e.pumpkoins,
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

        ...(validAmount(e.ladder) && e.ladder ? { ladder: e.ladder } : {}),
      };
    } else if (e.type === "rollback") {
      if (!validAmount(e.count) || e.count < 1) return [];
      next = {
        ...base,
        count: e.count,
        ...(validAmount(e.grant) && e.grant ? { grant: e.grant } : {}),
        ...(validAmount(e.cost) && e.cost ? { cost: e.cost } : {}),

        ...(validAmount(e.ladder) && e.ladder ? { ladder: e.ladder } : {}),
        ...(validAmount(e.prestiges) && e.prestiges
          ? { prestiges: e.prestiges }
          : {}),
      };
    } else if (e.type === "fresh-start") {
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
    } else if (e.type === "sale-reward") {
      // RETIREMENT: keep historical sale rows readable.
      if (
        e.productId !== BLACK_FRIDAY_SKIN.id ||
        typeof e.name !== "string" ||
        !e.name ||
        e.name.length > 100 ||
        !validAmount(e.stamps) ||
        e.stamps < 1
      )
        return [];
      next = {
        ...base,
        productId: e.productId,
        name: e.name,
        stamps: e.stamps,
      };
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
        if (
          !validAmount(e.ep) ||
          e.ep < e.pumpkoins ||
          e.ep % e.pumpkoins !== 0
        )
          return [];
        next = { ...base, name: e.name, ep: e.ep, pumpkoins: e.pumpkoins };
      } else {
        if (
          typeof e.productId !== "string" ||
          !e.productId ||
          e.productId.length > 100
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
      if (
        typeof e.productId !== "string" ||
        !e.productId ||
        e.productId.length > 100 ||
        typeof e.name !== "string" ||
        e.name.length > 100 ||
        !validAmount(e.points) ||
        e.points < 1
      )
        return [];
      next = {
        ...base,
        productId: e.productId,
        name: e.name,
        points: e.points,
      };
    } else if (e.type === "rngween-world-exchange") {
      const gotEp = e.ep !== undefined;
      const got = gotEp ? e.ep : e.pumpkoins;
      if (
        typeof e.name !== "string" ||
        e.name.length > 100 ||
        !validAmount(e.points) ||
        e.points < 1 ||
        !validAmount(got) ||
        got < 1 ||
        (gotEp && e.pumpkoins !== undefined)
      )
        return [];
      next = { ...base, name: e.name, points: e.points };
      if (gotEp) next.ep = got;
      else next.pumpkoins = got;
    } else if (e.type === "rngween-forged-key") {
      if (e.id !== `rngween-forged-key:${RNGWEEN_ID}`) return [];
      next = { ...base, name: "Valley Challenge Key" };
    } else if (e.type === "rngween-farewell") {
      // RETIREMENT: keep the historical retirement receipt.
      if (
        e.id !== `rngween-farewell:${RNGWEEN_ID}` ||
        !validAmount(e.ep) ||
        !validAmount(e.pumpkoins)
      )
        return [];
      next = { ...base, ep: e.ep, pumpkoins: e.pumpkoins };
    } else if (e.type === "rngween-finale") {
      if (
        e.id !== `rngween-finale:${RNGWEEN_ID}` ||
        e.productId !== RNGWEEN_FINALE_SKIN.id ||
        typeof e.name !== "string" ||
        e.name.length > 100
      )
        return [];
      next = { ...base, name: e.name, productId: e.productId };
    } else if (e.type === "pass-reward") {
      if (
        !/^season-[1-9]\d*$/.test(e.seasonId ?? "") ||
        !validAmount(e.level) ||
        e.level < 1 ||
        e.level > BATTLE_PASS_LEVELS ||
        !["free", "premium"].includes(e.track) ||
        typeof e.name !== "string" ||
        !e.name ||
        e.name.length > 100 ||
        !validAmount(e.ep)
      )
        return [];
      next = {
        ...base,
        seasonId: e.seasonId,
        level: e.level,
        track: e.track,
        name: e.name,
        ep: e.ep,
        ...(typeof e.productId === "string" && productById.has(e.productId)
          ? { productId: e.productId }
          : {}),
        ...(passBoostById(e.boostId) ? { boostId: e.boostId } : {}),
      };
    } else if (e.type === "pass-mission") {
      if (
        !/^season-[1-9]\d*$/.test(e.seasonId ?? "") ||
        typeof e.missionId !== "string" ||
        !passMissionById(e.missionId) ||
        typeof e.name !== "string" ||
        !e.name ||
        e.name.length > 100 ||
        !validAmount(e.bpep) ||
        e.bpep < 1
      )
        return [];
      next = {
        ...base,
        seasonId: e.seasonId,
        missionId: e.missionId,
        name: e.name,
        bpep: e.bpep,
      };
    } else if (e.type === "boost") {
      if (
        !passBoostById(e.boostId) ||
        typeof e.name !== "string" ||
        !e.name ||
        e.name.length > 100 ||
        !validAmount(e.minutes) ||
        e.minutes < 1 ||
        !validAmount(e.until) ||
        e.until < 1
      )
        return [];
      next = {
        ...base,
        boostId: e.boostId,
        name: e.name,
        minutes: e.minutes,
        until: e.until,
      };
    } else if (e.type === "pass-upgrade") {
      if (
        !/^season-[1-9]\d*$/.test(e.seasonId ?? "") ||
        typeof e.name !== "string" ||
        !e.name ||
        e.name.length > 100 ||
        !validAmount(e.ep) ||
        e.ep < 1
      )
        return [];
      next = { ...base, seasonId: e.seasonId, name: e.name, ep: e.ep };
    } else if (e.type === "task") {
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

  const skills =
    p.skills == null
      ? []
      : Array.isArray(p.skills)
        ? p.skills.filter((id) => skillById.has(id))
        : null;
  if (skills === null || skills.length !== (p.skills?.length ?? 0))
    throw new Error("Invalid committed roll");
  const plan = drawPlanFor(skills);
  const reaper = p.reaperAt === undefined ? null : reaperAct(p.reaperAt);
  if (
    p.reaperAt !== undefined &&
    (!validAmount(p.reaperAt) ||
      !reaper ||
      reaper.draws < 2 ||
      plan ||
      !Array.isArray(p.draws) ||
      p.draws.length !== reaper.draws)
  )
    throw new Error("Invalid committed roll");

  if (
    p.reaperBonus !== undefined &&
    (!reaper ||
      reaper.epMultiplier <= 1 ||
      p.reaperBonus !== reaper.epMultiplier)
  )
    throw new Error("Invalid committed roll");
  const waived = skillWaivesCooldown(skills);
  const draws = p.draws == null ? null : p.draws;

  const picks = p.picks == null ? null : p.picks;
  const pickDefs = drawPicksFor(skills);
  const pickIds = picks ? pickDefs.map((pick) => pick.id) : [];

  const maxDraws = Math.min(
    p.drawLimit === undefined ? 9 : SKILL_MAX_DRAWS,
    reaper
      ? reaper.draws
      : pickDefs.reduce((sum, pick) => sum + pick.attempts, 0) + 1,
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
    (p.cooldownMS === 0) !== (p.flywheel === "boost" || waived) ||
    !validAmount(p.startedAt + p.rollMS + p.cooldownMS) ||
    (p.drawLimit !== undefined && p.drawLimit !== SKILL_MAX_DRAWS) ||
    (draws !== null &&
      ((!plan && !reaper) ||
        !Array.isArray(draws) ||
        draws.length < 1 ||
        draws.length > maxDraws ||
        !draws.every((number) => validAmount(number) && number <= 1000000) ||
        !draws.includes(p.number)))
  )
    throw new Error("Invalid committed roll");

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
    ...(reaper ? { reaperAt: p.reaperAt } : {}),
    ...(p.reaperBonus !== undefined ? { reaperBonus: p.reaperBonus } : {}),
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

export function recoverUnsavedRolls(stored, temporary, unsaved = null) {
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
