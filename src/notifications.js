import { NOTIFICATION_RANKS } from "./settings.js";

const NOTIFICATION_TAG = "rngdle-infinite-ready";
export const RANK_NOTIFICATION_TAG = "rngdle-infinite-rank";

function notificationsSupported() {
  return typeof Notification !== "undefined";
}

// Notification actions are only legal on a persistent notification shown by a
// ServiceWorkerRegistration. Passing `actions` to the Notification constructor
// throws, so the registration is captured once and reused.
let registration = null;

export function setNotificationRegistration(value) {
  registration =
    value && typeof value.showNotification === "function" ? value : null;
  return registration;
}

export function notificationRegistration() {
  return registration;
}

export const NOTIFICATION_ACTION_MESSAGE = "rngdle-notification-action";

export function rankNotificationActions({ autoRoll = false } = {}) {
  const actions = [];
  if (autoRoll)
    actions.push({ action: "stop-auto-roll", title: "Stop auto roll" });
  actions.push({ action: "dismiss", title: "Dismiss" });
  return actions;
}

export function notificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

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

export function showReadyNotification({
  title,
  body,
  onClick,
  tag = NOTIFICATION_TAG,
} = {}) {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return null;
  try {
    const notification = new Notification(title ?? "Your next roll is ready", {
      body: body ?? "RNGdle Infinite · the cooldown has finished.",
      tag,
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

export function showRankNotification(
  rank,
  { onClick, onStopAutoRoll, autoRoll } = {},
) {
  if (!NOTIFICATION_RANKS.includes(rank)) return null;
  if (!notificationsSupported() || Notification.permission !== "granted")
    return null;
  const label = rank[0].toUpperCase() + rank.slice(1);
  const title = `${label} rank reached`;
  const options = {
    body: "Return to RNGdle Infinite to review this roll.",
    tag: RANK_NOTIFICATION_TAG,
    renotify: true,
    silent: true,
  };
  const focus = () => {
    try {
      window.focus();
    } catch {}
    onClick?.();
  };

  // Preferred path: a persistent notification, which may carry actions. The
  // service worker forwards the chosen action back to the page.
  if (registration) {
    try {
      const shown = registration.showNotification(title, {
        ...options,
        actions: rankNotificationActions({ autoRoll }),
        data: { onClick: true, stopAutoRoll: !!autoRoll },
      });
      shown?.catch?.(() => {});
      stopAutoRollHandler = autoRoll ? (onStopAutoRoll ?? null) : null;
      clickHandler = focus;
      return { title, options, persistent: true, close() {} };
    } catch {
      // Fall through to a plain notification without actions.
    }
  }

  try {
    const notification = new Notification(title, options);
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

let stopAutoRollHandler = null;
let clickHandler = null;

// Called by the service-worker message bridge in main.jsx.
export function handleNotificationAction(action) {
  if (action === "stop-auto-roll") {
    const stop = stopAutoRollHandler;
    stopAutoRollHandler = null;
    stop?.();
    clickHandler?.();
    return true;
  }
  if (action === "dismiss") return true;
  if (action === "click" || action === "") {
    clickHandler?.();
    return true;
  }
  return false;
}

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
