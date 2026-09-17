// Permanent items. Timing upgrades never affect randomness or EP scoring.
export const BASE_ROLL_MS = 45000;
export const BASE_COOLDOWN_MS = 60000;
export const shopProducts = [
  {
    id: "quickwind-1",
    kind: "roll",
    name: "Quickwind I",
    price: 75000,
    value: 35000,
    from: 45000,
    icon: "speed",
    description:
      "Tighten the reveal from 45 seconds to 35. Every digit and badge still gets its moment.",
  },
  {
    id: "quickwind-2",
    kind: "roll",
    name: "Quickwind II",
    price: 300000,
    value: 25000,
    from: 35000,
    requires: "quickwind-1",
    icon: "speed",
    description:
      "Fine-tune the mechanism: your complete reveal takes 25 seconds.",
  },
  {
    id: "quickwind-3",
    kind: "roll",
    name: "Quickwind III",
    price: 1200000,
    value: 15000,
    from: 25000,
    requires: "quickwind-2",
    icon: "speed",
    description:
      "The fastest reveal: 15 seconds, with the original effects kept in sequence.",
  },
  {
    id: "clockwork-1",
    kind: "cooldown",
    name: "Clockwork I",
    price: 125000,
    value: 45000,
    from: 60000,
    icon: "clock",
    description:
      "A stronger spring brings your next roll around in 45 seconds.",
  },
  {
    id: "clockwork-2",
    kind: "cooldown",
    name: "Clockwork II",
    price: 650000,
    value: 30000,
    from: 45000,
    requires: "clockwork-1",
    icon: "clock",
    description:
      "Keep the clock turning. Reduce the wait between rolls to 30 seconds.",
  },
  {
    id: "clockwork-3",
    kind: "cooldown",
    name: "Clockwork III",
    price: 2500000,
    value: 15000,
    from: 30000,
    requires: "clockwork-2",
    icon: "clock",
    description:
      "The shortest cooldown: 15 seconds. A permanent upgrade, not a one-use skip.",
  },
  {
    id: "flywheel",
    kind: "pace",
    name: "Flywheel",
    price: 1000000,
    icon: "flywheel",
    description:
      "Complete four online rolls to charge it. Your next roll keeps its full reveal but has no cooldown. Local profiles save charge. Auto-Roll counts; offline rolls do not.",
  },
  {
    id: "starfall",
    kind: "aura",
    name: "Starfall",
    price: 50000,
    icon: "stars",
    description:
      "A living constellation: golden twinkles and a drifting comet sweep across your rarity box.",
  },
  {
    id: "aurora",
    kind: "aura",
    name: "Aurora Veil",
    price: 300000,
    icon: "aurora",
    description:
      "Flowing emerald and violet ribbons with a holographic sheen, layered over your original rarity colours.",
  },
  {
    id: "orbit",
    kind: "aura",
    name: "Orbital Halo",
    price: 1500000,
    icon: "orbit",
    description:
      "A five-colour rainbow halo, twin orbital rings, and satellite lights frame every number.",
  },
  {
    id: "frostglass",
    kind: "aura",
    name: "Frostglass",
    price: 450000,
    icon: "ice",
    description:
      "Ice-blue facets and drifting crystal shards catch the light around your number.",
  },
  {
    id: "emberwake",
    kind: "aura",
    name: "Emberwake",
    price: 900000,
    icon: "fire",
    description:
      "Rising embers and a warm furnace glow, without changing the rarity beneath.",
  },
  {
    id: "eclipse",
    kind: "aura",
    name: "Eclipse Crown",
    price: 2500000,
    icon: "eclipse",
    description:
      "A dark corona edged in gold, orbiting crescent rings, and a trail of stardust. Your rarity stays visible.",
  },
  {
    id: "prism",
    kind: "aura",
    name: "Prismatic Bloom",
    price: 4000000,
    icon: "prism",
    description:
      "A luminous prism with rotating spectral petals and drifting light motes. A permanent finishing touch.",
  },
  {
    id: "offline-roller",
    kind: "utility",
    name: "Offline Roller",
    price: 15000000,
    icon: "offline",
    requiresProfile: true,
    description:
      "One normal roll per full 10 minutes away, up to 24 hours (144 rolls). Rewards are calculated and saved when you return. Requires a local profile.",
  },
  {
    id: "auto-roll",
    kind: "utility",
    name: "Auto-Roll",
    price: 5000000,
    icon: "auto",
    description:
      "Automatically start your next roll when it is ready. Toggle it on the Roll page; normal timings and odds still apply. Pauses away from the visible Roll page; off after reload.",
  },
  {
    id: "archive-lens",
    kind: "utility",
    name: "Archive Lens",
    price: 150000,
    icon: "lens",
    description:
      "Unlock number search and roll-tier filters across your entire activity archive. Your basic feed stays free.",
  },
];
export function nextUpgrade(owned, kind) {
  const track = shopProducts.filter((p) => p.kind === kind);
  return track.find((p) => !owned.includes(p.id)) ?? track.at(-1);
}
export const productById = new Map(shopProducts.map((item) => [item.id, item]));

export function rollSettings(owned = []) {
  return owned.reduce(
    (settings, id) => {
      const item = productById.get(id);
      if (item?.kind === "roll")
        settings.rollMS = Math.min(settings.rollMS, item.value);
      if (item?.kind === "cooldown")
        settings.cooldownMS = Math.min(settings.cooldownMS, item.value);
      return settings;
    },
    { rollMS: BASE_ROLL_MS, cooldownMS: BASE_COOLDOWN_MS },
  );
}
export function formatDuration(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
