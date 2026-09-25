import { SKILLS, SKILL_SLOTS } from "./skills.js";

// Permanent items. Timing upgrades never affect randomness or EP scoring.
export const BASE_ROLL_MS = 45000;
export const BASE_COOLDOWN_MS = 60000;
// Every reveal/cooldown value a committed roll may legally snapshot. Kept here so
// save validation and the catalogue can never drift apart.
export const ROLL_DURATIONS = [45000, 35000, 25000, 15000, 10000];
export const COOLDOWN_DURATIONS = [
  60000, 45000, 30000, 15000, 10000, 5000, 2000,
];
export const shopProducts = [
  {
    id: "quickwind-1",
    kind: "roll",
    name: "Quickwind I",
    price: 30000,
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
    price: 110000,
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
    price: 380000,
    value: 15000,
    from: 25000,
    requires: "quickwind-2",
    icon: "speed",
    description:
      "A brisk 15-second reveal, with the original effects kept in sequence.",
  },
  {
    id: "quickwind-4",
    kind: "roll",
    name: "Quickwind IV",
    price: 1200000,
    value: 10000,
    from: 15000,
    requires: "quickwind-3",
    icon: "speed",
    lateGame: true,
    description:
      "The fastest reveal: 10 seconds. Digits, badges and rank keep their order, just closer together.",
  },
  {
    id: "clockwork-1",
    kind: "cooldown",
    name: "Clockwork I",
    price: 50000,
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
    price: 180000,
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
    price: 620000,
    value: 15000,
    from: 30000,
    requires: "clockwork-2",
    icon: "clock",
    description:
      "Reduce the cooldown to 15 seconds. Further tuning unlocks after this level.",
  },
  {
    id: "clockwork-4",
    kind: "cooldown",
    name: "Clockwork IV",
    price: 1700000,
    value: 10000,
    from: 15000,
    requires: "clockwork-3",
    icon: "clock",
    lateGame: true,
    description:
      "Precision timing cuts the cooldown from 15 to 10 seconds. Your full reveal is unchanged.",
  },
  {
    id: "clockwork-5",
    kind: "cooldown",
    name: "Clockwork V",
    price: 3800000,
    value: 5000,
    from: 10000,
    requires: "clockwork-4",
    icon: "clock",
    lateGame: true,
    description:
      "A 5-second cooldown. No reveal skipping and no change to your odds.",
  },
  {
    id: "clockwork-6",
    kind: "cooldown",
    name: "Clockwork VI",
    price: 9000000,
    value: 2000,
    from: 5000,
    requires: "clockwork-5",
    icon: "clock",
    lateGame: true,
    description:
      "The final escapement: a 2-second cooldown between complete reveals. Scores and odds are untouched.",
  },
  {
    id: "flywheel",
    kind: "pace",
    charges: 4,
    name: "Flywheel",
    price: 450000,
    icon: "flywheel",
    description:
      "Complete four online rolls to charge it. Your next roll keeps its full reveal but has no cooldown. Local profiles save charge. Auto-Roll counts; offline rolls do not.",
  },
  {
    id: "flywheel-2",
    kind: "pace",
    name: "Flywheel II",
    price: 1500000,
    charges: 2,
    requires: "flywheel",
    icon: "flywheel",
    lateGame: true,
    description:
      "Two completed online rolls charge a third roll with no cooldown. Keeps earned charge, up to the new limit. Offline rolls do not count.",
  },
  {
    id: "flywheel-3",
    kind: "pace",
    name: "Flywheel III",
    price: 3600000,
    charges: 1,
    requires: "flywheel-2",
    icon: "flywheel",
    lateGame: true,
    description:
      "One completed online roll charges the next: every other roll has no cooldown. The full reveal and normal EP rules remain.",
  },
  {
    id: "starfall",
    kind: "aura",
    name: "Starfall",
    price: 40000,
    icon: "stars",
    description:
      "A living constellation: golden twinkles and a drifting comet sweep across your rarity box.",
  },
  {
    id: "aurora",
    kind: "aura",
    name: "Aurora Veil",
    price: 200000,
    icon: "aurora",
    description:
      "Flowing emerald and violet ribbons with a holographic sheen, layered over your original rarity colours.",
  },
  {
    id: "orbit",
    kind: "aura",
    name: "Orbital Halo",
    price: 900000,
    icon: "orbit",
    description:
      "A five-colour rainbow halo, twin orbital rings, and satellite lights frame every number.",
  },
  {
    id: "frostglass",
    kind: "aura",
    name: "Frostglass",
    price: 320000,
    icon: "ice",
    description:
      "Ice-blue facets and drifting crystal shards catch the light around your number.",
  },
  {
    id: "emberwake",
    kind: "aura",
    name: "Emberwake",
    price: 600000,
    icon: "fire",
    description:
      "Rising embers and a warm furnace glow, without changing the rarity beneath.",
  },
  {
    id: "eclipse",
    kind: "aura",
    name: "Eclipse Crown",
    price: 1500000,
    icon: "eclipse",
    description:
      "A dark corona edged in gold, orbiting crescent rings, and a trail of stardust. Your rarity stays visible.",
  },
  {
    id: "prism",
    kind: "aura",
    name: "Prismatic Bloom",
    price: 2300000,
    icon: "prism",
    description:
      "A luminous prism with rotating spectral petals and drifting light motes. A permanent finishing touch.",
  },
  {
    id: "tidepool",
    kind: "aura",
    name: "Tidepool",
    price: 100000,
    icon: "tide",
    description:
      "Slow turquoise swells and rising bubbles lap across your rarity box, like light through shallow water.",
  },
  {
    id: "verdant",
    kind: "aura",
    name: "Verdant Bloom",
    price: 450000,
    icon: "leaf",
    description:
      "Creeping vines frame the box while pollen motes drift upward in a soft green glow.",
  },
  {
    id: "circuit",
    kind: "aura",
    name: "Circuit Bloom",
    price: 1200000,
    icon: "circuit",
    description:
      "Etched traces pulse with cyan data packets that race the border and flash at each corner node.",
  },
  {
    id: "obsidian",
    kind: "aura",
    name: "Obsidian Edge",
    price: 1900000,
    icon: "obsidian",
    description:
      "A matte volcanic-glass frame with a razor-thin magenta edge light and slow drifting ash.",
  },
  {
    id: "singularity",
    kind: "aura",
    name: "Singularity",
    price: 3500000,
    icon: "singularity",
    description:
      "A collapsing accretion disc bends light around your number, with an event-horizon ring and infalling sparks.",
  },
  {
    id: "nebula",
    kind: "aura",
    name: "Nebula Drift",
    price: 520000,
    icon: "nebula",
    description:
      "Slow violet and indigo clouds drift behind the number while a scatter of newborn stars winks in and out.",
  },
  {
    id: "solstice",
    kind: "aura",
    name: "Solstice Ring",
    price: 780000,
    icon: "solstice",
    description:
      "A warm ring of midsummer light turns around the box, trailing a soft lens flare across the frame.",
  },
  {
    id: "lumen",
    kind: "aura",
    name: "Lumen Filigree",
    price: 1050000,
    icon: "lumen",
    description:
      "Hair-thin gold filigree draws itself into the corners, lit by a champagne glow that never washes out your rarity.",
  },
  {
    id: "glitch",
    kind: "aura",
    name: "Glitchwave",
    price: 1650000,
    icon: "glitch",
    description:
      "Scanlines tear sideways in red, green and blue, and the frame skews for a heartbeat before it snaps back.",
  },
  {
    id: "monolith",
    kind: "aura",
    name: "Monolith",
    price: 2700000,
    icon: "monolith",
    description:
      "A heavy carved slab with a single seam of cold light, humming steady while the space around it darkens.",
  },
  {
    id: "chrono",
    kind: "aura",
    name: "Chrono Dial",
    price: 4200000,
    icon: "chrono",
    description:
      "Sixty engraved ticks ring the number and a single hand sweeps them, marking a second that never quite ends.",
  },
  {
    id: "offline-roller",
    kind: "utility",
    name: "Offline Roller",
    price: 2600000,
    icon: "offline",
    requiresProfile: true,
    description:
      "One normal roll per full 10 minutes away, up to 24 hours (144 rolls). Rewards are calculated and saved when you return. Requires a local profile.",
  },
  {
    id: "offline-clock-1",
    kind: "offline",
    name: "Offline Clock I",
    price: 3600000,
    value: 450000,
    from: 600000,
    requires: "offline-roller",
    requiresProfile: true,
    icon: "offline",
    lateGame: true,
    description:
      "Earn one ordinary offline roll every 7½ minutes instead of 10. The roll cap is unchanged; it fills sooner.",
  },
  {
    id: "offline-clock-2",
    kind: "offline",
    name: "Offline Clock II",
    price: 5400000,
    value: 300000,
    from: 450000,
    requires: "offline-clock-1",
    requiresProfile: true,
    icon: "offline",
    lateGame: true,
    description:
      "Earn one ordinary offline roll every 5 minutes. Existing absences are settled before upgrading.",
  },
  {
    id: "offline-clock-3",
    kind: "offline",
    name: "Offline Clock III",
    price: 8500000,
    value: 180000,
    from: 300000,
    requires: "offline-clock-2",
    requiresProfile: true,
    icon: "offline",
    lateGame: true,
    description:
      "The final clock: one ordinary offline roll every 3 minutes. Absences are settled before the rate changes.",
  },
  {
    id: "offline-vault-1",
    kind: "offline-cap",
    name: "Offline Vault I",
    price: 6000000,
    value: 216,
    from: 144,
    requires: "offline-clock-1",
    requiresProfile: true,
    icon: "vault",
    lateGame: true,
    description:
      "Store up to 216 offline rolls per absence instead of 144. Rates, odds and EP are unchanged.",
  },
  {
    id: "offline-vault-2",
    kind: "offline-cap",
    name: "Offline Vault II",
    price: 11000000,
    value: 288,
    from: 216,
    requires: "offline-vault-1",
    requiresProfile: true,
    icon: "vault",
    lateGame: true,
    description:
      "The largest vault: 288 offline rolls per absence. Every one is an ordinary roll, settled on return.",
  },
  {
    id: "auto-roll",
    kind: "utility",
    name: "Auto-Roll",
    price: 1600000,
    icon: "auto",
    description:
      "Automatically start your next roll when it is ready. Toggle it on the Roll page; normal timings and odds still apply. Pauses away from the visible Roll page; off after reload.",
  },
  {
    id: "persistence-core",
    kind: "utility",
    name: "Persistence Core",
    price: 4800000,
    requires: "auto-roll",
    icon: "core",
    lateGame: true,
    description:
      "Auto-Roll remembers its switch after a reload and keeps running while this tab sits in the background. Timings, odds and single-credit settlement are unchanged.",
  },
  {
    id: "archive-lens",
    kind: "utility",
    name: "Archive Lens",
    price: 120000,
    icon: "lens",
    description:
      "Unlock number search and roll-tier filters across your entire activity archive. Your basic feed stays free.",
  },
  // Skills are charged one-shot effects; every one is defined in skills.js so
  // the shop, the save file and the roll engine read the same numbers.
  ...SKILLS.filter((skill) => skill.source === "shop").map((skill) => ({
    id: skill.id,
    kind: "skill",
    skillId: skill.id,
    name: skill.name,
    price: skill.price,
    icon: skill.icon,
    tint: skill.tint,
    charges: skill.charges,
    description: skill.description,
  })),
  ...SKILL_SLOTS.map((bay) => ({ ...bay })),
];
// The shop's six shelves. Each one is its own sub-page (/shop/skills and so
// on) and every product lives on exactly one shelf, so the hub buttons, the
// featured picks, a deep link and the back button can never disagree about
// where an item is sold. Companions keep their shelf too; it is owned by the
// companion component rather than by this catalogue.
export const SHOP_SECTIONS = [
  {
    id: "skills",
    label: "Skills",
    icon: "skill",
    blurb: "Charged effects and the rack that fires them.",
  },
  {
    id: "pace",
    label: "Pace",
    icon: "pace",
    blurb: "Shorter reveals and shorter cooldowns.",
  },
  {
    id: "companions",
    label: "Companions",
    icon: "companion",
    blurb: "Finders of EP, one worn at a time.",
  },
  {
    id: "auras",
    label: "Auras",
    icon: "aura",
    blurb: "Cosmetics for the rarity box, never odds.",
  },
  {
    id: "offline",
    label: "Offline",
    icon: "offline",
    blurb: "Earn while you are away, and store more.",
  },
  {
    id: "tools",
    label: "Tools",
    icon: "automation",
    blurb: "Automation and archive, same rules as always.",
  },
];

// Which kinds of product each shelf sells. The order inside a shelf is the
// catalogue order, so a shelf never reshuffles between visits.
const SHELF_KINDS = {
  skills: ["skill", "skill-slot", "pace"],
  pace: ["roll", "cooldown"],
  auras: ["aura"],
  offline: ["offline", "offline-cap"],
  tools: ["utility"],
};

export function shelfOfProduct(item) {
  if (!item) return "";
  const shelf = SHOP_SECTIONS.find((section) =>
    (SHELF_KINDS[section.id] ?? []).includes(item.kind),
  );
  // Every product kind belongs to a shelf; pace is the catalogue's home track.
  return shelf?.id ?? "pace";
}

export function productsOnShelf(id) {
  const kinds = SHELF_KINDS[id];
  return kinds ? shopProducts.filter((p) => kinds.includes(p.kind)) : [];
}

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

export function offlineSettings(owned = []) {
  return owned.reduce(
    (settings, id) => {
      const item = productById.get(id);
      if (item?.kind === "offline")
        settings.intervalMS = Math.min(settings.intervalMS, item.value);
      if (item?.kind === "offline-cap")
        settings.cap = Math.max(settings.cap, item.value);
      return settings;
    },
    { intervalMS: 600000, cap: 144 },
  );
}
