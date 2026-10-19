// One-off, fixed UTC dates: changing a device timezone never moves a boundary.
// CLEANUP from Nov 1, 2026 00:00 UTC: remove RngweenTasks, its Tasks mount,
// claim-rngween-aura wiring (auras + Pumpkoins). Keep mission tallies and earned receipts until Nov 4,
// then keep earned receipts and the aura registry, owned
// collection, aura styles and receipt parsing/restoration for collected rewards.
// CLEANUP from Nov 4, 2026 00:00 UTC: remove RngweenSeason, seasonal palette/
// decoration CSS and favicon-halloween.svg. Keep the verified calendar until
// the limited shop/world close on Nov 4, 2026 00:00 UTC.
export const RNGWEEN_YEAR = 2026;
export const RNGWEEN_ID = "rngween-2026";

export function rngweenCalendar(at) {
  const limitedStartsAt = Date.UTC(RNGWEEN_YEAR, 9, 21);
  const decoratesAt = limitedStartsAt;
  const startsAt = Date.UTC(RNGWEEN_YEAR, 9, 25);
  const endsAt = Date.UTC(RNGWEEN_YEAR, 10, 1);
  const limitedEndsAt = Date.UTC(RNGWEEN_YEAR, 10, 4);
  const decorationsEndAt = limitedEndsAt;
  const verified = Number.isFinite(at);
  return {
    decoratesAt,
    limitedStartsAt,
    startsAt,
    endsAt,
    decorationsEndAt,
    limitedEndsAt,
    auraSalesAt: endsAt,
    aurasBuyable: verified && at >= endsAt && at < limitedEndsAt,
    limitedPhase: !verified
      ? "unavailable"
      : at < limitedStartsAt
        ? "upcoming"
        : at < limitedEndsAt
          ? "active"
          : "ended",
    decorated: verified && at >= decoratesAt && at < decorationsEndAt,
    // Four rotating commissions run all event windows, including during the
    // October 25–31 aura trials: players can farm Pumpkoins alongside auras.
    // A new phase starts a fresh board; the verified UTC clock owns expiry.
    hourlyPhase: !verified
      ? "unavailable"
      : at >= limitedStartsAt && at < limitedEndsAt
        ? "active"
        : "inactive",
    hourlyWindow: !verified
      ? null
      : at >= limitedStartsAt && at < startsAt
        ? "opening"
        : at >= endsAt && at < limitedEndsAt
          ? "farewell"
          : null,
    hourlyEndsAt: !verified
      ? null
      : at >= limitedStartsAt && at < startsAt
        ? startsAt
        : at >= endsAt && at < limitedEndsAt
          ? limitedEndsAt
          : null,
    phase: !verified
      ? "unavailable"
      : at < startsAt
        ? "upcoming"
        : at < endsAt
          ? "active"
          : "ended",
  };
}

// Permanent cosmetics, absent from the ordinary EP catalogue. The four task
// auras also have a costly Pumpkoin fallback in the one-off limited shop.
export const RNGWEEN_AURAS = [
  {
    id: "jack-o-glow",
    kind: "aura",
    name: "Jack-o'-Glow",
    family: "rngween",
    eventOnly: true,
    swatch: ["#fb923c", "#9a3412"],
    icon: "pumpkin",
    description:
      "Pumpkin frame with orange embers. Collect from RNGween tasks or buy November 1–3. Permanent; only available in this event.",
  },
  {
    id: "phantom-veil",
    kind: "aura",
    name: "Phantom Veil",
    family: "rngween",
    eventOnly: true,
    swatch: ["#c4b5fd", "#6d28d9"],
    icon: "phantom",
    description:
      "Ghost frame with violet mist. Collect from RNGween tasks or buy November 1–3. Permanent; only available in this event.",
  },
  {
    id: "witchfire",
    kind: "aura",
    name: "Witchfire",
    family: "rngween",
    eventOnly: true,
    swatch: ["#a3e635", "#7c3aed"],
    icon: "witchfire",
    description:
      "Green flames and a rotating violet seal. Collect from RNGween tasks or buy November 1–3. Permanent; only available in this event.",
  },
  {
    id: "blood-moon",
    kind: "aura",
    name: "Blood Moon",
    family: "rngween",
    eventOnly: true,
    swatch: ["#f87171", "#881337"],
    icon: "bloodmoon",
    description:
      "Red moon with orbiting bats. Collect from RNGween tasks or buy November 1–3. Permanent; only available in this event.",
  },
];

