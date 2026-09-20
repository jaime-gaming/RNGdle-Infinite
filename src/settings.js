// Local, non-scoring preferences. Settings never touch randomness, EP, prices,
// cooldown deadlines, or saved progress: they only change presentation and alerts.
export const SETTINGS_KEY = "rng-infinite-settings-v1";

export const defaultSettings = {
  // Alerts
  notifyReady: false,
  notifySound: false,
  // Presentation
  reduceMotion: "system", // "system" | "on" | "off"
  compactNumbers: false,
  showSkillBar: true,
  showGoalRecap: true,
  confirmPurchases: true,
  // Gameplay conveniences (never a reward or odds change)
  autoRollDefault: false,
};

const booleans = [
  "notifyReady",
  "notifySound",
  "compactNumbers",
  "showSkillBar",
  "showGoalRecap",
  "confirmPurchases",
  "autoRollDefault",
];

export function parseSettings(raw) {
  if (raw == null) return { ...defaultSettings };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...defaultSettings };
  }
  if (!value || typeof value !== "object") return { ...defaultSettings };
  const next = { ...defaultSettings };
  for (const key of booleans)
    if (typeof value[key] === "boolean") next[key] = value[key];
  // v0.2 saves stored the Flywheel meter toggle under its old name; the rack
  // that replaced it keeps the same preference.
  if (typeof value.showFlywheelMeter === "boolean" && value.showSkillBar == null)
    next.showSkillBar = value.showFlywheelMeter;
  if (["system", "on", "off"].includes(value.reduceMotion))
    next.reduceMotion = value.reduceMotion;
  return next;
}

export function loadSettings() {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
