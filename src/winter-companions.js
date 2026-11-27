export const WINTER_COMPANION_SKINS = [
  {
    id: "winter-lantern-moth",
    name: "Lantern Moth",
    petId: "moth",
    skinId: "lantern",
    accent: "#fbbf24",
    description:
      "Golden wing markings, a wool collar and a hanging winter lantern. Earned from Keep the lanterns lit.",
  },
  {
    id: "winter-parcel-kit",
    name: "Parcel Kit",
    petId: "kit",
    skinId: "parcel",
    accent: "#fb7185",
    description:
      "A crimson cape, delivery satchel and a ribbon-wrapped parcel. Earned from the Northbound gift drive.",
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
  {
    id: "winter-holly-corvid",
    name: "Holly Corvid",
    petId: "corvid",
    skinId: "holly",
    accent: "#4ade80",
    description:
      "A holly wreath and berry-red winter scarf. Earned from Meteor watch.",
  },
  {
    id: "winter-snow-owl",
    name: "Snow Owl",
    petId: "owl",
    skinId: "snow",
    accent: "#93c5fd",
    description:
      "A blue knitted cap, pale plumage and a snowflake brooch. Earned from Bell relay.",
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
