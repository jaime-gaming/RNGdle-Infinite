import metadata from "./data/badge-metadata.json" with { type: "json" };
import { productById } from "./shop-data.js";
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
      !validAmount(cooldownUntil)
    )
      throw new Error("Invalid roll");
    if (state.receipts.includes(id)) return state;
    const balance = state.balance + result.totalEP,
      totalEarned = state.totalEarned + result.totalEP;
    if (!validAmount(balance) || !validAmount(totalEarned))
      throw new Error("EP balance limit reached.");
    return {
      ...state,
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
    if (state.balance < item.price)
      throw new Error("Not enough EP for this item.");
    return {
      ...state,
      balance: state.balance - item.price,
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
    return { ...state, equipped: action.id };
  }
  throw new Error("Unknown progress action");
}
