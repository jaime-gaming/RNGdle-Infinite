// Backward compatibility for already-committed Reaper rolls from the retired
// 2026 finale. New rolls are never tagged or modified by this schedule.
const SHOW_START = Date.UTC(2026, 9, 31, 20);
const ACT_DURATION = 5 * 60 * 1000;
const ACTS = [
  { id: "omen", draws: 2, epMultiplier: 1 },
  { id: "reckoning", draws: 2, epMultiplier: 1 },
  { id: "bloodmoon", draws: 2, epMultiplier: 1.5 },
  { id: "soulstorm", draws: 3, epMultiplier: 1 },
  { id: "reaping", draws: 2, epMultiplier: 1.25 },
  { id: "eclipse", draws: 3, epMultiplier: 2 },
];
const SHOW_END = SHOW_START + ACTS.length * ACT_DURATION;

export function reaperAct(at) {
  if (!Number.isFinite(at) || at < SHOW_START || at >= SHOW_END) return null;
  const index = Math.floor((at - SHOW_START) / ACT_DURATION);
  const act = ACTS[index];
  return act
    ? { ...act, index, endsAt: SHOW_START + (index + 1) * ACT_DURATION }
    : null;
}
