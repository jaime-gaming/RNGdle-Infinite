export const GAME_URL = "https://rngdle-infinite.jaime-gaming.com";

export function gameUrlForLocation(location = globalThis.location) {
  const hostname = String(location?.hostname ?? "").toLowerCase();
  const origin = String(location?.origin ?? "").replace(/\/+$/, "");
  if (hostname === "rngdle-infinite.jaime-gaming.com" && origin) return origin;
  return GAME_URL;
}
