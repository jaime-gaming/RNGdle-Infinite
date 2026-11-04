export function cloudGameAccess({
  required = true,
  configured = false,
  authReady = false,
  userId = null,
  passwordRequired = false,
  localPlay = false,
  localProfileRequired = false,
  maintenance = false,
  twoFactorPending = false,
} = {}) {
  // Two-factor: the device has not opened the emailed sign-in link yet, so the
  // online session is not established. Playing locally stays available.
  if (twoFactorPending && !localPlay) {
    return {
      allowed: false,
      message:
        "Confirm the sign-in link we emailed you to finish signing in on this device.",
    };
  }
  // While a scheduled maintenance is actually running, cloud features are
  // unavailable. When a cloud account is required this blocks play (online
  // progress cannot sync during maintenance); otherwise local play continues.
  if (maintenance) {
    return required
      ? {
          allowed: false,
          message:
            "RNGdle Infinite is under maintenance right now. Online features are unavailable until it ends — see the status page for details.",
        }
      : {
          allowed: true,
          message:
            "Online features are paused during maintenance; progress on this device keeps working.",
        };
  }
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
      message:
        "Sign in for an online backup, or continue locally and choose a profile alias.",
    };
  return { allowed: true, message: "" };
}
