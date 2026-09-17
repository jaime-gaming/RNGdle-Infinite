import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import { productById } from "./shop-data.js";
import { parseOffline } from "./offline.js";
export const PROGRESS_KEY = "rng-infinite-progress-v1";
const badgeIds = new Set(metadata.map((b) => b.id));
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;
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
    pendingRoll: null,
    offline: null,
  };
}
export function parseProgress(raw) {
  if (raw === null) return emptyProgress();
  const p = JSON.parse(raw);
  if (!p || p.version !== 1) throw new Error("Unrecognized save version");
  if (
    !validAmount(p.balance) ||
    !validAmount(p.totalEarned) ||
    p.balance > p.totalEarned ||
    !validAmount(p.cooldownUntil)
  )
    throw new Error("Invalid save values");
  if (
    !Array.isArray(p.discovered) ||
    !Array.isArray(p.owned) ||
    !Array.isArray(p.receipts)
  )
    throw new Error("Invalid save collections");
  let owned = [...new Set(p.owned.filter((id) => productById.has(id)))];
  for (let i = 0; i < 3; i++)
    owned = owned.filter(
      (id) =>
        !productById.get(id).requires ||
        owned.includes(productById.get(id).requires),
    );
  let profile = null;
  if (p.profile != null) {
    if (
      typeof p.profile.id !== "string" ||
      !p.profile.id ||
      !validUsername(p.profile.username) ||
      !validAmount(p.profile.createdAt)
    )
      throw new Error("Invalid local profile");
    profile = {
      id: p.profile.id,
      username: p.profile.username,
      createdAt: p.profile.createdAt,
    };
  }
  return {
    version: 1,
    history: parseHistory(p.history),
    pendingRoll: parsePending(p.pendingRoll),
    offline: parseOffline(p.offline, owned),
    profile,
    balance: p.balance,
    totalEarned: p.totalEarned,
    discovered: [...new Set(p.discovered.filter((id) => badgeIds.has(id)))],
    owned,
    equipped:
      owned.includes(p.equipped) && productById.get(p.equipped)?.kind === "aura"
        ? p.equipped
        : "none",
    cooldownUntil: p.cooldownUntil,
    receipts: [
      ...new Set(
        p.receipts.filter((id) => typeof id === "string" && id.length <= 100),
      ),
    ].slice(-128),
  };
}
export function validUsername(value) {
  return typeof value === "string" && /^[\p{L}\p{N}_-]{3,20}$/u.test(value);
}
export function applyProgress(state, action) {
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
    return {
      ...state,
      profile: { id: action.id, username, createdAt: action.createdAt },
    };
  }
  if (action.type === "complete") {
    const { result, id, cooldownUntil } = action;
    if (
      typeof id !== "string" ||
      !id ||
      !validAmount(result?.totalEP) ||
      !validAmount(result?.number) ||
      result.number > 1000000 ||
      !Array.isArray(result?.badges) ||
      ![
        "trash",
        "common",
        "uncommon",
        "rare",
        "epic",
        "anomaly",
        "mythic",
        "godly",
      ].includes(result?.tier) ||
      !validAmount(cooldownUntil)
    )
      throw new Error("Invalid roll");
    if (
      state.receipts.includes(id) ||
      state.history?.some((e) => e.id === id && e.type === "roll")
    )
      return state;
    const balance = state.balance + result.totalEP,
      totalEarned = state.totalEarned + result.totalEP;
    if (!validAmount(balance) || !validAmount(totalEarned))
      throw new Error("EP balance limit reached.");
    const earned = [
      ...new Set(
        result.badges.map((b) => b.id).filter((id) => badgeIds.has(id)),
      ),
    ];
    const unlocked = earned.filter((id) => !state.discovered.includes(id));
    const at = action.at ?? Math.ceil(Date.now());
    const events = [
      {
        id,
        type: "roll",
        at,
        number: result.number,
        tier: result.tier,
        ep: result.totalEP,
        badges: earned,
        ...(action.source === "offline" ? { source: "offline" } : {}),
      },
    ];
    if (unlocked.length)
      events.push({
        id: `${id}:unlock`,
        type: "unlock",
        at,
        number: result.number,
        badges: unlocked,
      });
    return {
      ...state,
      history: [...(state.history ?? []), ...events],
      pendingRoll: null,
      balance,
      totalEarned,
      discovered: [
        ...new Set([
          ...state.discovered,
          ...result.badges.map((b) => b.id).filter((id) => badgeIds.has(id)),
        ]),
      ],
      cooldownUntil: Math.max(state.cooldownUntil, cooldownUntil),
      receipts: [...state.receipts, id].slice(-128),
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
      throw new Error("Create a local profile before buying Offline Roller.");
    if (state.balance < item.price)
      throw new Error("Not enough EP for this item.");
    return {
      ...state,
      history: [
        ...(state.history ?? []),
        {
          id: action.eventId ?? `buy:${item.id}`,
          type: "purchase",
          at: action.at ?? Math.ceil(Date.now()),
          productId: item.id,
          name: item.name,
          ep: item.price,
        },
      ],
      balance: state.balance - item.price,
      ...(item.id === "offline-roller"
        ? {
            offline: {
              lastSeenAt: action.at ?? Math.ceil(Date.now()),
              batch: null,
              report: null,
            },
          }
        : {}),
      owned: [...state.owned, item.id],
      equipped: item.kind === "aura" ? item.id : state.equipped,
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
      history: [
        ...(state.history ?? []),
        {
          id:
            action.eventId ??
            `equip:${action.id}:${state.history?.length ?? 0}`,
          type: "equip",
          at: action.at ?? Math.ceil(Date.now()),
          productId: action.id,
          name: productById.get(action.id)?.name ?? "Original appearance",
        },
      ],
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
          tier: e.ep >= 500000 ? "godly" : e.tier,
          ...(e.source === "offline" ? { source: "offline" } : {}),
        };
      }
    } else if (["purchase", "equip"].includes(e.type)) {
      if (
        typeof e.productId !== "string" ||
        !(
          productById.has(e.productId) ||
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
    } else return [];
    seen.add(e.id);
    return [next];
  });
}

export function parsePending(p) {
  if (p == null) return null;
  if (
    typeof p.id !== "string" ||
    !p.id ||
    p.id.length > 100 ||
    !validAmount(p.number) ||
    p.number > 1000000 ||
    !validAmount(p.startedAt) ||
    ![45000, 35000, 25000, 15000].includes(p.rollMS) ||
    ![60000, 45000, 30000, 15000].includes(p.cooldownMS) ||
    !validAmount(p.startedAt + p.rollMS + p.cooldownMS)
  )
    throw new Error("Invalid committed roll");
  return {
    id: p.id,
    number: p.number,
    startedAt: p.startedAt,
    rollMS: p.rollMS,
    cooldownMS: p.cooldownMS,
  };
}

// Only roll settlement can succeed in memory after a failed write. Reapply those
// receipts to the latest shared wallet instead of overwriting other tabs' spending.
export function recoverUnsavedRolls(stored, temporary) {
  let merged = stored;
  for (const event of temporary.history ?? []) {
    if (
      event.type !== "roll" ||
      merged.history.some((e) => e.type === "roll" && e.id === event.id)
    )
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
