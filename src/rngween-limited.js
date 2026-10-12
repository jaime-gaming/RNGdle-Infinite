import {
  RNGWEEN_AURAS,
  RNGWEEN_ID,
  RNGWEEN_WORLD_SKIN,
  rngweenCalendar,
  rngweenState,
} from "./rngween.js";

import { parseRngweenHourly } from "./rngween-hourly.js";
import { parseWorldAdventure } from "./rngween-world-adventure.js";
import {
  WORLD_KEY_ID,
  WORLD_SPEED_ITEMS,
  WORLD_VALLEY_MAX,
  WORLD_VALLEY_TARGET,
  emptyRngweenWorld,
  parseRngweenWorld,
  rngweenValleyUnlocked,
  worldState,
} from "./rngween-world-zones.js";

// CLEANUP Nov 4, 2026 00:00 UTC: remove the limited shop, exchange and world
// action/UI wiring. Keep parsing/retirement, purchased-aura and skin receipts,
// and the permanent Hexbound registry/art. Never restore expired currency.
export const EP_PER_PUMPKOIN = 10000;
export const RNGWEEN_WORLD_MAX = WORLD_VALLEY_MAX;
export const RNGWEEN_WORLD_TARGET = WORLD_VALLEY_TARGET;
export const RNGWEEN_PET = {
  id: "pumpkin-familiar",
  name: "Pumpkin Familiar",
  kind: "companion",
  eventOnly: true,
  accent: "#fb923c",
  multiplier: 1.75,
  pumpkoinPrice: 800,
  icon: "pumpkin",
  description:
    "Banks 75% more EP on every ordinary roll. Lantern Glow doubles banked EP every five charged online rolls; its signature uses a rack slot. Leaves after November 3 (UTC).",
};
export const RNGWEEN_SIGNATURE = {
  id: "lantern-glow",
  source: "pet",
  petId: RNGWEEN_PET.id,
  eventOnly: true,
  name: "Lantern Glow",
  icon: "lantern",
  tint: "orange",
  kind: "wallet",
  value: 2,
  charges: 5,
  description:
    "The next ordinary roll banks twice its EP. Charges in five online rolls, stacks with the familiar and uses a rack slot. Expires after November 3 (UTC).",
};
export const RNGWEEN_SKILL = {
  id: "midnight-harvest",
  source: "event",
  eventOnly: true,
  name: "Midnight Harvest",
  icon: "harvest",
  tint: "violet",
  kind: "best-of",
  attempts: 4,
  charges: 7,
  pumpkoinPrice: 1200,
  description:
    "Draw four numbers and keep the highest-scoring one. Charges in seven online rolls and uses a rack slot. If the whole harvest cannot fit the six-draw limit, it stays charged. Expires after November 3 (UTC).",
};
// The key is shared by the Reaper and Limited Shop, never ordinary EP stock.
export const RNGWEEN_WORLD_KEY = {
  id: WORLD_KEY_ID,
  name: "Valley Challenge Key",
  kind: "world-key",
  eventOnly: true,
  pumpkoinPrice: 2000,
  icon: "world-key",
  description:
    "Opens the Valley of Horrors challenge, not the World entrance. Forge one from a Graveyard fragment and a Haunted House fragment, or buy this shortcut. Never consumed on entry or rebirth. No aura or Hexbound included. Expires after November 3 UTC.",
};
export const RNGWEEN_LIMITED_ITEMS = [
  RNGWEEN_PET,
  RNGWEEN_WORLD_KEY,
  { ...RNGWEEN_SKILL, kind: "skill", skillId: RNGWEEN_SKILL.id },
  ...RNGWEEN_AURAS.map((aura, i) => ({
    ...aura,
    pumpkoinPrice: [5000, 8000, 12000, 20000][i],
  })),
];
export const limitedItemById = new Map(
  RNGWEEN_LIMITED_ITEMS.map((item) => [item.id, item]),
);
export const RNGWEEN_TEMP_SKILL_IDS = [RNGWEEN_SKILL.id, RNGWEEN_SIGNATURE.id];
const auraIds = new Set(RNGWEEN_AURAS.map((aura) => aura.id));
const temporaryIds = new Set([
  RNGWEEN_PET.id,
  RNGWEEN_SKILL.id,
  RNGWEEN_WORLD_KEY.id,
]);
const amount = (n) => Number.isSafeInteger(n) && n >= 0;
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function emptyRngweenLimited() {
  return {
    id: RNGWEEN_ID,
    pumpkoins: 0,
    bought: [],
    auras: [],
    drawn: [],
    skinEarned: false,
    rewardedMissions: [],
    world: emptyRngweenWorld(),
  };
}

