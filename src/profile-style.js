// How a profile dresses itself up beyond the logo: a short line under the
// name and an accent colour. Both live inside the save (so a device link
// carries them) and both are strictly bounded, because anything in the save
// is also painted onto the PNG card and read by other pages.

export const TAGLINE_LIMIT = 40;

// A fixed palette rather than a free colour: every accent has to read on the
// light theme, the dark theme and the dark card, and a hex value typed by hand
// cannot promise that. `ink` is the colour itself; `soft` is its tint for
// backgrounds and rings.
export const PROFILE_ACCENTS = [
  {
    id: "amber",
    name: "Amber",
    ink: "#e8b64a",
    soft: "rgba(232, 182, 74, 0.18)",
  },
  { id: "sky", name: "Sky", ink: "#4aa8e8", soft: "rgba(74, 168, 232, 0.18)" },
  {
    id: "mint",
    name: "Mint",
    ink: "#3fc38a",
    soft: "rgba(63, 195, 138, 0.18)",
  },
  {
    id: "rose",
    name: "Rose",
    ink: "#e8607a",
    soft: "rgba(232, 96, 122, 0.18)",
  },
  {
    id: "violet",
    name: "Violet",
    ink: "#a06ee8",
    soft: "rgba(160, 110, 232, 0.18)",
  },
  {
    id: "ember",
    name: "Ember",
    ink: "#ee7a3a",
    soft: "rgba(238, 122, 58, 0.18)",
  },
];
export const DEFAULT_ACCENT = PROFILE_ACCENTS[0].id;

export function accentById(id) {
  return (
    PROFILE_ACCENTS.find((accent) => accent.id === id) ?? PROFILE_ACCENTS[0]
  );
}

export function validAccent(id) {
  return PROFILE_ACCENTS.some((accent) => accent.id === id);
}

// One line of plain text. Control characters and line breaks are stripped so
// the tagline cannot push the card layout around or smuggle anything odd
// through a share; what is left is trimmed and capped. Returns "" for nothing.
export function cleanTagline(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAGLINE_LIMIT);
}

// The style a save actually carries: only known accents and a clean tagline
// survive, and defaults are left out so an untouched profile keeps its shape.
export function parseProfileStyle(stored = {}) {
  const tagline = cleanTagline(stored.tagline);
  const accent = validAccent(stored.accent) ? stored.accent : "";
  return {
    ...(tagline ? { tagline } : {}),
    ...(accent && accent !== DEFAULT_ACCENT ? { accent } : {}),
  };
}
