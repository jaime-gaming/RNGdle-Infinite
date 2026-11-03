export function cloudGameAccess({
  required = true,
  configured = false,
  authReady = false,
  userId = null,
  passwordRequired = false,
  localPlay = false,
  localProfileRequired = false,
} = {}) {
  if (userId && passwordRequired)
    return {
      allowed: false,
      message:
        "Add a password to your Google sign-in before playing online, or sign out to play locally.",
    };
  if (localPlay && !userId && localProfileRequired)
    return {
      allowed: false,
      message: "Choose a profile alias to save your progress on this device.",
    };
  if (localPlay && !userId) return { allowed: true, message: "" };
  if (!required) return { allowed: true, message: "" };
  if (!configured)
    return {
      allowed: false,
      message: "Online sign-in is unavailable here. You can continue locally.",
    };
  if (!authReady)
    return {
      allowed: false,
      message: "Checking your account…",
    };
  if (!userId)
    return {
      allowed: false,
      message: "Sign in for an online backup, or continue locally and choose a profile alias.",
    };
  return { allowed: true, message: "" };
}