// Redundant ownership/paid receipts repair entitlements, never a wallet. Do
// this before parsing the World so a recovered speed does not discard a valid
// in-flight deadline. History can help, but permanent ownership also stands
// on its own after that history has been pruned.
function recoverLimitedReceipts(
  value,
  { owned = [], earnedAuras = [], history = [] } = {},
) {
  const auras = [
    ...new Set([
      ...(Array.isArray(value.auras) ? value.auras : []),
      ...owned.filter((id) => auraIds.has(id)),
      ...earnedAuras.filter((id) => auraIds.has(id)),
    ]),
  ];
  let next = {
    ...value,
    auras,
    skinEarned:
      value.skinEarned === true ||
      owned.includes(RNGWEEN_WORLD_SKIN.id) ||
      (Array.isArray(value.drawn) &&
        value.drawn.includes(RNGWEEN_WORLD_TARGET)),
  };
  let repaired =
    !Array.isArray(value.auras) || typeof value.skinEarned !== "boolean";
  const paidHistory = history.filter(
    (entry) => rngweenCalendar(entry.at).limitedPhase === "active",
  );
  for (const entry of paidHistory)
    if (
      ["rngween-purchase", "rngween-mission"].includes(entry.type) &&
      auraIds.has(entry.productId) &&
      !auras.includes(entry.productId)
    ) {
      auras.push(entry.productId);
      repaired = true;
    }
  if (value.retired === true) return { value: next, repaired };
  if (!Array.isArray(value.bought)) repaired = true;
  const bought = [...(Array.isArray(value.bought) ? value.bought : [])];
  const world = object(value.world)
    ? { ...value.world }
    : emptyRngweenWorld(value.drawn ?? [], true);
  let upgradeLevel = 0,
    worldRecovered = false;
  for (const entry of paidHistory) {
    if (entry.type === "rngween-purchase") {
      if (
        temporaryIds.has(entry.productId) &&
        !bought.includes(entry.productId)
      ) {
        bought.push(entry.productId);
        repaired = true;
      }
    } else if (entry.type === "rngween-world-purchase") {
      const item = WORLD_SPEED_ITEMS.find(
        (item) => item.id === entry.productId,
      );
      if (item && entry.pumpkoins === item.pumpkoinPrice)
        upgradeLevel = Math.max(upgradeLevel, item.level);
    } else if (
      entry.type === "rngween-forged-key" &&
      entry.id === `rngween-forged-key:${RNGWEEN_ID}`
    ) {
      if (
        !world.keyForged ||
        !world.fragments?.graveyard ||
        !world.fragments?.["haunted-house"]
      ) {
        world.fragments = { graveyard: true, "haunted-house": true };
        world.keyForged = true;
        repaired = worldRecovered = true;
      }
    }
  }
  if (upgradeLevel) {
    const upgrades = [...(Array.isArray(world.upgrades) ? world.upgrades : [])];
    for (const item of WORLD_SPEED_ITEMS.slice(0, upgradeLevel))
      if (!upgrades.includes(item.id)) {
        upgrades.push(item.id);
        repaired = worldRecovered = true;
      }
    world.upgrades = WORLD_SPEED_ITEMS.filter((item) =>
      upgrades.includes(item.id),
    ).map((item) => item.id);
  }
  // An absent World is a normal older-save migration, not a forged-key receipt.
  next = { ...next, auras, bought, ...(worldRecovered ? { world } : {}) };
  return { value: next, repaired };
}

