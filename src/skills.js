// Skills are charged, one-shot effects that fire on the next completed roll.
//
// Deliberate boundary: a skill may change how a number is *drawn* (extra
// uniform draws, a redraw floor) but every draw stays a plain, independent
// 0–1,000,000 crypto draw and every score still comes from the verified
// full-range index. Nothing here can invent EP, edit a number, or bias a roll
// towards a badge: a charged skill only ever picks between numbers the player
// genuinely rolled. Wallet effects multiply only the EP that reaches the
// wallet, exactly like companions.
//
// A skill is *armed* when its circle is full. The next draw snapshots every
// armed skill into the committed roll, so a reload, a second tab or a failed
// settlement can never re-fire or re-roll it.
export const SKILL_SLOTS_BASE = 2;
export const SKILL_MAX_DRAWS = 8;

// Shop slot upgrades. Kept here so save validation and the shop can never
// drift apart; the shop catalogue re-exports them as ordinary products.
export const SKILL_SLOTS = [
  {
    id: "skill-bay-1",
    kind: "skill-slot",
    slots: 3,
    from: 2,
    name: "Skill Bay I",
    price: 1000000,
    icon: "bay",
    description:
      "Widen the skill rack from two slots to three. Swapping skills stays free.",
  },
  {
    id: "skill-bay-2",
    kind: "skill-slot",
    slots: 4,
    from: 3,
    requires: "skill-bay-1",
    name: "Skill Bay II",
    price: 4000000,
    icon: "bay",
    description:
      "The final rack: four skill slots. Circles charge exactly as before.",
  },
];

