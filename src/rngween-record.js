// Your RNGween in numbers: what the event has given you so far, read from the
// save and the activity log the same way the profile reads its record. It
// feeds the "Record" tab of the World. Nothing here is stored twice.
import { RNGWEEN_AURAS, RNGWEEN_WORLD_SKIN } from "./rngween.js";
import {
  WORLD_ZONES,
  WORLD_VALLEY_TARGET,
  rngweenValleyUnlocked,
  worldState,
  WORLD_FRAGMENT_ZONES,
} from "./rngween-world-zones.js";
import {
  WORLD_BADGES,
  emptyWorldMini,
  worldMiniSummary,
} from "./rngween-world-badges.js";

// Pumpkoins arrive from commissions, missions, the EP exchange and World
// rolls, and leave through the two shops and the key. The log covers all but
// the World rolls, which keep their own running total in the save.
const EARNING = new Set([
  "rngween-hourly",
  "rngween-mission",
  "rngween-exchange",
]);
const SPENDING = new Set([
  "rngween-purchase",
  "rngween-world-purchase",
  "rngween-forged-key",
]);

export function rngweenRecord(progress = {}, now = new Date()) {
  const limited = progress.rngweenLimited ?? null;
  const world = worldState(limited);
  const mini = world.mini ?? emptyWorldMini();
  const history = Array.isArray(progress.history) ? progress.history : [];
  let earned = Number(world.earned) || 0;
  let spent = 0;
  let commissions = 0;
  for (const entry of history) {
    const amount = Number(entry?.pumpkoins) || 0;
    if (EARNING.has(entry?.type)) earned += amount;
    if (SPENDING.has(entry?.type)) spent += amount;
    if (entry?.type === "rngween-hourly") commissions += 1;
  }
  const zones = WORLD_ZONES.map((zone) => {
    const summary = worldMiniSummary(zone.id, mini[zone.id]);
    return {
      id: zone.id,
      name: zone.name,
      accent: zone.accent,
      rolls: summary.rolls,
      badges: summary.unique,
      badgesTotal: summary.total,
      points: summary.score,
    };
  });
  const ownedIds = new Set([
    ...(progress.owned ?? []),
    ...(limited?.auras ?? []),
  ]);
  const auras = RNGWEEN_AURAS.filter((aura) => ownedIds.has(aura.id)).map(
    (aura) => aura.name,
  );
  const hexbound =
    limited?.skinEarned === true || ownedIds.has(RNGWEEN_WORLD_SKIN.id);
  const valleyBest = mini.valley?.best ?? null;
  return {
    name: progress.profile?.username ?? "Guest",
    at: now.toISOString(),
    pumpkoins: limited?.pumpkoins ?? 0,
    earned,
    spent,
    commissions,
    rolls: zones.reduce((sum, zone) => sum + zone.rolls, 0),
    badges: zones.reduce((sum, zone) => sum + zone.badges, 0),
    badgesTotal: Object.values(WORLD_BADGES).reduce(
      (sum, list) => sum + list.length,
      0,
    ),
    points: zones.reduce((sum, zone) => sum + zone.points, 0),
    zones,
    fragments: Object.fromEntries(
      WORLD_FRAGMENT_ZONES.map((id) => [id, world.fragments?.[id] === true]),
    ),
    key: rngweenValleyUnlocked(limited),
    valleyBest,
    jackpot: hexbound || valleyBest?.number === WORLD_VALLEY_TARGET,
    hexbound,
    auras,
    aurasTotal: RNGWEEN_AURAS.length,
  };
}
