export const FLYWHEEL_CHARGES = 4;
// A committed flag snapshots ownership and the boost. Purchasing mid-reveal
// never charges old rolls, and offline completions cannot fill the flywheel.
export function flywheelForDraw(progress) {
  if (!progress.owned.includes("flywheel")) return null;
  return progress.flywheelCharge === FLYWHEEL_CHARGES ? "boost" : "charge";
}
export function flywheelAfterSettlement(progress, id, source) {
  const count = progress.flywheelCharge ?? 0;
  return source !== "offline" &&
    progress.owned.includes("flywheel") &&
    progress.pendingRoll?.id === id &&
    progress.pendingRoll.flywheel === "charge"
    ? Math.min(FLYWHEEL_CHARGES, count + 1)
    : count;
}
