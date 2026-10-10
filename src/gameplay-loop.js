import { productById, productPrice, shopProducts } from "./shop-data.js";
import { isCycleMarker } from "./history-log.js";
import { petById } from "./pets.js";

// Goals are a view over the existing economy, never another reward system.
export function availableGoals(progress, at = Date.now()) {
  return shopProducts
    .filter(
      (item) =>
        !progress.owned.includes(item.id) &&
        (!item.requires || progress.owned.includes(item.requires)),
    )
    .map((item) => ({ ...item, price: productPrice(item, at) }));
}
// A goal is a shop product still for sale, or a companion not found yet. Only
// the player's products and companions decide it: a companion is never a
// prerequisite for anything, so it is always reachable while unowned.
export function validGoal(id, owned = [], pets = []) {
  if (petById.has(id)) return !pets.includes(id);
  const item = productById.get(id);
  return (
    !!item &&
    !owned.includes(id) &&
    (!item.requires || owned.includes(item.requires))
  );
}
// What the goal views read: a name, a price, an id, a description and an icon.
// Companions are not catalogue products, so they are shaped to match here and
// the banner, the recap and the spotlight need no special case.
export function goalItem(id, at = Date.now()) {
  const pet = petById.get(id);
  if (pet)
    return {
      id: pet.id,
      name: pet.name,
      price: pet.price,
      description: pet.description,
      kind: "companion",
      icon: "companion",
    };
  const item = productById.get(id);
  return item ? { ...item, price: productPrice(item, at) } : null;
}
export function recommendedGoal(progress, at = Date.now()) {
  const available = availableGoals(progress, at).filter(
    (item) => !item.requiresProfile || progress.profile,
  );
  const priority = (item) =>
    ["roll", "cooldown", "pace", "offline", "offline-cap"].includes(
      item.kind,
    ) || ["auto-roll", "offline-roller", "persistence-core"].includes(item.id)
      ? 0
      : 1;
  return (
    available.sort(
      (a, b) => priority(a) - priority(b) || a.price - b.price,
    )[0] ?? null
  );
}
export function currentGoal(progress, at = Date.now()) {
  return validGoal(progress.goalId, progress.owned, progress.pets)
    ? goalItem(progress.goalId, at)
    : recommendedGoal(progress, at);
}
export function rollReceipt(progress, id) {
  // The cycle in play starts at its last marker: a rebirth, a prestige or the
  // Rollback. A roll from before that marker belongs to an earlier cycle.
  const cycleStart = progress.history.findLastIndex(isCycleMarker);
  const roll = progress.history.findLast(
    (e, i) =>
      i > cycleStart &&
      e.type === "roll" &&
      (id ? e.id === id : e.source !== "offline"),
  );
  if (!roll) return null;
  const unlocked =
    progress.history.find(
      (e) => e.type === "unlock" && e.id === `${roll.id}:unlock`,
    )?.badges ?? [];
  return { roll, unlocked };
}
