// Cloud accounts are required for play in configured builds. The test-mode
// exception is explicit in .env.test so browser tests can exercise local game
// flows without reaching the live Firebase project.
export function cloudGameAccess({
  required = true,
  configured = false,
  authReady = false,
  userId = null,
  passwordRequired = false,
} = {}) {
  if (!required) return { allowed: true, message: "" };
  if (!configured)
    return {
      allowed: false,
      message:
        "Cloud login is not configured in this build. Your browser save is safe, but cloud sign-in is required before play.",
    };
  if (passwordRequired)
    return {
      allowed: false,
      message:
        "Finish setting up your Google account by adding a password before playing.",
    };
  if (!authReady)
    return {
      allowed: false,
      message: "Checking your Cloud Account before play…",
    };
  if (!userId)
    return {
      allowed: false,
      message:
        "Sign in to your Cloud Account before playing. Your browser save is kept for migration.",
    };
  return { allowed: true, message: "" };
}
