// Presentation-only contributor animation plans. Rules and scoring remain outside
// the UI. Timing and palette values were measured against RNGdle Tools.
export const CHIP_PALETTES = {
  trash: { primary: "#C8A87C", secondary: "#F0E6D8", border: "#7C5A2E" },
  common: { primary: "#D1D5DB", secondary: "#F3F4F6", border: "#6B7280" },
  uncommon: { primary: "#6EE7B7", secondary: "#D1FAE5", border: "#059669" },
  rare: { primary: "#93C5FD", secondary: "#DBEAFE", border: "#2563EB" },
  epic: { primary: "#C4B5FD", secondary: "#EDE9FE", border: "#7C3AED" },
  anomaly: { primary: "#FDBA74", secondary: "#FFEDD5", border: "#EA580C" },
  mythic: { primary: "#F9A8D4", secondary: "#FCE7F3", border: "#DB2777" },
};
export const GROUP_PALETTES = [
  { background: "#93C5FD", border: "#2563EB" },
  { background: "#86EFAC", border: "#059669" },
  { background: "#FCD34D", border: "#D97706" },
  { background: "#F9A8D4", border: "#DB2777" },
];
const TWO_TONE_IDS = new Set([
  "TWO_PAIR",
  "THREE_PAIR",
  "CONTIGUOUS_TWO_PAIR",
  "CONTIGUOUS_THREE_PAIR",
  "FULL_HOUSE",
  "TRINITY",
  "ALTERNATOR",
]);

export function buildChipPlan(badge, number) {
  const digits = String(number).split("");
  const c = badge.contributors;
  const palette = CHIP_PALETTES[badge.rarity] || CHIP_PALETTES.common;
  const valid = (indices) =>
    [...new Set(indices)].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < digits.length,
    );
  let groups = [];
  if (c?.type === "groups") groups = c.groups.map(valid);
  else if (c?.type === "indices") groups = [valid(c.indices)];
  else if (c?.type === "range")
    groups = [digits.map((_, i) => i).filter((i) => i >= c.start && i < c.end)];
  else if (c?.type === "whole") groups = [digits.map((_, i) => i)];
  const active = [...new Set(groups.flat())];
  const chips = digits.map((digit, i) => ({
    digit,
    index: i,
    active: active.includes(i),
    order: active.indexOf(i),
    introAt: 0,
    background: palette.primary,
    border: palette.border,
  }));
  const twoTone = c?.type === "indices" && TWO_TONE_IDS.has(badge.id);
  if (twoTone) {
    const runs = new Map();
    for (const i of active) {
      const key = badge.id === "ALTERNATOR" ? Number(digits[i]) % 2 : digits[i];
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push(i);
    }
    groups = [...runs.values()];
  }
  if (c?.type === "groups" || twoTone) {
    let offset = 0;
    groups.forEach((indices, groupIndex) => {
      const color =
        c.type === "groups"
          ? GROUP_PALETTES[groupIndex % 4]
          : {
              background: groupIndex % 2 ? palette.secondary : palette.primary,
              border: palette.border,
            };
      indices.forEach((i, j) =>
        Object.assign(chips[i], color, { introAt: offset + j * 80 }),
      );
      offset += indices.length * 80 + 100;
    });
  } else if (["MOUNTAIN", "VALLEY"].includes(badge.id) && active.length) {
    const sorted = [...active].sort((a, b) => a - b);
    const center =
      c.type === "range"
        ? Math.floor((c.start + c.end - 1) / 2)
        : c.type === "whole"
          ? Math.floor(digits.length / 2)
          : sorted[Math.floor(sorted.length / 2)];
    active.forEach((i) => {
      chips[i].introAt = Math.abs(i - center) * 80;
    });
  } else
    active.forEach((i, order) => {
      chips[i].introAt = order * 80;
    });
  const introDuration = active.length
    ? Math.max(...active.map((i) => chips[i].introAt)) + 200
    : 0;
  const lastStagger = Math.max(0, active.length - 1) * 80;
  return {
    chips,
    introDuration,
    // Reset ALL contributors first; only then begin the next highlighted sweep.
    // This is shared by every chip, rather than each chip running its own clock.
    highlightAt: lastStagger + 500,
    loopDuration: lastStagger * 2 + 900 + 4000,
  };
}

export function chipLoopFrames(chip, plan, resting, highlighted) {
  const resetAt = chip.order * 80;
  const lightAt = plan.highlightAt + chip.order * 80;
  const key = (style, time, easing = "linear") => ({
    ...style,
    offset: time / plan.loopDuration,
    easing,
  });
  const cubic = "cubic-bezier(.33,1,.68,1)";
  return [
    key(highlighted, 0),
    key(highlighted, resetAt, cubic),
    key(resting, resetAt + 400),
    key(resting, lightAt, cubic),
    key(highlighted, lightAt + 400),
    key(highlighted, plan.loopDuration),
  ];
}
