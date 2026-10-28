export const GAME_URL = "https://jaime-gaming.github.io/RNGdle-Infinite";

export function gameUrlForLocation(location = globalThis.location) {
  const hostname = String(location?.hostname ?? "").toLowerCase();
  const origin = String(location?.origin ?? "").replace(/\/+$/, "");
  if (hostname === "rngdle-infinite.jaime-gaming.com" && origin) return origin;
  if (hostname === "jaime-gaming.github.io" && origin)
    return `${origin}/RNGdle-Infinite`;
  return GAME_URL;
}
