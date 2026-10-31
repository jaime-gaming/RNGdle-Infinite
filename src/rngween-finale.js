// A single scheduled show, synchronized by the verified website clock. This is
// a scripted local experience, not a multiplayer admin or a recurring buff.
export const REAPER_SHOW_START = Date.UTC(2026, 9, 31, 20);
export const REAPER_ACT_MS = 5 * 60 * 1000;
export const REAPER_SHOW_END = REAPER_SHOW_START + 6 * REAPER_ACT_MS;

export const REAPER_CHAPTERS = [
  {
    id: "omen",
    name: "The Gate Opens",
    short: "Gate",
    epMultiplier: 1,
    weather: "THE VEIL IS BREAKING",
    lines: [
      "At last. The clock has struck, and your world belongs to me.",
      "Do you hear it? Every number you have ever rolled is whispering your name.",
      "I did not come to watch. I came to change your fate.",
    ],
    effect: "Two fates appear. The highest EP is kept.",
    draws: 2,
  },
  {
    id: "reckoning",
    name: "The First Decree",
    short: "Fog",
    epMultiplier: 1,
    weather: "CURSED FOG",
    lines: [
      "Let the fog in. One fate is no longer enough for you.",
      "Two futures, one soul. I will take the stronger one.",
      "Keep rolling. Even the darkness can be generous... for a price.",
    ],
    effect: "The fog brings two fates. The highest EP is kept.",
    draws: 2,
  },
  {
    id: "bloodmoon",
    name: "The Blood Moon",
    short: "Moon",
    epMultiplier: 1.5,
    weather: "BLOOD MOON RISING",
    lines: [
      "Look up. I have painted the moon with the hopes of the unlucky.",
      "Under my blood moon, the strongest fate returns with half again its worth.",
      "The sky is red, little mortal. Your luck is not safe from me.",
    ],
    effect: "Best of two fates, plus ×1.5 banked EP.",
    draws: 2,
  },
  {
    id: "soulstorm",
    name: "Soulstorm",
    short: "Storm",
    epMultiplier: 1,
    weather: "THE SOULSTORM IS HERE",
    lines: [
      "I release the storm. Three fates shall fight for your next number.",
      "Listen to them collide. I spare only the one worth the most.",
      "This is my world now. Roll, and let the storm decide.",
    ],
    effect: "Three fates clash. The highest EP is kept.",
    draws: 3,
  },
  {
    id: "reaping",
    name: "The Harvest",
    short: "Harvest",
    epMultiplier: 1.25,
    weather: "THE REAPING BEGINS",
    lines: [
      "The storm fades. Now I count what it has left behind.",
      "Two paths remain beneath my scythe. I will leave a little more for the survivor.",
      "The end is close. Do not look away from the sky.",
    ],
    effect: "Best of two fates, plus ×1.25 banked EP.",
    draws: 2,
  },
  {
    id: "eclipse",
    name: "The Final Eclipse",
    short: "Eclipse",
    epMultiplier: 2,
    weather: "TOTAL ECLIPSE",
    lines: [
      "The sun is gone. Three fates enter; one survives. My lantern is yours.",
      "Take what fortune you can. I double what you bank until the eclipse passes.",
      "Our time is ending, mortal. Remember who made the darkness answer you.",
    ],
    effect: "Best of three fates, plus ×2 banked EP.",
    draws: 3,
  },
];

export function reaperAct(at) {
  if (!Number.isFinite(at) || at < REAPER_SHOW_START || at >= REAPER_SHOW_END)
    return null;
  const elapsed = at - REAPER_SHOW_START;
  const index = Math.floor(elapsed / REAPER_ACT_MS);
  const act = REAPER_CHAPTERS[index];
  const lineIndex = Math.min(
    act.lines.length - 1,
    Math.floor((elapsed % REAPER_ACT_MS) / (REAPER_ACT_MS / act.lines.length)),
  );
  return {
    ...act,
    line: act.lines[lineIndex],
    index,
    total: REAPER_CHAPTERS.length,
    endsAt: REAPER_SHOW_START + (index + 1) * REAPER_ACT_MS,
    progress: elapsed / (REAPER_SHOW_END - REAPER_SHOW_START),
  };
}