// The save is the account's non-repeating pool, not a per-tab cosmetic cache.
// Repair keeps every valid first occurrence rather than discarding the pool.
export function parseRngweenLimited(value, receipts) {
  const invalid =
    value !== undefined && (!object(value) || value.id !== RNGWEEN_ID);
  const recovered = recoverLimitedReceipts(
    invalid || value === undefined ? emptyRngweenLimited() : value,
    receipts,
  );
  value = recovered.value;
  let repaired = invalid || recovered.repaired;
  function ids(list, allowed) {
    const kept = [];
    if (!Array.isArray(list)) {
      repaired = true;
      return kept;
    }
    for (const id of list) {
      if (!allowed.has(id) || kept.includes(id)) repaired = true;
      else kept.push(id);
    }
    return kept;
  }
  const auras = ids(value.auras, auraIds);
  if (value.retired === true) {
    if (
      [
        "pumpkoins",
        "bought",
        "drawn",
        "rewardedMissions",
        "hourly",
        "adventure",
        "world",
      ].some((key) => key in value) ||
      typeof value.skinEarned !== "boolean"
    )
      repaired = true;
    return {
      limited: {
        id: RNGWEEN_ID,
        auras,
        skinEarned: value.skinEarned === true,
        retired: true,
      },
      repaired,
    };
  }
  const bought = ids(value.bought, temporaryIds);
  const drawn = [];
  const seen = new Set();
  if (!Array.isArray(value.drawn)) repaired = true;
  else
    for (const number of value.drawn) {
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > RNGWEEN_WORLD_MAX ||
        seen.has(number)
      ) {
        repaired = true;
        continue;
      }
      seen.add(number);
      drawn.push(number);
    }
  const hourlyRead = parseRngweenHourly(value.hourly);
  const adventureRead = parseWorldAdventure(value.adventure, drawn);
  const worldRead = parseRngweenWorld(value.world, drawn);
  repaired ||=
    hourlyRead.repaired || adventureRead.repaired || worldRead.repaired;
  const pumpkoins = amount(value.pumpkoins) ? value.pumpkoins : 0;
  if (pumpkoins !== value.pumpkoins) repaired = true;
  if (typeof value.skinEarned !== "boolean") repaired = true;
  return {
    limited: {
      id: RNGWEEN_ID,
      pumpkoins,
      bought,
      auras,
      drawn,
      world: worldRead.world,
      ...(hourlyRead.board ? { hourly: hourlyRead.board } : {}),
      ...(adventureRead.adventure
        ? { adventure: adventureRead.adventure }
        : {}),
      // Missing on earlier 0.5.1 saves: verified reconciliation pays it once.
      rewardedMissions: ids(
        value.rewardedMissions === undefined ? [] : value.rewardedMissions,
        auraIds,
      ),
      skinEarned: value.skinEarned === true || seen.has(RNGWEEN_WORLD_TARGET),
    },
    repaired,
  };
}

// World entry is public. Only the Valley challenge needs a paid/forged key.
export function rngweenWorldUnlocked(_tasks, limited) {
  return !limited?.retired;
}
export function requireRngweenValley(state, at) {
  requireRngweenWorld(state, at);
  if (!rngweenValleyUnlocked(state.rngweenLimited))
    throw new Error(
      "The Valley needs a key. Complete both zones' badge objectives to forge one, or buy the Valley Challenge Key.",
    );
  if ((state.rngweenLimited?.drawn?.length ?? 0) >= RNGWEEN_WORLD_MAX)
    throw new Error(
      "Every number in the Valley has been rolled. No repeats remain.",
    );
}

export function requireRngweenLimited(state, at) {
  if (!state.profile)
    throw new Error("Create a local profile to save RNGween rewards.");
  if (
    rngweenCalendar(at).limitedPhase !== "active" ||
    state.rngweenLimited?.retired
  )
    throw new Error(
      "The RNGween Limited Shop and World are open October 21–November 3, 2026 (UTC).",
    );
}

export function requireRngweenWorld(state, at) {
  requireRngweenLimited(state, at);
}

