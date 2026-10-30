// Cosmetic definitions and legacy receipts retained so retired event rewards
// remain owned, wearable, and readable in old saves. No event progression lives here.
export const RNGWEEN_ID = "rngween-2026";

export const RNGWEEN_AURAS = [
  {
    id: "jack-o-glow",
    kind: "aura",
    name: "Jack-o'-Glow",
    family: "legacy",
    eventOnly: true,
    swatch: ["#fb923c", "#9a3412"],
    icon: "pumpkin",
    description:
      "A permanent aura preserved from a retired seasonal collection.",
  },
  {
    id: "phantom-veil",
    kind: "aura",
    name: "Phantom Veil",
    family: "legacy",
    eventOnly: true,
    swatch: ["#c4b5fd", "#6d28d9"],
    icon: "phantom",
    description:
      "A permanent aura preserved from a retired seasonal collection.",
  },
  {
    id: "witchfire",
    kind: "aura",
    name: "Witchfire",
    family: "legacy",
    eventOnly: true,
    swatch: ["#a3e635", "#7c3aed"],
    icon: "witchfire",
    description:
      "A permanent aura preserved from a retired seasonal collection.",
  },
  {
    id: "blood-moon",
    kind: "aura",
    name: "Blood Moon",
    family: "legacy",
    eventOnly: true,
    swatch: ["#f87171", "#881337"],
    icon: "bloodmoon",
    description:
      "A permanent aura preserved from a retired seasonal collection.",
  },
];

export const RNGWEEN_WORLD_SKIN = {
  id: "hexbound",
  kind: "aura",
  name: "Hexbound",
  family: "legacy",
  eventOnly: true,
  worldOnly: true,
  swatch: ["#5eead4", "#8b5cf6"],
  icon: "hexbound",
  description: "A permanent appearance preserved from a retired game world.",
};

// This permanent cosmetic was added to the source game's Halloween finale.
// Keep its ownership and rendering data when importing saves made on newer main.
export const RNGWEEN_FINALE_SKIN = {
  id: "hollow-lantern",
  kind: "aura",
  name: "Hollow Lantern",
  family: "legacy",
  eventOnly: true,
  finaleOnly: true,
  swatch: ["#fdba74", "#7c2d12"],
  icon: "hollow",
  description: "A permanent aura preserved from the RNGween 2026 finale.",
};

export const RNGWEEN_COSMETICS = [
  ...RNGWEEN_AURAS,
  RNGWEEN_WORLD_SKIN,
  RNGWEEN_FINALE_SKIN,
];

export const RNGWEEN_FAMILY = {
  id: "legacy",
  label: "Legacy",
  blurb: "Permanent cosmetics preserved from retired seasonal content.",
  font: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  tracking: "0.02em",
  casing: "none",
  weight: 700,
  eventOnly: true,
};

// Old task slots are read only to restore a cosmetic already earned before
// RNGween ended. They are never part of the current task state.
const LEGACY_MISSIONS = [
  { id: "jack-o-glow", metric: "rolls", goal: 300 },
  { id: "phantom-veil", metric: "rare", goal: 60 },
  { id: "witchfire", metric: "banked", goal: 8000000 },
  { id: "blood-moon", metric: "taskClaims", goal: 21 },
];
const LEGACY_METRICS = [
  ...new Set(LEGACY_MISSIONS.map(({ metric }) => metric)),
];
const LEGACY_LIMITS = Object.fromEntries(
  LEGACY_METRICS.map((metric) => [
    metric,
    Math.max(
      ...LEGACY_MISSIONS.filter((mission) => mission.metric === metric).map(
        (mission) => mission.goal,
      ),
    ),
  ]),
);
const validAmount = (value) => Number.isSafeInteger(value) && value >= 0;

function emptyLegacyRngween() {
  return {
    id: RNGWEEN_ID,
    counts: Object.fromEntries(LEGACY_METRICS.map((metric) => [metric, 0])),
    earned: [],
  };
}

export function parseRngween(value) {
  if (value == null) return { rngween: emptyLegacyRngween(), repaired: false };
  const readable =
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.id === RNGWEEN_ID &&
    !!value.counts &&
    typeof value.counts === "object" &&
    !Array.isArray(value.counts) &&
    Array.isArray(value.earned);
  if (!readable) return { rngween: emptyLegacyRngween(), repaired: true };

  let repaired = false;
  const counts = Object.fromEntries(
    LEGACY_METRICS.map((metric) => {
      const stored = value.counts[metric];
      const count = validAmount(stored)
        ? Math.min(stored, LEGACY_LIMITS[metric])
        : 0;
      if (count !== stored) repaired = true;
      return [metric, count];
    }),
  );
  const earned = [];
  for (const id of value.earned) {
    const mission = LEGACY_MISSIONS.find((entry) => entry.id === id);
    if (
      !mission ||
      earned.includes(id) ||
      counts[mission.metric] < mission.goal
    ) {
      repaired = true;
      continue;
    }
    earned.push(id);
  }
  return { rngween: { id: RNGWEEN_ID, counts, earned }, repaired };
}

export function rngweenAuraIds(legacySlot) {
  return LEGACY_MISSIONS.filter((mission) =>
    legacySlot?.earned?.includes(mission.id),
  ).map((mission) => mission.id);
}