// Effects, in plain terms:
//   wallet     multiplies the EP added to your wallet (never the scored EP)
//   waive      the roll it fires on has no cooldown after its full reveal
//   best-of N  draws N numbers and keeps the one that scores the most EP
//   floor F, T redraws until a draw scores at least F EP, at most T draws
//   pet-luck   multiplies the chance of a companion appearing on that roll
//   overdrive  that roll counts N times towards Flywheel and skill charge
export const SKILLS = [
  // ---- Bought in the shop -------------------------------------------------
  {
    id: "surge",
    source: "shop",
    name: "Surge",
    icon: "surge",
    tint: "gold",
    kind: "wallet",
    value: 2,
    charges: 6,
    price: 180000,
    description:
      "The next roll banks double EP. The number, its badges and its scored EP are untouched.",
  },
  {
    id: "trail",
    source: "shop",
    name: "Trail",
    icon: "trail",
    tint: "pink",
    kind: "pet-luck",
    value: 4,
    charges: 6,
    price: 320000,
    description:
      "A companion is four times as likely to turn up on the next roll. Companion luck is its own sample and never touches your number.",
  },
  {
    id: "bounce",
    source: "shop",
    name: "Bounce",
    icon: "bounce",
    tint: "cyan",
    kind: "waive",
    charges: 5,
    price: 500000,
    description:
      "The next roll has no cooldown after a complete reveal. It stacks with nothing: a roll can only be free once.",
  },
  {
    id: "twice",
    source: "shop",
    name: "Double Vision",
    icon: "twice",
    tint: "violet",
    kind: "best-of",
    attempts: 2,
    charges: 10,
    price: 900000,
    description:
      "The next roll is drawn twice and you keep whichever number scores more EP. Both draws are ordinary, independent rolls.",
  },
  {
    id: "bedrock",
    source: "shop",
    name: "Bedrock",
    icon: "bedrock",
    tint: "green",
    kind: "floor",
    floor: 25000,
    attempts: 4,
    charges: 8,
    price: 1600000,
    description:
      "The next roll is redrawn until it scores at least 25,000 EP, up to four draws. If none reaches it you keep the best of them.",
  },
  {
    id: "turbo",
    source: "shop",
    name: "Turbo",
    icon: "turbo",
    tint: "orange",
    kind: "overdrive",
    value: 3,
    charges: 10,
    price: 2600000,
    description:
      "The next roll counts triple towards Flywheel and towards every other skill's circle.",
  },
  {
    id: "quarry",
    source: "shop",
    name: "Big Game",
    icon: "quarry",
    tint: "gold",
    kind: "floor",
    floor: 100000,
    attempts: 5,
    charges: 18,
    price: 6000000,
    description:
      "The next roll is redrawn until it scores at least 100,000 EP, up to five draws. If none reaches it you keep the best of them.",
  },

  // ---- Companion signatures ----------------------------------------------
  {
    id: "pebble-steady",
    source: "pet",
    petId: "pebble",
    name: "Steady Step",
    icon: "bedrock",
    tint: "green",
    kind: "floor",
    floor: 8000,
    attempts: 3,
    charges: 6,
    description:
      "The next roll is redrawn until it scores at least 8,000 EP, up to three draws.",
  },
  {
    id: "moth-glow",
    source: "pet",
    petId: "moth",
    name: "Glow",
    icon: "surge",
    tint: "gold",
    kind: "wallet",
    value: 1.5,
    charges: 5,
    description: "The next roll banks 50% more EP.",
  },
  {
    id: "kit-spark",
    source: "pet",
    petId: "kit",
    name: "Static Spark",
    icon: "bounce",
    tint: "cyan",
    kind: "waive",
    charges: 6,
    description: "The next roll has no cooldown after its reveal.",
  },
  {
    id: "snail-shell",
    source: "pet",
    petId: "snail",
    name: "Shell",
    icon: "twice",
    tint: "violet",
    kind: "best-of",
    attempts: 2,
    charges: 8,
    description:
      "The next roll is drawn twice and you keep whichever scores more EP.",
  },
  {
    id: "jelly-drift",
    source: "pet",
    petId: "jelly",
    name: "Drift",
    icon: "trail",
    tint: "pink",
    kind: "pet-luck",
    value: 3,
    charges: 5,
    description:
      "A companion is three times as likely to turn up on the next roll.",
  },
  {
    id: "bee-swarm",
    source: "pet",
    petId: "bee",
    name: "Swarm",
    icon: "surge",
    tint: "gold",
    kind: "wallet",
    value: 1.75,
    charges: 7,
    description: "The next roll banks 75% more EP.",
  },
  {
    id: "corvid-ledger",
    source: "pet",
    petId: "corvid",
    name: "Ledger",
    icon: "turbo",
    tint: "orange",
    kind: "overdrive",
    value: 2,
    charges: 8,
    description:
      "The next roll counts twice towards Flywheel and every other skill's circle.",
  },
  {
    id: "owl-lore",
    source: "pet",
    petId: "owl",
    name: "Lore",
    icon: "bedrock",
    tint: "green",
    kind: "floor",
    floor: 20000,
    attempts: 4,
    charges: 9,
    description:
      "The next roll is redrawn until it scores at least 20,000 EP, up to four draws.",
  },
  {
    id: "turtle-long",
    source: "pet",
    petId: "turtle",
    name: "Long Game",
    icon: "quarry",
    tint: "green",
    kind: "floor",
    floor: 15000,
    attempts: 5,
    charges: 8,
    description:
      "The next roll is redrawn until it scores at least 15,000 EP, up to five draws.",
  },
  {
    id: "griffin-dive",
    source: "pet",
    petId: "griffin",
    name: "Dive",
    icon: "twice",
    tint: "violet",
    kind: "best-of",
    attempts: 3,
    charges: 11,
    description:
      "The next roll is drawn three times and you keep the highest-scoring number.",
  },
  {
    id: "unicorn-wish",
    source: "pet",
    petId: "unicorn",
    name: "Wish",
    icon: "surge",
    tint: "gold",
    kind: "wallet",
    value: 2.5,
    charges: 10,
    description: "The next roll banks two and a half times the EP.",
  },
  {
    id: "serpent-maw",
    source: "pet",
    petId: "serpent",
    name: "Maw",
    icon: "bedrock",
    tint: "green",
    kind: "floor",
    floor: 60000,
    attempts: 5,
    charges: 12,
    description:
      "The next roll is redrawn until it scores at least 60,000 EP, up to five draws.",
  },
  {
    id: "dragonet-pyre",
    source: "pet",
    petId: "dragonet",
    name: "Pyre",
    icon: "quarry",
    tint: "gold",
    kind: "floor",
    floor: 150000,
    attempts: 6,
    charges: 12,
    description:
      "The next roll is redrawn until it scores at least 150,000 EP, up to six draws. The strongest effect in the game.",
  },

  // ---- Rebirth ladder ----------------------------------------------------
  {
    id: "reborn-drive",
    source: "rebirth",
    rebirth: 1,
    name: "Reborn Drive",
    icon: "surge",
    tint: "gold",
    kind: "wallet",
    value: 1.5,
    charges: 6,
    description: "The next roll banks 50% more EP.",
  },
  {
    id: "reborn-tempo",
    source: "rebirth",
    rebirth: 2,
    name: "Reborn Tempo",
    icon: "bounce",
    tint: "cyan",
    kind: "waive",
    charges: 5,
    description: "The next roll has no cooldown after its reveal.",
  },
  {
    id: "reborn-depth",
    source: "rebirth",
    rebirth: 3,
    name: "Reborn Depth",
    icon: "twice",
    tint: "violet",
    kind: "best-of",
    attempts: 2,
    charges: 8,
    description:
      "The next roll is drawn twice and you keep whichever scores more EP.",
  },
  {
    id: "reborn-vault",
    source: "rebirth",
    rebirth: 4,
    name: "Reborn Vault",
    icon: "bedrock",
    tint: "green",
    kind: "floor",
    floor: 30000,
    attempts: 4,
    charges: 9,
    description:
      "The next roll is redrawn until it scores at least 30,000 EP, up to four draws.",
  },
  {
    id: "reborn-omen",
    source: "rebirth",
    rebirth: 5,
    name: "Reborn Omen",
    icon: "twice",
    tint: "violet",
    kind: "best-of",
    attempts: 3,
    charges: 12,
    description:
      "The next roll is drawn three times and you keep the highest-scoring number.",
  },
  {
    id: "reborn-paragon",
    source: "rebirth",
    rebirth: 6,
    name: "Reborn Paragon",
    icon: "quarry",
    tint: "gold",
    kind: "floor",
    floor: 75000,
    attempts: 6,
    charges: 14,
    description:
      "The next roll is redrawn until it scores at least 75,000 EP, up to six draws.",
  },
];