// Separate, stable receipts survive resets and history deletion. Older claimed
// missions receive the new coin reward once, only while the verified shop lives.
export function grantRngweenMissionPumpkoins(state, at) {
  const limited = state.rngweenLimited ?? emptyRngweenLimited();
  if (rngweenCalendar(at).limitedPhase !== "active" || limited.retired)
    return state;
  const paid = limited.rewardedMissions ?? [];
  const rewards = rngweenState(state.tasks, at).missions.filter(
    (mission) => mission.collected && !paid.includes(mission.id),
  );
  if (!rewards.length) return state;
  const pumpkoins =
    limited.pumpkoins +
    rewards.reduce((sum, mission) => sum + mission.pumpkoins, 0);
  if (!amount(pumpkoins)) throw new Error("Pumpkoin balance limit reached.");
  return {
    ...state,
    rngweenLimited: {
      ...limited,
      pumpkoins,
      rewardedMissions: [...paid, ...rewards.map((mission) => mission.id)],
      auras: [
        ...new Set([
          ...(limited.auras ?? []),
          ...rewards.map((mission) => mission.auraId),
        ]),
      ],
    },
    history: [
      ...state.history,
      ...rewards.map((mission) => ({
        id: `rngween-mission:${RNGWEEN_ID}:${mission.id}`,
        type: "rngween-mission",
        at,
        productId: mission.auraId,
        name: mission.title,
        pumpkoins: mission.pumpkoins,
      })),
    ],
  };
}

export function limitedRewardIds(limited) {
  return [
    ...(limited?.auras ?? []),
    ...(limited?.skinEarned ? [RNGWEEN_WORLD_SKIN.id] : []),
  ];
}

// Deletion needs a verified website date, never a device time or UI setting.
// A retired receipt cannot be reopened by replaying an older calendar.
export function retireRngweenLimited(state, at) {
  const limited = state.rngweenLimited;
  if (!Number.isFinite(at) || at < rngweenCalendar(at).limitedEndsAt)
    return state;
  if (limited?.retired) return state;
  const expired = new Set(RNGWEEN_TEMP_SKILL_IDS);
  // A valid result committed before closing keeps its permanent prize even
  // if the tab slept through the reveal; expired fragments/coins stay gone.
  const pending = worldState(limited).pending;
  const earned =
    limited?.skinEarned === true ||
    (pending?.zone === "valley" &&
      pending.number === RNGWEEN_WORLD_TARGET &&
      pending.revealsAt <= at &&
      pending.revealsAt < rngweenCalendar(at).limitedEndsAt &&
      rngweenCalendar(pending.startedAt).limitedPhase === "active");
  return {
    ...state,
    rngweenLimited: {
      id: RNGWEEN_ID,
      auras: limited?.auras ?? [],
      skinEarned: earned,
      retired: true,
    },
    owned: [
      ...new Set([
        ...(state.owned ?? []).filter((id) => id !== RNGWEEN_SKILL.id),
        ...(earned ? [RNGWEEN_WORLD_SKIN.id] : []),
      ]),
    ],
    equipped:
      earned && state.equipped === "none"
        ? RNGWEEN_WORLD_SKIN.id
        : state.equipped,
    pets: (state.pets ?? []).filter((id) => id !== RNGWEEN_PET.id),
    activePet: state.activePet === RNGWEEN_PET.id ? "none" : state.activePet,
    skills: (state.skills ?? []).filter((id) => !expired.has(id)),
    equippedSkills: (state.equippedSkills ?? []).filter(
      (id) => !expired.has(id),
    ),
    skillCharge: Object.fromEntries(
      Object.entries(state.skillCharge ?? {}).filter(
        ([id]) => !expired.has(id),
      ),
    ),
    loadouts: (state.loadouts ?? []).map((loadout) => ({
      ...loadout,
      skills: loadout.skills.filter((id) => !expired.has(id)),
    })),
    // A previously committed roll keeps its number/skill snapshot. Retirement
    // removes future uses, not a roll that was honestly committed beforehand.
  };
}
