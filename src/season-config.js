// ---------------------------------------------------------------------------
// Season theme configuration
// ---------------------------------------------------------------------------
// Reference palette for month-based/legacy theme helpers.
//
// Live Battle Pass seasons are explicitly recorded in `battle-pass.js`; do not
// infer or announce a successor from this palette. Edit a launched season's
// name, theme and accent in its record there.
//
// To rename a month, edit `name`. To change its mood, edit `theme`. To recolour
// it, edit `accent` (any 6-digit hex). Nothing else needs to change: the season
// number, rewards, missions and saves are all independent of this file.
//
// `rewardName` optionally renames that month's headline cosmetic on the track.
// Leave it out to use the default reward name.
//
// Set OVERRIDE below to force one theme onto every season regardless of month.
// ---------------------------------------------------------------------------

export const SEASON_THEME_OVERRIDE = null;

export const MONTH_THEMES = [
  {
    month: 1,
    name: "Quiet Frost",
    theme: "A clean white start. The year opens at zero.",
    accent: "#a5b4fc",
  },
  {
    month: 2,
    name: "Ember Circuit",
    theme: "Short days, warm wires. Keep the current moving.",
    accent: "#f87171",
  },
  {
    month: 3,
    name: "Glass Meadow",
    theme: "Thin ice over new green. Every roll leaves a mark.",
    accent: "#4ade80",
  },
  {
    month: 4,
    name: "Copper Rain",
    theme: "Warm metal, cold showers. Bank it while it falls.",
    accent: "#fb923c",
  },
  {
    month: 5,
    name: "Paper Lanterns",
    theme: "Long evenings, small lights. Collect them all.",
    accent: "#fbbf24",
  },
  {
    month: 6,
    name: "Salt Horizon",
    theme: "Flat light, far distance. Nothing but the next number.",
    accent: "#38bdf8",
  },
  {
    month: 7,
    name: "Tide Machine",
    theme: "Same wave, new shape. Ride the whole cycle.",
    accent: "#2dd4bf",
  },
  {
    month: 8,
    name: "Amber Static",
    theme: "Warm noise on every channel. Tune it in.",
    accent: "#facc15",
  },
  {
    month: 9,
    name: "Iron Bloom",
    theme: "Heavy ground, sudden colour. Dig for it.",
    accent: "#f472b6",
  },
  {
    month: 10,
    name: "Hollow Signal",
    theme: "The year turns strange. Roll with the lights on.",
    accent: "#c084fc",
  },
  {
    month: 11,
    name: "First Light",
    theme:
      "Gold at the horizon, warm light on a quiet field. Begin where the day breaks.",
    accent: "#fbbf24",
  },
  {
    month: 12,
    name: "Last Prism",
    theme: "The year closes in split colour. Finish the track.",
    accent: "#e879f9",
  },
];

const THEMES_BY_MONTH = new Map(
  MONTH_THEMES.map((entry) => [entry.month, entry]),
);
const FALLBACK = THEMES_BY_MONTH.get(11) ?? MONTH_THEMES[0];

export function monthTheme(month) {
  if (SEASON_THEME_OVERRIDE) return { ...FALLBACK, ...SEASON_THEME_OVERRIDE };
  const value = Number.isInteger(month) ? month : 0;
  const entry = THEMES_BY_MONTH.get(((value - 1 + 12) % 12) + 1);
  return entry ?? FALLBACK;
}

// Legacy lookup helper; the active pass does not generate seasons from it.
export function themeForStart(start) {
  const at = Number.isFinite(start) ? start : 0;
  return monthTheme(new Date(at).getUTCMonth() + 1);
}
