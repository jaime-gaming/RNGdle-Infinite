import { productById, shopProducts } from "./shop-data.js";

// Goals are a view over the existing economy, never another reward system.
export function availableGoals(progress) {
  return shopProducts.filter(
    (item) =>
      !progress.owned.includes(item.id) &&
      (!item.requires || progress.owned.includes(item.requires)),
  );
}
export function validGoal(id, owned) {
  const item = productById.get(id);
  return (
    !!item &&
    !owned.includes(id) &&
    (!item.requires || owned.includes(item.requires))
  );
}
export function recommendedGoal(progress) {
  const available = availableGoals(progress).filter(
    (item) => !item.requiresProfile || progress.profile,
  );
  const priority = (item) =>
    ["roll", "cooldown", "pace", "offline"].includes(item.kind) ||
    ["auto-roll", "offline-roller"].includes(item.id)
      ? 0
      : 1;
  return (
    available.sort(
      (a, b) => priority(a) - priority(b) || a.price - b.price,
    )[0] ?? null
  );
}
export function currentGoal(progress) {
  return validGoal(progress.goalId, progress.owned)
    ? productById.get(progress.goalId)
    : recommendedGoal(progress);
}
export function rollReceipt(progress, id) {
  const cycleStart = progress.history.findLastIndex(
    (e) => e.type === "rebirth",
  );
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
