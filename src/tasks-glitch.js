export const TASKS_GLITCH_MIN_INTERVAL_MS = 5000;
export const TASKS_GLITCH_MAX_INTERVAL_MS = 20000;
export const TASKS_GLITCH_DURATION_MS = 420;

export function tasksGlitchDelay(sample = Math.random()) {
  const random = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;
  if (random === 1) return TASKS_GLITCH_MAX_INTERVAL_MS;
  return (
    TASKS_GLITCH_MIN_INTERVAL_MS +
    Math.floor(
      random *
        (TASKS_GLITCH_MAX_INTERVAL_MS - TASKS_GLITCH_MIN_INTERVAL_MS + 1),
    )
  );
}
