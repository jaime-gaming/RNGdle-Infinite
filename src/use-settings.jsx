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

export function useMotionPreference() {
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    try {
      if (typeof matchMedia !== "function") return;
      const media = matchMedia("(prefers-reduced-motion: reduce)");
      const change = () => {
        try {
          setSystemReduced(media.matches);
        } catch {}
      };
      media.addEventListener("change", change);
      return () => {
        try {
          media.removeEventListener("change", change);
        } catch {}
      };
    } catch {
      return;
    }
  }, []);
  return systemReduced;
}

export function useFormatEP() {
  const { settings } = useSettings();
  return settings.compactNumbers ? formatEPCompact : formatEP;
}
