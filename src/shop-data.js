// Permanent items. Timing upgrades never affect randomness or EP scoring.
export const BASE_ROLL_MS = 45000;
export const BASE_COOLDOWN_MS = 60000;
export const shopProducts = [
  {
    id: "quickwind-1",
    kind: "roll",
    name: "Quickwind I",
    price: 125000,
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
    price: 500000,
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
    price: 2000000,
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
    price: 250000,
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
    price: 1000000,
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
    price: 4000000,
    value: 15000,
    from: 30000,
    requires: "clockwork-2",
    icon: "clock",
    description:
      "The shortest cooldown: 15 seconds. A permanent upgrade, not a one-use skip.",
  },
  {
    id: "starfall",
    kind: "aura",
    name: "Starfall",
    price: 125000,
    icon: "stars",
    description:
      "A living constellation: golden twinkles and a drifting comet sweep across your rarity box.",
  },
  {
    id: "aurora",
    kind: "aura",
    name: "Aurora Veil",
    price: 500000,
    icon: "aurora",
    description:
      "Flowing emerald and violet ribbons with a holographic sheen, layered over your original rarity colours.",
  },
  {
    id: "orbit",
    kind: "aura",
    name: "Orbital Halo",
    price: 2500000,
    icon: "orbit",
    description:
      "A five-colour rainbow halo, twin orbital rings, and satellite lights frame every number.",
  },
  {
    id: "frostglass",
    kind: "aura",
    name: "Frostglass",
    price: 750000,
    icon: "ice",
    description:
      "Ice-blue facets and drifting crystal shards catch the light around your number.",
  },
  {
    id: "emberwake",
    kind: "aura",
    name: "Emberwake",
    price: 1500000,
    icon: "fire",
    description:
      "Rising embers and a warm furnace glow, without changing the rarity beneath.",
  },
  {
    id: "archive-lens",
    kind: "utility",
    name: "Archive Lens",
    price: 350000,
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
