import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PETS } from "../src/pets.js";
import { CREATURE_IDS } from "../src/components/game-icons.jsx";
import { allBadgeMetadata } from "../src/infinite-badges.js";

// Artwork and documentation are shipped assets too: a badge that falls back to
// a text glyph, a companion with no drawing of its own, or a README image that
// was never committed, is a visible regression on the public page.
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const emojiMap = JSON.parse(fs.readFileSync("src/emoji-map.json", "utf8"));

test("every badge glyph has local artwork", () => {
  const glyphs = new Set();
  for (const badge of allBadgeMetadata)
    for (const { segment } of segmenter.segment(badge.emoji ?? ""))
      glyphs.add(segment);
  expect(glyphs.size).toBeGreaterThan(150);
  for (const glyph of glyphs) {
    const file = emojiMap[glyph];
    expect(file, `no emoji-map entry for ${glyph}`).toBeTruthy();
    expect(
      fs.existsSync(path.join("public", file.replace(/^\//, ""))),
      `missing artwork for ${glyph} (${file})`,
    ).toBe(true);
  }
});

test("every companion has its own drawing, and no companion borrows another", () => {
  // The interface draws companions itself instead of pasting emoji artwork, so
  // each id needs a glyph and the glyphs must be distinct.
  const icons = new Set(CREATURE_IDS);
  for (const pet of PETS)
    expect(icons.has(pet.id), `no icon for ${pet.id}`).toBe(true);
  expect(
    CREATURE_IDS.filter((id) => PETS.some((pet) => pet.id === id)),
  ).toEqual(PETS.map((pet) => pet.id));
  // The parade and the shelf both render that artwork, never an emoji glyph.
  const parade = fs.readFileSync("src/components/PetParade.jsx", "utf8");
  const shelf = fs.readFileSync("src/components/PetShelf.jsx", "utf8");
  for (const source of [parade, shelf]) {
    expect(source).toContain("PetIcon");
    expect(source).not.toContain("Emoji");
  }
});

test("the README is a player guide whose images really exist", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  );
  expect(images.length).toBeGreaterThanOrEqual(6);
  for (const image of images) {
    expect(fs.existsSync(image), `README points at a missing image: ${image}`);
  }
  // The public page explains the game, so it talks about playable things
  // rather than about modules and helper functions.
  for (const section of [
    "## How a roll works",
    "## Companions",
    "## Skills and the rack",
    "## Rebirth and ultra-rebirth",
    "## Your profile, your data",
    "## Fairness",
    "## Running it locally",
  ])
    expect(readme).toContain(section);
  expect(readme).toContain("https://jaime-gaming.github.io/RNGdle-Infinite/");
  expect(readme).not.toMatch(/^## (Main files|Tests)$/m);
  // Anything that looks like a source path belongs in the last section only.
  const body = readme.slice(0, readme.indexOf("## Running it locally"));
  expect(body).not.toMatch(/src\/[\w-]+\.jsx?/);
});

test("the shop hub links match the sections it renders", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const companion = fs.readFileSync("src/components/PetShelf.jsx", "utf8");
  const source = `${shop}\n${companion}`;
  const ids = [
    ...shop.matchAll(/\bid: "([a-z-]+)",\s*\n\s*label: "([^"]+)",/g),
  ];
  expect(ids.length).toBeGreaterThanOrEqual(6);
  const seen = new Set();
  for (const [, id, label] of ids) {
    expect(seen.has(id)).toBe(false);
    seen.add(id);
    expect(label).toMatch(/^[A-Z]/);
    expect(source).toContain(`id="shop-${id}"`);
    // Every link is a real anchor, so a shelf can be linked to and shared.
    expect(shop).toContain("href={`#${section.id}`}");
  }
  expect(seen).toEqual(
    new Set(["skills", "pace", "companions", "auras", "offline", "tools"]),
  );
});
