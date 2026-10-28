export function cloudGameAccess({
  required = true,
  configured = false,
  authReady = false,
  userId = null,
  passwordRequired = false,
  localPlay = false,
} = {}) {
  if (userId && passwordRequired)
    return {
      allowed: false,
      message:
        "Add a password to your Google sign-in before playing online, or sign out to play locally.",
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
      message: "Sign in for an online backup, or continue locally as a guest.",
    };
  return { allowed: true, message: "" };
}
