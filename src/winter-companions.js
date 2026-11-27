export const WINTER_COMPANION_SKINS = [
  {
    id: "winter-lantern-moth",
    name: "Lantern Moth",
    petId: "moth",
    skinId: "lantern",
    accent: "#fbbf24",
    description:
      "Warm lantern wings and a hanging winter light. Earned from Keep the lanterns lit.",
  },
  {
    id: "winter-parcel-kit",
    name: "Parcel Kit",
    petId: "kit",
    skinId: "parcel",
    accent: "#fb7185",
    description:
      "A red delivery scarf and a tiny parcel. Earned from the Northbound gift drive.",
  },
  {
    id: "winter-polar-axolotl",
    name: "Polar Axolotl",
    petId: "axolotl",
    skinId: "polar",
    accent: "#67e8f9",
    description:
      "An ice crown and snow-bright gills. Available at the winter market.",
  },
].map((item) => ({
  ...item,
  kind: "pet-variant",
  winterReward: true,
  eventOnly: true,
  limited: true,
  swatch: ["#102535", item.accent],
}));
export function winterCompanionSkin(petId, skinId) {
  return WINTER_COMPANION_SKINS.find(
    (item) => item.petId === petId && item.skinId === skinId,
  );
}
