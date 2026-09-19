import { useEffect, useRef } from "react";
import { gameNow } from "./game-clock.js";
import { useSettings } from "./use-settings.jsx";
import {
  notificationPermission,
  playReadyChime,
  showReadyNotification,
} from "./notifications.js";

// Announces one finished cooldown, only while the tab is hidden, and only once
// per deadline. It never starts a roll and never alters the deadline itself.
export function useReadyAlert(cooldownUntil, { blocked = false } = {}) {
  const { settings } = useSettings();
  const announced = useRef(0);
  const enabled = settings.notifyReady || settings.notifySound;
  useEffect(() => {
    if (!enabled || blocked || !cooldownUntil) return;
    if (announced.current === cooldownUntil) return;
    const fire = () => {
      if (announced.current === cooldownUntil) return;
      if (document.visibilityState === "visible") return;
      announced.current = cooldownUntil;
      if (settings.notifyReady && notificationPermission() === "granted")
        showReadyNotification({
          body: "RNGdle Infinite · your cooldown has finished.",
        });
      if (settings.notifySound) playReadyChime();
    };
    const remaining = cooldownUntil - gameNow();
    if (remaining <= 0) {
      // Already elapsed: announce as soon as the page is hidden again.
      if (document.visibilityState !== "visible") {
        fire();
        return;
      }
      const hide = () => fire();
      document.addEventListener("visibilitychange", hide);
      return () => document.removeEventListener("visibilitychange", hide);
    }
    const timer = setTimeout(fire, remaining);
    return () => clearTimeout(timer);
  }, [
    cooldownUntil,
    enabled,
    blocked,
    settings.notifyReady,
    settings.notifySound,
  ]);
}
