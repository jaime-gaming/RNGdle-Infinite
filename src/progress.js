import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import {
  productById,
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
import { parseOffline } from "./offline.js";
import {
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
  claimTask,
  emptyTasks,
  parseTasks,
  periodKey,
  RARE_OR_BETTER,
  recordTally,
  taskById,
  TASK_CADENCES,
} from "./tasks.js";
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

// The wallet multiplier of a settled roll: companions, rebirth and
// ultra-rebirth bonuses, and any wallet skill that fired. It only ever scales
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
  // Only shop skills count towards the rack's slots: rebirth rewards and
  // companion signatures ride free, so they always fit.
  if (skillTakesSlot(id)) {
    const shop = list.filter(skillTakesSlot).length;
    if (shop >= skillSlots(progress.owned ?? [])) return list;
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
  };
}

// Bookmarks pin a few rolls the player wants to find again. They reference
// history entries by id, so a repaired save drops any mark whose roll did not
// survive the repair, and the cap is part of the save's shape, not the UI's.
export const BOOKMARK_LIMIT = 3;
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
      `ultra-rebirth count was ${describeStored(p.ultraRebirths)}, so it was set to ${ultraRebirths}.`,
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
  // Task progress belongs to the save alone, so an unreadable slot is simply
  // reset: nothing else in the save can vouch for it.
  const tasksRead = parseTasks(p.tasks);
  if (tasksRead.repaired)
    note("task progress was unreadable, so it was reset.");
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
    ...new Set((petsInput ?? []).filter((id) => petById.has(id))),
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
  const skills = parseUnlockedSkills(skillsInput, { owned });
  if (p.equippedSkills != null && !Array.isArray(p.equippedSkills))
    note("skill rack was unreadable, so it was emptied.");
  const equippedSkills = parseEquippedSkills(p.equippedSkills, {
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
    surplusBanked,
    offline,
    flywheelCharge,
    profile,
    goalId: validGoal(p.goalId, owned) ? p.goalId : null,
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
    tasks: tasksRead.tasks,
    skillCharge,
    cooldownUntil,
    receipts: [
      ...new Set(
        p.receipts.filter((id) => typeof id === "string" && id.length <= 100),
      ),
    ].slice(-128),
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

// What a new cycle hands back, shared by a rebirth and an ultra-rebirth.
//
// A cycle restarts the run, not the account: the badge collection, everything
// the wallet bought — upgrades, auras, tools and shop skills —, the companions
// and the EP in the wallet start over. What the account *did* is never undone:
// the activity history, the rebirth and ultra-rebirth counters with their
// permanent bonuses, the skills the ladder already granted, the all-time EP
// earned and the profile all stay.
//
// `granted` is the ladder skill this rebirth pays, which is earned rather than
// bought and so joins the skills that survived, and `starter` is the EP the new
// cycle begins with — paid by the rungs and ultra-rebirths the account keeps.
function startNewCycle(state, { granted = null, starter = 0 } = {}) {
  const owned = [];
  // Shop skills are purchases: they go back on the stall. Ladder skills were
  // paid for by the rebirths the cycle keeps, so they stay unlocked.
  const kept = (state.skills ?? []).filter(
    (id) => skillById.get(id)?.source !== "shop",
  );
  const skills = granted ? [...new Set([...kept, granted.id])] : kept;
  const base = {
    ...state,
    owned,
    pets: [],
    activePet: "none",
    skills,
  };
  // The rack is rebuilt rather than repaired: the skill this rebirth pays goes
  // on first, then whatever the cycle kept. Ladder skills ride free, so the
  // rack keeps them all; only the shop skills left behind took slots.
  let equippedSkills = autoEquip([], base, granted?.id);
  for (const id of skills) equippedSkills = autoEquip(equippedSkills, base, id);
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
    equipped: "none",
    // The tracked goal is a preference, not a reward: it survives when it is
    // still reachable from an empty workshop.
    goalId: validGoal(state.goalId, owned) ? state.goalId : null,
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
export function applyProgress(state, action) {
  const next = applyEvent(state, action);
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
    // The run starts over — collection, everything bought, companions and the
    // wallet — while the account keeps its history, its rebirths and every
    // bonus it earned. Receipts stay too, so a roll from an earlier cycle can
    // never be settled twice into the new one.
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
        "This ultra-rebirth belongs to an older cycle. Reload and try again.",
      );
    const now = action.at ?? Math.ceil(Date.now());
    if (!validAmount(now) || now > 8640000000000000)
      throw new Error("Invalid ultra-rebirth time");
    const blocked = ultraRebirthBlocker(state, now);
    if (blocked) throw new Error(blocked);
    if (!validAmount(count + 1))
      throw new Error("Ultra-rebirth limit reached.");
    // The same fresh start a rebirth gives, taken at the top of the ladder
    // with half the collection in hand. It costs the run, never the account:
    // history, rebirths, ladder skills and every permanent bonus stay, and the
    // ultra-rebirth adds ten more points forever.
    // The same overshoot dividend as a rung: the ultra gate is a floor too.
    const ultraCost = ultraRebirthRequirement();
    const surplus = rebirthSurplus(cycleEarnedEp(state), ultraCost.ep);
    const starter =
      cycleStarterEp(state.rebirths ?? 0, count + 1) + surplus.starterBonus;
    const cost = ultraCost;
    return {
      ...startNewCycle(state, { starter }),
      profile: state.profile,
      ultraRebirths: count + 1,
      surplusBanked:
        (state.surplusBanked ?? 0) + Math.round(surplus.bankedBonus * 100),
      history: appendHistory(state.history, [
        {
          id: action.eventId ?? `ultra:${count + 1}`,
          type: "ultra-rebirth",
          at: now,
          count: count + 1,
          ...(starter ? { grant: starter } : {}),
          ...(cost ? { cost: cost.ep } : {}),
        },
      ]),
    };
  }
  if (action.type === "goal") {
    if (action.id !== null && !validGoal(action.id, state.owned))
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
  // A task pays its reward into the wallet once per reset. It is a reward for
  // play, not a sale, so it is logged as income and never counts towards the
  // rebirth gate, which reads only rolls.
  if (action.type === "claim-task") {
    const task = taskById(action.id);
    if (!task) throw new Error("That task does not exist.");
    const at = action.at ?? Math.ceil(Date.now());
    if (!validAmount(at) || at > 8640000000000000)
      throw new Error("Invalid task time");
    const reward = task.reward;
    const balance = state.balance + reward;
    const totalEarned = state.totalEarned + reward;
    if (!validAmount(balance) || !validAmount(totalEarned))
      throw new Error("EP balance limit reached.");
    return {
      ...state,
      tasks: claimTask(state.tasks, task, at),
      balance,
      totalEarned,
      history: appendHistory(state.history, [
        {
          id:
            action.eventId ?? `task:${task.id}:${periodKey(task.cadence, at)}`,
          type: "task",
          at,
          taskId: task.id,
          cadence: task.cadence,
          name: task.title,
          ep: reward,
        },
      ]),
    };
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
    const petFactor = petMultiplier(state.activePet);
    const multiplier =
      petFactor *
      rebirthMultiplier(state.rebirths ?? 0) *
      ultraRebirthMultiplier(state.ultraRebirths ?? 0) *
      surplusMultiplier(state.surplusBanked ?? 0) *
      skillWalletMultiplier(fired);
    // The wallet pays for every number the roll kept, and every one of them
    // counts towards the cycle: a stacked rack is meant to earn more, not the
    // same reward spread over more draws.
    let credited = 0,
      cycleEP = cycleEarnedEp(state);
    const discovered = new Set(state.discovered);
    const paidEvents = paid.map(({ result: scored, skill, key, spent }) => {
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
      return { scored, skill, key, credit, spent, earned, unlocked };
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
        ? Math.min(state.pendingRoll.draws.length, SKILL_MAX_DRAWS)
        : 0;
    const at = action.at ?? Math.ceil(Date.now());
    // One banked roll per number the roll kept: the committed one first, then
    // each number another draw skill chose. The extra lines carry the roll
    // they came from, so the feed can keep them together without pretending
    // they were separate rolls.
    const events = paidEvents.flatMap(
      ({ scored, skill, key, credit, spent, earned: badges, unlocked }) => {
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
    const tasks =
      action.source === "offline"
        ? (state.tasks ?? emptyTasks())
        : recordTally(
            state.tasks,
            {
              rolls: 1,
              rare: RARE_OR_BETTER.includes(committed.scored.tier) ? 1 : 0,
              discovered: paidEvents.reduce(
                (total, paid) => total + paid.unlocked.length,
                0,
              ),
              banked: credited,
              skills: fired.length ? 1 : 0,
            },
            at,
          );
    const droppedPet =
      typeof action.petDrop === "string" &&
      petById.has(action.petDrop) &&
      !(state.pets ?? []).includes(action.petDrop)
        ? action.petDrop
        : null;
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
      receipts: [...state.receipts, id].slice(-128),
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
          }
        : {}),
    };
  }
  if (action.type === "buy") {
    const item = productById.get(action.id);
    if (!item) throw new Error("That item is not available.");
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
          (action.at ?? Math.ceil(Date.now())) - state.offline.lastSeenAt >=
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
      !skillStock(
        skillStockWindow(action.at ?? Math.ceil(Date.now())),
        state.owned,
      ).includes(item.id)
    )
      throw new Error(
        `${item.name} is out of stock. The skill shelf restocks every five minutes; no EP was spent.`,
      );
    if (state.balance < item.price)
      throw new Error("Not enough EP for this item.");
    return {
      ...state,
      history: appendHistory(state.history, [
        {
          id:
            action.eventId ??
            `buy:${item.id}${state.rebirths ? `:${state.rebirths}` : ""}`,
          type: "purchase",
          at: action.at ?? Math.ceil(Date.now()),
          productId: item.id,
          name: item.name,
          ep: item.price,
        },
      ]),
      balance: state.balance - item.price,
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
    if ((state.pets ?? []).includes(pet.id))
      throw new Error("You already have this companion.");
    if (state.balance < pet.price)
      throw new Error("Not enough EP for this companion.");
    return {
      ...state,
      balance: state.balance - pet.price,
      pets: [...new Set([...(state.pets ?? []), pet.id])].sort(
        (a, b) => PET_IDS.indexOf(a) - PET_IDS.indexOf(b),
      ),
      // Buying a companion equips it, matching how auras behave.
      activePet: pet.id,
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
      // The slots only hold shop skills: rebirth rewards and companion
      // signatures ride free beside the rack.
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
      throw new Error("Purchase this aura before equipping it.");
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
          ...(e.draws >= 2 && e.draws <= SKILL_MAX_DRAWS
            ? { draws: Math.floor(e.draws) }
            : {}),
        };
      }
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
  const pickIds = picks ? drawPicksFor(skills).map((pick) => pick.id) : [];
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
          pick.spent <= SKILL_MAX_DRAWS &&
          (draws ? draws.includes(pick.number) : pick.number === p.number),
      ))
  )
    throw new Error("Invalid committed roll");
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
    (draws !== null &&
      (!plan ||
        !Array.isArray(draws) ||
        draws.length < 1 ||
        draws.length > Math.min(plan.attempts, SKILL_MAX_DRAWS) ||
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
    ...(picks
      ? {
          picks: picks.map((pick) => ({
            skill: pick.skill,
            number: pick.number,
            spent: Math.trunc(pick.spent),
          })),
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
    (stored.ultraRebirths ?? 0) !== (temporary.ultraRebirths ?? 0)
  )
    return stored;
  let merged = stored;
  for (const event of temporary.history ?? []) {
    if (event.type !== "roll" || (unsaved && !unsaved.has(event.id))) continue;
    if (merged.history.some((e) => e.type === "roll" && e.id === event.id))
      continue;
    const pending = merged.pendingRoll;
    merged = applyProgress(merged, {
      type: "complete",
      id: event.id,
      source: event.source,
      at: event.at,
      result: {
        number: event.number,
        totalEP: event.ep,
        tier: event.tier,
        badges: event.badges.map((id) => ({ id })),
      },
      cooldownUntil: Math.max(merged.cooldownUntil, temporary.cooldownUntil),
    });
    if (pending && pending.id !== event.id)
      merged = { ...merged, pendingRoll: pending };
  }
  return merged;
}
