import gameIndex from "./data/game-index.json" with { type: "json" };

export const SETTINGS_KEY = "rng-infinite-settings-v1";
export const NOTIFICATION_RANKS = Object.freeze(
  gameIndex.tiers.map(({ id }) => id),
);

export function rankMeetsMinimum(actualRank, minimumRank) {
  const actual = NOTIFICATION_RANKS.indexOf(actualRank);
  const minimum = NOTIFICATION_RANKS.indexOf(minimumRank);
  return actual >= 0 && minimum >= 0 && actual >= minimum;
}

export const defaultSettings = {
  notifyReady: false,
  notifySound: false,
  notifyRankEnabled: false,
  notifyRank: null,

  compactNumbers: false,
  showSkillBar: true,
  skillBarCollapsed: false,
  showGoalRecap: true,
  confirmPurchases: true,

  autoRollDefault: false,
};

const booleans = [
  "notifyReady",
  "notifySound",
  "notifyRankEnabled",
  "compactNumbers",
  "showSkillBar",
  "skillBarCollapsed",
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
  if (NOTIFICATION_RANKS.includes(value.notifyRank))
    next.notifyRank = value.notifyRank;

  if (
    typeof value.showFlywheelMeter === "boolean" &&
    value.showSkillBar == null
  )
    next.showSkillBar = value.showFlywheelMeter;
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
