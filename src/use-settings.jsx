import React, { createContext, useContext, useEffect, useState } from "react";
import { defaultSettings, loadSettings, saveSettings } from "./settings.js";
import { formatEP, formatEPCompact } from "./roll-data.js";

const SettingsContext = createContext({
  settings: defaultSettings,
  update: () => {},
  reset: () => {},
  saveError: "",
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [saveError, setSaveError] = useState("");
  // Other tabs share one preference set; adopt their changes without a reload.
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== null && event.key !== "rng-infinite-settings-v1")
        return;
      setSettings(loadSettings());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const commit = (next) => {
    setSettings(next);
    setSaveError(
      saveSettings(next)
        ? ""
        : "Your settings could not be saved on this device. They will reset when you reload the game.",
    );
  };
  return (
    <SettingsContext.Provider
      value={{
        settings,
        update: (patch) => commit({ ...settings, ...patch }),
        reset: () => commit({ ...defaultSettings }),
        saveError,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

// All motion follows the system accessibility preference.
export function useMotionPreference() {
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return systemReduced;
}

// Formats EP for display according to the player's preference. Exact amounts are
// still used for every purchase, balance check and history entry.
export function useFormatEP() {
  const { settings } = useSettings();
  return settings.compactNumbers ? formatEPCompact : formatEP;
}
