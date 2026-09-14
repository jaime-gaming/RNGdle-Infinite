// Independently implemented from the observable timing specification documented at
// https://github.com/CubityFirst/rngdle-ep-calculator/blob/main/site/README.md#roll-timings
// Kept separate from rendering and data so a future backend can supply any result.
import { BASE_ROLL_MS, BASE_COOLDOWN_MS } from "./shop-data.js";
export const COOLDOWN_MS = BASE_COOLDOWN_MS;
export const SCRAMBLE_MS = 100;
export const SETTLE_MS = 400;
export const PULSE_MS = 700;

export function buildReferenceTimeline(digitCount, badgeGroupCount) {
  const slots = Math.max(6, digitCount);
  const digitTimes = [2000];
  for (let i = 1; i < slots; i++) {
    digitTimes.push(
      digitTimes[i - 1] + 1000 + 1000 * ((i - 1) / (slots - 1)) ** 2,
    );
  }
  const collapse = digitTimes.at(-1);
  let time = collapse + 1000;
  const badgeTimes = [];
  for (let i = 0; i < badgeGroupCount; i++) {
    badgeTimes.push(time);
    if (i < badgeGroupCount - 1)
      time += 500 + 1000 * (i / (badgeGroupCount - 1)) ** 1.5;
  }
  const summary = time + 1500;
  const rarity = summary + 1000;
  const stats = rarity + 250;
  const sessionShow = stats + 1000;
  const sessionCount = sessionShow + 1500;
  const end = sessionCount + 2000;
  return {
    slots,
    digitTimes,
    collapse,
    badgeTimes,
    summary,
    rarity,
    stats,
    sessionShow,
    sessionCount,
    end,
  };
}

// Preserve the reference choreography, scaled to a fixed complete reveal.
export function buildRevealTimeline(
  digitCount,
  badgeGroupCount,
  duration = BASE_ROLL_MS,
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError("Invalid reveal duration");
  const reference = buildReferenceTimeline(digitCount, badgeGroupCount),
    scale = duration / reference.end;
  const timeline = Object.fromEntries(
    Object.entries(reference).map(([key, value]) => [
      key,
      key === "slots"
        ? value
        : Array.isArray(value)
          ? value.map((t) => t * scale)
          : value * scale,
    ]),
  );
  return {
    ...timeline,
    end: duration,
    scale,
    settleMS: SETTLE_MS * scale,
    pulseMS: PULSE_MS * scale,
  };
}

export const easeOutCubic = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

// Only wake React for a visual cue. Digit scrambling and numeric tweens run in
// their own components; a 40 Hz full-screen render loop is not needed.
export function revealCueTimes(timeline) {
  return [
    ...new Set([
      ...timeline.digitTimes,
      ...timeline.digitTimes.map((t) => t + (timeline.settleMS ?? SETTLE_MS)),
      timeline.collapse + (timeline.pulseMS ?? PULSE_MS),
      ...timeline.badgeTimes,
      timeline.summary,
      timeline.rarity,
      timeline.rarity + (timeline.pulseMS ?? PULSE_MS),
      timeline.stats,
      timeline.sessionShow,
      timeline.sessionCount,
      timeline.end,
    ]),
  ].sort((a, b) => a - b);
}

// Samples of the reference's back.out(s) easing for Web Animations. This
// preserves the real overshoot instead of approximating it with a CSS bounce.
export function rankPopFrames(overshoot, fromScale, opacity = false) {
  return Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const eased = 1 + (t - 1) ** 2 * ((overshoot + 1) * (t - 1) + overshoot);
    return {
      offset: t,
      transform: `scale(${fromScale + (1 - fromScale) * eased})`,
      ...(opacity ? { opacity: Math.min(1, Math.max(0, eased)) } : {}),
    };
  });
}
