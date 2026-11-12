// ---------------------------------------------------------------------------
// Season theme configuration
// ---------------------------------------------------------------------------
// This is the one file to edit to change how a season looks and reads.
//
// A season is 28 days, so it does not line up with a calendar month. Each season
// is themed after the month it STARTS in: a season beginning in December wears
// the December theme, even though it runs into January.
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
    theme: "A clean signal at dawn. The pass opens here.",
    accent: "#7dd3fc",
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

// The theme for a season is chosen by the UTC month its window opens in.
export function themeForStart(start) {
  const at = Number.isFinite(start) ? start : 0;
  return monthTheme(new Date(at).getUTCMonth() + 1);
}
