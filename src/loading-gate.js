// The account states that need the player to act or read a message. A pending
// save never hides one of those behind the blank loading screen.
const SAVE_DECISION_STATUSES = new Set([
  "needs-choice",
  "error",
  "offline",
  "maintenance",
]);

// True while the page must show only the spinning circle: the scoring data is
// still loading, the account is resolving, or a signed-in profile has not
// finished syncing. Local progress is already read from storage; nothing here
// waits on a cloud write.
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
