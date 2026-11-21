import { useEffect, useState } from "react";
import { watchTabActivity } from "./tab-activity.js";

export function readOnlineStatus() {
  try {
    return globalThis.navigator?.onLine !== false;
  } catch {
    return true;
  }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(readOnlineStatus);
  useEffect(() => {
    const update = () => setOnline(readOnlineStatus());
    globalThis.addEventListener?.("online", update);
    globalThis.addEventListener?.("offline", update);
    globalThis.addEventListener?.("focus", update);
    globalThis.addEventListener?.("pageshow", update);
    update();
    return () => {
      globalThis.removeEventListener?.("online", update);
      globalThis.removeEventListener?.("offline", update);
      globalThis.removeEventListener?.("focus", update);
      globalThis.removeEventListener?.("pageshow", update);
    };
  }, []);
  return online;
}

export function useTabActive() {
  const [active, setActive] = useState(true);
  useEffect(() => watchTabActivity(setActive), []);
  return active;
}
