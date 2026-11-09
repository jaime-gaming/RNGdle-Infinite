const SAVE_DECISION_STATUSES = new Set([
  "needs-choice",
  "error",
  "offline",
  "maintenance",
]);

export function shouldShowLoadingScreen({
  gameDataReady,
  cloudStatus,
  cloudReady,
  hasAccount,
}) {
  if (!gameDataReady) return true;
  if (cloudStatus === "checking-auth" || cloudStatus === "loading") return true;
  return (
    Boolean(hasAccount) &&
    !cloudReady &&
    !SAVE_DECISION_STATUSES.has(cloudStatus)
  );
}
