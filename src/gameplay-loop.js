import { productById, productPrice, shopProducts } from "./shop-data.js";
import { saleCompanionPrice } from "./black-friday.js";
import { isCycleMarker } from "./history-log.js";
import { petById } from "./pets.js";

export function availableGoals(progress, at = Date.now()) {
  return shopProducts
    .filter(
      (item) =>
        !item.eventOnly &&
        !progress.owned.includes(item.id) &&
        (!item.requires || progress.owned.includes(item.requires)),
    )
    .map((item) => ({ ...item, price: productPrice(item, at) }));
}

export function validGoal(id, owned = [], pets = []) {
  if (petById.has(id)) return !petById.get(id).eventOnly && !pets.includes(id);
  const item = productById.get(id);
  return (
    !!item &&
    !item.eventOnly &&
    !owned.includes(id) &&
    (!item.requires || owned.includes(item.requires))
  );
}

export function goalItem(id, at = Date.now()) {
  const pet = petById.get(id);
  if (pet && !pet.eventOnly)
    return {
      id: pet.id,
      name: pet.name,
      price: saleCompanionPrice(pet, at),
      description: pet.description,
      kind: "companion",
      icon: "companion",
    };
  const item = productById.get(id);
  return item && !item.eventOnly
    ? { ...item, price: productPrice(item, at) }
    : null;
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
