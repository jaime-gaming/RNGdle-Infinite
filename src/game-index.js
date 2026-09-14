import metadata from "./data/badge-metadata.json" with { type: "json" };
import manifest from "./data/game-index.json" with { type: "json" };
import { rankScore } from "./probability.js";
import { findEquation, getContributors } from "./contributors.js";

export function createGameIndex(epBuffer, badgeBuffer) {
  if (
    epBuffer.byteLength !== manifest.files.ep.inflatedBytes ||
    badgeBuffer.byteLength !== manifest.files.badge.inflatedBytes
  )
    throw new Error("Invalid scoring index size");
  if (
    metadata.length !== manifest.badgeIds.length ||
    metadata.some((b, i) => b.id !== manifest.badgeIds[i])
  )
    throw new Error("Badge index order mismatch");
  const view = new DataView(epBuffer),
    scores = new Uint32Array(manifest.population);
  for (let i = 0; i < scores.length; i++)
    scores[i] = view.getUint32(i * 4, true);
  const sorted = scores.slice().sort(),
    bits = new Uint8Array(badgeBuffer);
  function evaluate(number) {
    if (
      !Number.isInteger(number) ||
      number < 0 ||
      number >= manifest.population
    )
      throw new RangeError("Number outside the legal range");
    const earned = metadata.filter(
      (_, i) =>
        bits[i * manifest.rowBytes + (number >> 3)] & (1 << (number & 7)),
    );
    const winners = new Map();
    for (const b of earned)
      if (
        b.family &&
        (!winners.has(b.family) || b.ep > winners.get(b.family).ep)
      )
        winners.set(b.family, b);
    const equation = earned.some((b) => b.id === "EQUATION")
      ? findEquation(number)
      : null;
    const badges = earned
      .map((b) => ({
        ...b,
        isScoring: !b.family || winners.get(b.family).id === b.id,
        contributors: getContributors(b, number, equation),
      }))
      .sort((a, b) => b.ep - a.ep);
    const totalEP = scores[number];
    if (
      badges.reduce((sum, b) => sum + (b.isScoring ? b.ep : 0), 0) !== totalEP
    )
      throw new Error("Badge and score indexes disagree");
    const rank = rankScore(sorted, totalEP),
      tier = manifest.tiers.findLast((t) => totalEP >= t.minEP);
    return {
      number,
      totalEP,
      percentile: rank.percentile,
      rank,
      tier: tier.id,
      tierProbability: (100 * tier.count) / manifest.population,
      badges,
      equation,
    };
  }
  return { evaluate };
}
