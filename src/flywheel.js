import { productById } from "./shop-data.js";
export function flywheelRequired(owned = []) {
  return owned.reduce(
    (count, id) => Math.min(count, productById.get(id)?.charges ?? 4),
    4,
  );
}
export const FLYWHEEL_CHARGES = 4;
// A committed flag snapshots ownership and the boost. Purchasing mid-reveal
// never charges old rolls, and offline completions cannot fill the flywheel.
export function flywheelForDraw(progress) {
  if (!progress.owned.includes("flywheel")) return null;
  return (progress.flywheelCharge ?? 0) >= flywheelRequired(progress.owned)
    ? "boost"
    : "charge";
}
export function flywheelAfterSettlement(progress, id, source, factor = 1) {
  const count = progress.flywheelCharge ?? 0;
  return source !== "offline" &&
    progress.owned.includes("flywheel") &&
    progress.pendingRoll?.id === id &&
    progress.pendingRoll.flywheel === "charge"
    ? Math.min(flywheelRequired(progress.owned), count + Math.max(1, factor))
    : count;
}
