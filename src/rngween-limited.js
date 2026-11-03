// Minimal compatibility for retired RNGween saves. Event currency, purchases,
// tasks and World state are discarded; permanent aura receipts remain.
import {
  RNGWEEN_AURAS,
  RNGWEEN_FINALE_SKIN,
  RNGWEEN_ID,
  RNGWEEN_WORLD_SKIN,
} from "./rngween.js";

const AURA_IDS = new Set([
  ...RNGWEEN_AURAS.map(({ id }) => id),
  RNGWEEN_FINALE_SKIN.id,
]);
const object = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function emptyRngweenLimited() {
  return {
    id: RNGWEEN_ID,
    auras: [],
    skinEarned: false,
    finaleEarned: false,
    retired: true,
  };
}

export function parseRngweenLimited(value, receipts = {}) {
  if (value == null) value = emptyRngweenLimited();

  let repaired = !object(value) || value.id !== RNGWEEN_ID;
  const storedAuras = Array.isArray(value?.auras) ? value.auras : [];
  if (!Array.isArray(value?.auras) && value?.auras != null) repaired = true;

  const auras = new Set();
  for (const id of storedAuras) {
    if (AURA_IDS.has(id)) auras.add(id);
    else repaired = true;
  }
  for (const id of Array.isArray(receipts.earnedAuras)
    ? receipts.earnedAuras
    : [])
    if (AURA_IDS.has(id)) auras.add(id);
  for (const id of Array.isArray(receipts.owned) ? receipts.owned : [])
    if (AURA_IDS.has(id)) auras.add(id);
  for (const entry of Array.isArray(receipts.history) ? receipts.history : [])
    if (
      ["rngween-purchase", "rngween-mission", "rngween-finale"].includes(
        entry?.type,
      ) &&
      AURA_IDS.has(entry.productId)
    )
      auras.add(entry.productId);

  const skinEarned =
    value?.skinEarned === true ||
    receipts.owned?.includes?.(RNGWEEN_WORLD_SKIN.id) === true;
  const finaleEarned =
    value?.finaleEarned === true ||
    auras.has(RNGWEEN_FINALE_SKIN.id) ||
    receipts.owned?.includes?.(RNGWEEN_FINALE_SKIN.id) === true ||
    (Array.isArray(receipts.history) &&
      receipts.history.some(
        (entry) =>
          entry?.type === "rngween-finale" &&
          entry.productId === RNGWEEN_FINALE_SKIN.id,
      ));
  if (
    (value?.skinEarned != null && typeof value.skinEarned !== "boolean") ||
    (value?.finaleEarned != null && typeof value.finaleEarned !== "boolean")
  )
    repaired = true;

  if (
    value?.retired !== true ||
    Object.keys(value ?? {}).some(
      (key) =>
        !["id", "auras", "skinEarned", "finaleEarned", "retired"].includes(key),
    )
  )
    repaired = true;

  return {
    limited: {
      id: RNGWEEN_ID,
      auras: [...auras],
      skinEarned,
      finaleEarned,
      retired: true,
    },
    repaired,
  };
}

export function limitedRewardIds(limited) {
  return [
    ...(limited?.auras ?? []).filter((id) => AURA_IDS.has(id)),
    ...(limited?.skinEarned ? [RNGWEEN_WORLD_SKIN.id] : []),
    ...(limited?.finaleEarned &&
    !limited?.auras?.includes?.(RNGWEEN_FINALE_SKIN.id)
      ? [RNGWEEN_FINALE_SKIN.id]
      : []),
  ];
}
