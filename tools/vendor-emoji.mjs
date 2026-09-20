// Vendor the emoji artwork the game actually uses.
//
// Every glyph in the badge catalogue and the companion list must have a local
// SVG in public/emoji/ plus an entry in src/emoji-map.json, otherwise numbers
// fall back to system text glyphs. Twemoji is MIT/CC-BY licensed and shipped
// through the @twemoji/svg dev dependency, so this script is the one place
// where artwork is added.
//
//   node tools/vendor-emoji.mjs          # add anything missing
//   node tools/vendor-emoji.mjs --check  # fail instead of writing
import fs from "node:fs";
import path from "node:path";
import { PETS } from "../src/pets.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";

const CHECK = process.argv.includes("--check");
const EMOJI_DIR = path.resolve("public/emoji");
const MAP_PATH = path.resolve("src/emoji-map.json");
const SOURCE_DIR = path.resolve("node_modules/@twemoji/svg");

// Twemoji file names are the codepoints, lowercased and dash-joined, with the
// variation selector dropped: 🐦‍⬛ → 1f426-200d-2b1b.
function fileName(glyph) {
  return [...glyph]
    .filter((part) => part.codePointAt(0) !== 0xfe0f)
    .map((part) => part.codePointAt(0).toString(16))
    .join("-");
}

// Badge art is often two or three glyphs in a row (➖➖, 💰💰💰); the renderer
// splits a string into graphemes and looks each one up, so vendor per grapheme.
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const glyphs = new Set();
const add = (text) => {
  for (const { segment } of segmenter.segment(text)) glyphs.add(segment);
};
for (const badge of allBadgeMetadata) if (badge.emoji) add(badge.emoji);
for (const pet of PETS) if (pet.emoji) add(pet.emoji);

const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
const missing = [];
for (const glyph of glyphs) {
  const file = `${fileName(glyph)}.svg`;
  if (
    map[glyph] &&
    fs.existsSync(path.join(EMOJI_DIR, path.basename(map[glyph])))
  )
    continue;
  const source = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(source)) {
    console.warn(`no Twemoji artwork for ${glyph} (${file})`);
    continue;
  }
  if (!CHECK) fs.copyFileSync(source, path.join(EMOJI_DIR, file));
  map[glyph] = `/emoji/${file}`;
  missing.push(file);
}

if (missing.length && !CHECK) {
  fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`added ${missing.length} emoji: ${missing.join(", ")}`);
} else if (missing.length) {
  console.error(`missing ${missing.length} emoji: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`all ${glyphs.size} glyphs are already vendored`);
}