export const skillById = new Map(SKILLS.map((skill) => [skill.id, skill]));
export const shopSkills = SKILLS.filter((skill) => skill.source === "shop");
export const petSkills = SKILLS.filter((skill) => skill.source === "pet");
export const rebirthSkills = SKILLS.filter(
  (skill) => skill.source === "rebirth",
);
export const SKILL_IDS = SKILLS.map((skill) => skill.id);
const skillIds = new Set(SKILL_IDS);

export function skillForPet(petId) {
  return petSkills.find((skill) => skill.petId === petId) ?? null;
}

export function rebirthSkill(rebirths) {
  return rebirthSkills.find((skill) => skill.rebirth === rebirths) ?? null;
}

// How many skills a profile may keep equipped: two, plus one per bay owned.
export function skillSlots(owned = []) {
  return SKILL_SLOTS.filter((bay) => owned.includes(bay.id)).reduce(
    (slots, bay) => Math.max(slots, bay.slots),
    SKILL_SLOTS_BASE,
  );
}

// A shop or rebirth skill is unlocked for good; a companion skill exists only
// while that companion is the active one.
export function skillUnlocked(id, progress) {
  const skill = skillById.get(id);
  if (!skill) return false;
  if (skill.source === "pet") return progress.activePet === skill.petId;
  return (progress.skills ?? []).includes(id);
}

export function unlockedSkills(progress) {
  return SKILL_IDS.filter((id) => skillUnlocked(id, progress));
}

export function skillChargeOf(progress, id) {
  return Math.max(0, Math.trunc(progress.skillCharge?.[id] ?? 0));
}

export function skillArmed(progress, id) {
  const skill = skillById.get(id);
  return (
    !!skill &&
    skillUnlocked(id, progress) &&
    skillChargeOf(progress, id) >= skill.charges
  );
}

// Equipped, unlocked and full. These are the circles that fire on the next
// committed roll, in rack order.
export function armedSkills(progress) {
  return (progress.equippedSkills ?? []).filter((id) => skillArmed(progress, id));
}

export function armedSkillDefs(progress) {
  return armedSkills(progress).map((id) => skillById.get(id));
}

// ---- Draw plan ------------------------------------------------------------
// Every draw-modifying skill collapses into one rule: how many numbers to draw
// and what EP floor stops the redraws early. Combining two of them never
// invents a draw: it takes the larger attempt budget and the higher floor.
export function drawPlanFor(ids = []) {
  let attempts = 1,
    floor = 0;
  for (const id of ids) {
    const skill = skillById.get(id);
    if (!skill) continue;
    if (skill.kind === "best-of") attempts = Math.max(attempts, skill.attempts);
    if (skill.kind === "floor") {
      attempts = Math.max(attempts, skill.attempts);
      floor = Math.max(floor, skill.floor);
    }
  }
  return attempts > 1 ? { attempts, floor } : null;
}

export function skillWaivesCooldown(ids = []) {
  return ids.some((id) => skillById.get(id)?.kind === "waive");
}

export function skillPetLuck(ids = []) {
  return ids.reduce((luck, id) => {
    const skill = skillById.get(id);
    return skill?.kind === "pet-luck" ? luck * skill.value : luck;
  }, 1);
}