// Keep this registry/art and the earned receipt after all seasonal UI retires.
export const RNGWEEN_WORLD_SKIN = {
  id: "hexbound",
  kind: "aura",
  name: "Hexbound",
  family: "rngween",
  eventOnly: true,
  worldOnly: true,
  swatch: ["#5eead4", "#8b5cf6"],
  icon: "hexbound",
  description:
    "Green-violet frame with a ghost and six sigils. Roll 6666 in Valley of Horrors to unlock. Permanent; never sold or returning.",
};
export const RNGWEEN_COSMETICS = [...RNGWEEN_AURAS, RNGWEEN_WORLD_SKIN];

export const RNGWEEN_FAMILY = {
  id: "rngween",
  label: "RNGween 2026",
  blurb:
    "RNGween 2026 auras. Owned auras stay after the event; unowned ones will not return.",
  font: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  tracking: "0.02em",
  casing: "none",
  weight: 700,
  eventOnly: true,
};

// Every aura mission has two halves: a Roll-page count and a World step, the
// key fragment of the zone that matches the aura. Both must be done to collect.
export const RNGWEEN_MISSIONS = [
  {
    id: "jack-o-glow",
    auraId: "jack-o-glow",
    pumpkoins: 100,
    title: "Light the lantern",
    detail: "Complete 300 online rolls during RNGween.",
    metric: "rolls",
    goal: 300,
    zone: "pumpkin-patch",
    zoneName: "Pumpkin Patch",
  },
  {
    id: "phantom-veil",
    auraId: "phantom-veil",
    pumpkoins: 150,
    title: "Meet the spirits",
    detail: "Roll 60 Rare or better during RNGween. Higher tiers count too.",
    metric: "rare",
    goal: 60,
    zone: "graveyard",
    zoneName: "Graveyard",
  },
  {
    id: "witchfire",
    auraId: "witchfire",
    pumpkoins: 200,
    title: "Master the witchfire",
    detail: "Bank 8,000,000 EP from online rolls during RNGween.",
    metric: "banked",
    goal: 8000000,
    zone: "haunted-house",
    zoneName: "Haunted House",
  },
  {
    id: "blood-moon",
    auraId: "blood-moon",
    pumpkoins: 150,
    title: "Trick or task",
    detail:
      "Claim 21 Daily or Weekly tasks during RNGween. List bonuses do not count.",
    metric: "taskClaims",
    goal: 21,
    zone: "blood-moon-ridge",
    zoneName: "Blood Moon Ridge",
  },
];
export function missionWorldDetail(mission) {
  return `Then earn the ${mission.zoneName} key fragment in RNGween World.`;
}
// The World half of a mission, read from the save's World slot. Already
// collected auras never need it again, so older saves keep everything.
export function missionWorldDone(mission, limited) {
  return limited?.world?.fragments?.[mission.zone] === true;
}

const METRICS = [...new Set(RNGWEEN_MISSIONS.map((mission) => mission.metric))];
const LIMITS = Object.fromEntries(
  METRICS.map((metric) => [
    metric,
    Math.max(
      ...RNGWEEN_MISSIONS.filter((mission) => mission.metric === metric).map(
        (mission) => mission.goal,
      ),
    ),
  ]),
);
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;

export function emptyRngween() {
  return {
    id: RNGWEEN_ID,
    counts: Object.fromEntries(METRICS.map((metric) => [metric, 0])),
    earned: [],
  };
}

