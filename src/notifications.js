// Desktop notifications are a convenience only. They never roll, never credit EP,
// and never change a cooldown deadline: they only announce one that has passed.
export const NOTIFICATION_TAG = "rngdle-infinite-ready";

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export function notificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

// Safari resolves the callback form only; wrap both shapes in one promise.
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    const result = await new Promise((resolve) => {
      const returned = Notification.requestPermission(resolve);
      if (returned?.then) returned.then(resolve, () => resolve("denied"));
    });
    return result ?? Notification.permission;
  } catch {
    return "denied";
  }
}

export function showReadyNotification({ title, body, onClick } = {}) {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return null;
  try {
    // A shared tag replaces any earlier alert instead of stacking one per tab.
    const notification = new Notification(title ?? "Your next roll is ready", {
      body: body ?? "RNGdle Infinite · the cooldown has finished.",
      tag: NOTIFICATION_TAG,
      renotify: true,
      silent: true,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {}
      notification.close();
      onClick?.();
    };
    return notification;
  } catch {
    return null;
  }
}

// A short, quiet two-tone chime. No asset download, and no audio unless the
// player has already interacted with the page.
export function playReadyChime() {
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return false;
  try {
    const context = new Ctor();
    if (context.state === "suspended") context.resume?.();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    gain.connect(context.destination);
    for (const [frequency, at] of [
      [660, 0],
      [990, 0.18],
    ]) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + at);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + at);
      oscillator.stop(context.currentTime + at + 0.3);
    }
    setTimeout(() => context.close?.(), 900);
    return true;
  } catch {
    return false;
  }
}