// Wallet-only multiplier, exactly like companions: the scored roll never moves.
export function skillWalletMultiplier(ids = []) {
  return ids.reduce((multiplier, id) => {
    const skill = skillById.get(id);
    return skill?.kind === "wallet" ? multiplier * skill.value : multiplier;
  }, 1);
}

// How many times the roll counts towards Flywheel and other skill circles.
export function skillChargeFactor(ids = []) {
  return ids.reduce((factor, id) => {
    const skill = skillById.get(id);
    return skill?.kind === "overdrive"
      ? Math.max(factor, skill.value)
      : factor;
  }, 1);
}

export function skillWalletMultiplierOf(progress) {
  return skillWalletMultiplier(progress.pendingRoll?.skills);
}

// ---- Charge bookkeeping ---------------------------------------------------
// Only a settled, committed, online roll moves a circle. The skills that fired
// empty; every other equipped skill gains one charge (or the overdrive factor).
export function chargeAfterSettlement(progress, id, source) {
  const current = progress.skillCharge ?? {};
  if (source === "offline" || progress.pendingRoll?.id !== id)
    return { ...current };
  const fired = new Set(progress.pendingRoll.skills ?? []);
  const gain = skillChargeFactor(progress.pendingRoll.skills);
  const next = { ...current };
  for (const skillId of progress.equippedSkills ?? []) {
    const skill = skillById.get(skillId);
    if (!skill) continue;
    next[skillId] = fired.has(skillId)
      ? 0
      : Math.min(skill.charges, (next[skillId] ?? 0) + gain);
  }
  return next;
}

// ---- Save validation ------------------------------------------------------
export function validSkillCharge(skillCharge) {
  if (skillCharge == null) return true;
  if (typeof skillCharge !== "object" || Array.isArray(skillCharge)) return false;
  return Object.entries(skillCharge).every(([id, value]) => {
    const skill = skillById.get(id);
    // An unknown key is not a value to trust or to punish: it is dropped on
    // parse, exactly like an unknown badge or companion id.
    if (!skill) return true;
    return Number.isSafeInteger(value) && value >= 0 && value <= skill.charges;
  });
}

export function parseSkillCharge(value) {
  const next = {};
  for (const [id, charge] of Object.entries(value ?? {}))
    if (skillIds.has(id) && Number.isSafeInteger(charge) && charge >= 0)
      next[id] = Math.min(charge, skillById.get(id).charges);
  return next;
}

export function parseEquippedSkills(value, progress) {
  const slots = skillSlots(progress.owned ?? []);
  return (Array.isArray(value) ? value : [])
    .filter(
      (id) =>
        typeof id === "string" &&
        skillIds.has(id) &&
        skillUnlocked(id, progress),
    )
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, slots);
}

export function parseUnlockedSkills(value, progress) {
  const unlocked = Array.isArray(value) ? value : [];
  const permanent = new Set(
    SKILLS.filter((skill) => skill.source !== "pet").map((skill) => skill.id),
  );
  return unlocked.filter(
    (id, index, list) =>
      permanent.has(id) &&
      list.indexOf(id) === index &&
      // A skill bought in the shop must also be owned, so a save cannot grant
      // a purchase it never paid for.
      (skillById.get(id).source !== "shop" ||
        (progress.owned ?? []).includes(id)),
  );
}

// ---- Presentation ---------------------------------------------------------
export function chargeLabel(progress, id) {
  const skill = skillById.get(id);
  if (!skill) return "";
  return `${skillChargeOf(progress, id)} / ${skill.charges}`;
}

export function skillState(progress, id) {
  if (!skillUnlocked(id, progress)) return "locked";
  return skillArmed(progress, id) ? "armed" : "charging";
}

export function skillEffectSummary(skill) {
  switch (skill.kind) {
    case "wallet":
      return `Next roll banks ×${skill.value} EP (wallet only)`;
    case "waive":
      return "Next roll has no cooldown";
    case "best-of":
      return `Next roll is drawn ${skill.attempts}× and keeps the best`;
    case "floor":
      return `Next roll is redrawn to at least ${skill.floor.toLocaleString("en-US")} EP (max ${skill.attempts})`;
    case "pet-luck":
      return `Next roll finds companions ${skill.value}× as often`;
    case "overdrive":
      return `Next roll counts ${skill.value}× towards charging`;
    default:
      return "";
  }
}

export function skillSourceLabel(skill, petName = "") {
  if (skill.source === "pet") return `${petName || "Companion"} signature`;
  if (skill.source === "rebirth") return `Rebirth ${skill.rebirth} reward`;
  return "Shop purchase";
}
