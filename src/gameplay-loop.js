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
    ["roll", "cooldown", "pace"].includes(item.kind)
      ? 0
      : ["auto-roll", "offline-roller"].includes(item.id)
        ? 1
        : 2;
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
export function goalBenefit(item) {
  if (item.kind === "roll")
    return `${item.from / 1000}s → ${item.value / 1000}s reveals`;
  if (item.kind === "cooldown")
    return `${item.from / 1000}s → ${item.value / 1000}s cooldowns`;
  if (item.kind === "pace")
    return "Four charges. A fifth roll without cooldown.";
  if (item.kind === "aura")
    return "Make every roll look a little more like you.";
  if (item.id === "auto-roll")
    return "Your next ready roll, started automatically.";
  if (item.id === "offline-roller")
    return "Ordinary rolls earned while you’re away. Requires a saved profile.";
  return "Explore and filter your complete roll history.";
}
export function rollReceipt(progress, id) {
  const roll = progress.history.findLast(
    (e) => e.type === "roll" && (id ? e.id === id : e.source !== "offline"),
  );
  if (!roll) return null;
  const unlocked =
    progress.history.find(
      (e) => e.type === "unlock" && e.id === `${roll.id}:unlock`,
    )?.badges ?? [];
  return { roll, unlocked };
}

export function purchaseSummary(item) {
  if (item.kind === "aura") return "Equipped. Every number wears it.";
  if (item.id === "auto-roll")
    return "Enable Auto-Roll on the Roll page. It starts off.";
  if (item.id === "offline-roller")
    return "Ready for your next break. One roll per 10 minutes away.";
  if (item.id === "archive-lens")
    return "Search and tier filters are now available in History.";
  if (item.kind === "pace")
    return "Complete four online rolls to charge your Flywheel.";
  return `${goalBenefit(item)}. Applies to your next roll.`;
}