// Old events and foreign IDs never become progress towards these rewards.
export function parseRngween(value) {
  if (value === undefined) return { rngween: emptyRngween(), repaired: false };
  const readable =
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.id === RNGWEEN_ID &&
    !!value.counts &&
    typeof value.counts === "object" &&
    !Array.isArray(value.counts) &&
    Array.isArray(value.earned);
  if (!readable) return { rngween: emptyRngween(), repaired: true };
  let repaired = false;
  const counts = Object.fromEntries(
    METRICS.map((metric) => {
      const amount = value.counts[metric];
      const count = validAmount(amount) ? Math.min(amount, LIMITS[metric]) : 0;
      if (count !== amount) repaired = true;
      return [metric, count];
    }),
  );
  const earned = [];
  for (const id of value.earned) {
    const mission = RNGWEEN_MISSIONS.find((entry) => entry.id === id);
    if (
      !mission ||
      earned.includes(id) ||
      counts[mission.metric] < mission.goal
    ) {
      repaired = true;
      continue;
    }
    earned.push(id);
  }
  return { rngween: { id: RNGWEEN_ID, counts, earned }, repaired };
}

function slot(tasks) {
  return parseRngween(tasks?.rngween).rngween;
}

// The caller supplies the same verified online tally as regular tasks. Offline
// rolls bypass it; ordinary task claims supply only { taskClaims: 1 }.
export function recordRngweenTally(tasks, tally, at) {
  const rngween = slot(tasks);
  if (rngweenCalendar(at).phase !== "active") return rngween;
  const counts = { ...rngween.counts };
  for (const metric of METRICS) {
    const amount = tally?.[metric] ?? 0;
    if (validAmount(amount))
      counts[metric] = Math.min(LIMITS[metric], counts[metric] + amount);
  }
  return { ...rngween, counts };
}

// Both finishing and collecting are limited to Oct 25–31, inclusive. Already
// collected auras remain owned forever; incomplete or uncollected ones expire.
export function claimRngweenAura(tasks, id, at, limited) {
  if (rngweenCalendar(at).phase !== "active")
    throw new Error(
      "RNGween auras can only be collected October 25–31, 2026 (UTC).",
    );
  const mission = RNGWEEN_MISSIONS.find((entry) => entry.id === id);
  if (!mission) throw new Error("That Halloween mission does not exist.");
  const rngween = slot(tasks);
  if (rngween.counts[mission.metric] < mission.goal)
    throw new Error("Complete the mission before collecting its aura.");
  if (!missionWorldDone(mission, limited))
    throw new Error(
      `Earn the ${mission.zoneName} key fragment in RNGween World before collecting this aura.`,
    );
  if (rngween.earned.includes(mission.id))
    throw new Error("That Halloween aura has already been collected.");
  return {
    ...tasks,
    rngween: { ...rngween, earned: [...rngween.earned, mission.id] },
  };
}

// These mission receipts restore missing wardrobe entries after save repair.
export function rngweenAuraIds(tasks) {
  const collected = new Set(slot(tasks).earned);
  return RNGWEEN_MISSIONS.filter((mission) => collected.has(mission.id)).map(
    (mission) => mission.auraId,
  );
}

export function rngweenState(tasks, at, limited) {
  const calendar = rngweenCalendar(at);
  const rngween = slot(tasks);
  const collected = new Set(rngween.earned);
  const missions = RNGWEEN_MISSIONS.map((mission) => {
    const isCollected = collected.has(mission.id);
    const countDone = rngween.counts[mission.metric] >= mission.goal;
    const worldDone = isCollected || missionWorldDone(mission, limited);
    const complete = isCollected || (countDone && worldDone);
    return {
      ...mission,
      count: Math.min(rngween.counts[mission.metric], mission.goal),
      countDone: isCollected || countDone,
      worldDone,
      complete,
      collected: isCollected,
      claimable: calendar.phase === "active" && complete && !isCollected,
    };
  });
  return {
    ...calendar,
    id: RNGWEEN_ID,
    missions,
    complete: missions.filter((mission) => mission.complete).length,
    collected: missions.filter((mission) => mission.collected).length,
    ready: missions.filter((mission) => mission.claimable).length,
    total: missions.length,
  };
}
