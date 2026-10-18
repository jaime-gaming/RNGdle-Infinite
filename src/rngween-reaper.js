import {
  rngweenCalendar,
  rngweenState,
  RNGWEEN_WORLD_SKIN,
  RNGWEEN_AURAS,
} from "./rngween.js";
import { worldPhaseGoals } from "./rngween-world-badges.js";
import { RNGWEEN_WORLD_KEY } from "./rngween-limited.js";
import {
  rngweenValleyUnlocked,
  worldState,
  worldRevealMS,
  worldZoneById,
  worldFragmentCount,
  WORLD_FRAGMENT_ZONES,
} from "./rngween-world-zones.js";

// CLEANUP Nov 4, 2026: remove seasonal dialogue, not Hexbound/owned auras.
// Dialogue reads receipts and verified UTC; it cannot grant a reward.
export const REAPER_TOPICS = [
  { id: "world", label: "What is this place?" },
  { id: "fragments", label: "How do I get into the Valley?" },
  { id: "reward", label: "What is Hexbound?" },
  { id: "trials", label: "What about the auras?" },
];

// Short lines with a voice. The Reaper is dry, a little amused, never a manual.
export function reaperDialogue(
  progress,
  now,
  topic = "greeting",
  phaseId = null,
) {
  const calendar = rngweenCalendar(now);
  const event = rngweenState(progress.tasks, now);
  const limited = progress.rngweenLimited;
  const world = worldState(limited);
  const won =
    limited?.skinEarned || progress.owned?.includes(RNGWEEN_WORLD_SKIN.id);
  const key = rngweenValleyUnlocked(limited);
  const seen = limited?.drawn?.length ?? 0;
  const fragments = worldFragmentCount(world);
  const fragmentTotal = WORLD_FRAGMENT_ZONES.length;
  const price = RNGWEEN_WORLD_KEY.pumpkoinPrice.toLocaleString("en-US");
  if (calendar.limitedPhase === "unavailable")
    return {
      title: "No signal",
      lines: [
        "I can't tell what day it is, and I don't trust your clock. Reconnect and we'll talk.",
      ],
    };
  if (calendar.limitedPhase === "upcoming")
    return {
      title: "Not yet",
      lines: [
        "Patience. The gate opens on October 21. Come back then and bring something to roll.",
      ],
    };
  if (calendar.limitedPhase === "ended" || limited?.retired)
    return {
      title: "Closed",
      lines: [
        won
          ? "It's over. You left with Hexbound, which is more than most. Keep it."
          : "It's over. The auras you collected are yours. Hexbound stays buried; it was never for sale.",
      ],
    };
  const selectedPhase = topic.startsWith("phase:")
    ? topic.slice(6)
    : topic.startsWith("aura:")
      ? topic.slice(5)
      : phaseId;
  const zone = worldZoneById.get(selectedPhase);
  if (
    zone &&
    (topic.startsWith("phase:") ||
      topic === "greeting" ||
      topic.startsWith("aura"))
  ) {
    const aura = RNGWEEN_AURAS.find((item) => item.id === zone.auraId) ?? null;
    const mission = event.missions.find((item) => item.auraId === zone.auraId);
    const stats = world.mini?.[zone.id];
    const arrivals = {
      "pumpkin-patch":
        "The patch. One digit, nothing scary. Nine reveals, a few patterns, and the first fragment is yours.",
      graveyard:
        "Two digits among the stones. Twins, steps, sixes, thirteens. Clear my three objectives and a fragment is yours.",
      "haunted-house":
        "Three digits and a house that creaks. Palindromes, triples. Three objectives, and the last fragment.",
      "blood-moon-ridge":
        "The ridge stops at 666. Sixes, sevens, primes. Clear my three objectives and a fragment is yours. If you see 666 up here, that's the Eclipse, not Hexbound.",
      valley: key
        ? "Your key fits. Nothing repeats in the Valley. If you see 6666, don't blink."
        : "Not without a key. Forge it from all four fragments, or pay me and skip the work.",
    };
    return {
      title: `${zone.name}`,
      phaseId: zone.id,
      lines: topic.startsWith("aura")
        ? [
            aura && mission
              ? `${aura.name}? That isn't earned in here. ${mission.detail} Then claim it in Tasks, October 25–31.`
              : "Hexbound is the only aura the World gives. One number, 6666, in the Valley. Nothing else.",
          ]
        : [arrivals[zone.id]],
      objectives: worldPhaseGoals(zone.id, stats),
      aura,
    };
  }
  if (topic === "world")
    return {
      title: "The World",
      lines: [
        "Five haunted places, each bigger than the last: the Patch, the Graveyard, the Ridge, the Haunted House and the Valley. Sixty badges to find. Every roll in here pays a few Pumpkoins, more for the better badges. And it is always night in here, whatever your screen says outside.",
      ],
    };
  if (topic === "fragments")
    return {
      title: "The key",
      lines: [
        fragments === fragmentTotal
          ? "You have all four fragments. Forge the key inside and the Valley is yours."
          : `Four fragments make a key: one from each zone before the Valley. You hold ${fragments}. In a hurry? ${price} Pumpkoins and I'll hand you one.`,
      ],
    };
  if (topic === "speed")
    return {
      title: "Reveal speed",
      lines: [
        `A reveal here takes ${worldRevealMS(limited) / 1000} seconds. My shop sells patience in three sizes: 8, 5 and 2 seconds. The Pumpkoins your rolls pay cover it. It changes the wait, never the number.`,
      ],
    };
  if (topic === "reward")
    return {
      title: "Hexbound",
      lines: won
        ? [
            "You already wear it. Six sigils and a ghost. Permanent, and it suits you.",
          ]
        : [
            "Roll 6666 in the Valley and Hexbound is yours forever. It can't be bought, and it won't come back. Everyone asks. Few manage.",
          ],
    };
  if (topic === "trials")
    return {
      title: "The auras",
      lines: [
        calendar.phase === "active"
          ? `Four tasks in Tasks, four auras. You've finished ${event.complete} of ${event.total}. One week only; after October 31 I stop counting.`
          : calendar.phase === "ended"
            ? "The tasks are done. If you missed an aura, the Limited Shop sells them until November 3. Then never again."
            : "Four tasks, four auras, October 25 to 31. Until then my hourly commissions pay Pumpkoins. Nothing in there is needed to pass.",
      ],
      trials: event.missions,
    };
  return {
    title: seen ? "Back again" : "The gate",
    lines: [
      seen
        ? key
          ? `Back again. ${seen.toLocaleString("en-US")} numbers so far and none repeated. The Valley is waiting.`
          : `Back again. ${fragments} of ${fragmentTotal} fragments. The Valley will keep.`
        : key
          ? "Your Valley key is good. All five doors are open to you now, and nothing repeats in the Valley."
          : "Evening. The first four doors are open to anyone. The fifth needs a key, and I don't give those away.",
      !progress.profile
        ? "Make yourself a profile first, or I'll forget everything you do in here."
        : "Ask, if you must. Or just go in.",
    ],
  };
}
