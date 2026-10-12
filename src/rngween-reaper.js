import {
  rngweenCalendar,
  rngweenState,
  RNGWEEN_WORLD_SKIN,
  RNGWEEN_AURAS,
} from "./rngween.js";
import { worldMiniSummary, worldPhaseGoals } from "./rngween-world-badges.js";
import { RNGWEEN_WORLD_KEY } from "./rngween-limited.js";
import {
  rngweenValleyUnlocked,
  worldState,
  worldRevealMS,
  WORLD_ZONES,
  worldZoneById,
} from "./rngween-world-zones.js";

// CLEANUP Nov 4, 2026: remove seasonal dialogue, not Hexbound/owned auras.
// Dialogue reads receipts and verified UTC; it cannot grant a reward.
export const REAPER_TOPICS = [
  { id: "world", label: "What is RNGween World?" },
  { id: "fragments", label: "How do I get the key?" },
  { id: "speed", label: "Can I speed up reveals?" },
  { id: "reward", label: "What is Hexbound?" },
  { id: "trials", label: "What are the trials?" },
];
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
  if (calendar.limitedPhase === "unavailable")
    return {
      title: "Connection required",
      lines: [
        "The website's UTC date is unavailable. Reconnect before starting a roll or spending Pumpkoins.",
        "Your saved progress has not changed.",
      ],
    };
  if (calendar.limitedPhase === "upcoming")
    return {
      title: "Opens October 21",
      lines: [
        "RNGween World opens October 21, 2026 UTC, and closes at the end of November 3.",
        "Pumpkin Patch, Graveyard and Haunted House are free to enter. Their collections are separate; the two key fragments unlock the Valley.",
      ],
    };
  if (calendar.limitedPhase === "ended" || limited?.retired)
    return {
      title: "RNGween has ended",
      lines: [
        "The event closed after November 3 UTC. Pumpkoins, fragments, keys and speed upgrades have expired.",
        won
          ? "You unlocked Hexbound. It and your other collected Halloween auras stay in your collection."
          : "Your collected Halloween auras remain owned. Hexbound was only available by rolling 6666 in the Valley; it will not return or go on sale.",
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
    const aura = RNGWEEN_AURAS.find((item) => item.id === zone.auraId);
    const mission = event.missions.find((item) => item.auraId === zone.auraId);
    const stats = world.mini?.[zone.id];
    const summary = worldMiniSummary(zone.id, stats);
    const arrivals = {
      "pumpkin-patch":
        "Start here: one digit, 1–9. Find a few patterns, then head to the Graveyard.",
      graveyard:
        "Two digits here. Twins, steps, sixes, thirteen. Finish the three objectives for the Graveyard fragment.",
      "haunted-house":
        "Three digits in this house. Look for palindromes and triples. The three objectives earn its key fragment.",
      valley: key
        ? "Your key fits. Numbers do not repeat here. Watch for 6666 — that one earns Hexbound."
        : "You need a key for this arch. Forge one from both fragments, or buy the shortcut.",
    };
    const goals = worldPhaseGoals(zone.id, stats);
    return {
      title: `Phase ${zone.phase} · ${zone.name}`,
      phaseId: zone.id,
      lines: topic.startsWith("aura")
        ? [
            `${aura.name}? ${mission.title}: ${mission.detail}`,
            `Claim it in Tasks, October 25–31 UTC, for the aura and ${mission.pumpkoins} Pumpkoins. World points never advance that mission.`,
          ]
        : [
            arrivals[zone.id],
            `${aura.name} comes from its original aura trial in Tasks, not these rolls.`,
          ],
      objectives: goals,
      aura,
    };
  }
  if (topic === "unknown")
    return {
      title: "Your question",
      lines: [
        "Try the phases, aura trials, the key, or Hexbound. What do you want to know?",
      ],
    };
  if (topic === "world")
    return {
      title: "The four phases",
      lines: [
        "Four places: Pumpkin Patch, Graveyard, Haunted House and Valley of Horrors. The ranges grow from 1–9 to 1–9999.",
        "Both fragments forge your Valley key. It is never consumed. Find 6666 there for Hexbound.",
        "Collect the 39 event badges here. Aura trials stay in Tasks.",
      ],
    };
  if (topic === "fragments")
    return {
      title: "Collecting the fragments",
      lines: [
        "Graveyard asks for 5 different badges, 150 event points and Six Mark 3 times. Haunted House asks for 7 different badges, 1,000 event points and 10 Rare-or-better rolls.",
        "Common numbers take nothing away. Your objectives and fragments are saved.",
        `With one fragment from each, forge the key for free inside the World. Or buy a Valley Challenge Key for ${RNGWEEN_WORLD_KEY.pumpkoinPrice.toLocaleString("en-US")} Pumpkoins. Buying the key does not award an aura or complete a mission.`,
      ],
    };
  if (topic === "speed")
    return {
      title: "Reveal upgrades",
      lines: [
        `Your World reveal takes ${worldRevealMS(limited) / 1000} seconds. The shop upgrades bring it down to 8, 5, then 2 seconds.`,
        "Buy them in order from the World shop. They apply from the next roll, not to a result already revealing. The odds and ordinary Roll timers stay the same. Upgrades expire after November 3 UTC.",
      ],
    };
  if (topic === "reward")
    return {
      title: "Hexbound",
      lines: won
        ? [
            "You already unlocked Hexbound. Preview or equip it in Shop.",
            "It is a permanent aura and survives resets and the end of the event. It has no effect on odds or EP.",
          ]
        : [
            "Roll 6666 in Valley of Horrors to unlock Hexbound. It is a permanent aura and cannot be bought.",
            "You can preview it in Shop. A key unlocks the Valley, not Hexbound; you still have to roll 6666.",
          ],
    };
  if (topic === "trials")
    return {
      title: "Aura tasks",
      lines: [
        calendar.phase === "active"
          ? `You have completed ${event.complete} of ${event.total} aura trials. They run October 25–31 UTC. Online rolls and regular Daily/Weekly claims count.`
          : calendar.phase === "ended"
            ? "The aura trials ended after October 31 UTC. Missing event auras can be bought in Limited Shop November 1–3; a purchase does not complete a trial."
            : "Aura trials run October 25–31 UTC. Hourly commissions are available before and after that week. Neither is required to enter the World.",
        "Claim each completed trial for an aura and Pumpkoins: 600 coins across the four tasks. These tasks are separate from the World key fragments.",
      ],
      trials: event.missions,
    };
  return {
    title: seen ? "Welcome back" : "RNGween World",
    lines: [
      "Come in. The first three phases are open to everyone. Only the Valley needs a key.",
      key
        ? `Your Valley key is ready. You have revealed ${seen.toLocaleString("en-US")} ${seen === 1 ? "number" : "numbers"} without repeats.`
        : `You have ${Number(world.fragments.graveyard) + Number(world.fragments["haunted-house"])}/2 key fragments. Finish the Graveyard and House objectives to forge the key for free.`,
      !progress.profile
        ? "Create a profile to save your numbers, badges, fragments and rewards."
        : won
          ? "Hexbound is in your collection. You can still finish your event badge collections."
          : "Ask if you need a hand. Otherwise, pick a phase.",
    ],
  };
}

// Typed replies select a written topic; they never execute a purchase or roll.
export function reaperTopicForReply(text, phaseId = null) {
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const line = normalize(text);
  const aura = RNGWEEN_AURAS.find(
    (item) =>
      line.includes(normalize(item.name)) || line.includes(normalize(item.id)),
  );
  if (aura)
    return `aura:${WORLD_ZONES.find((zone) => zone.auraId === aura.id).id}`;
  const phase = WORLD_ZONES.find(
    (zone) =>
      line.includes(normalize(zone.name)) ||
      line.includes(normalize(zone.id)) ||
      line.includes(`phase ${zone.phase}`),
  );
  if (phase) return `phase:${phase.id}`;
  if (/6666|hexbound|skin|prize/.test(line)) return "reward";
  if (/aura|mission|trial|task/.test(line)) return phaseId ? "aura" : "trials";
  if (/fragment|key|forge/.test(line)) return "fragments";
  if (/speed|reveal|faster|slow|quick|time/.test(line)) return "speed";
  if (/world|phase|zone|enter|pass/.test(line)) return "world";
  return "unknown";
}
