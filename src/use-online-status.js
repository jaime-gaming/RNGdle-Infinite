import { useEffect, useState } from "react";

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
    update();
    return () => {
      globalThis.removeEventListener?.("online", update);
      globalThis.removeEventListener?.("offline", update);
    };
  }, []);
  return online;
}
