import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PETS } from "../src/pets.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";

// Artwork and documentation are shipped assets too: a badge or companion that
// falls back to a text glyph, or a README image that was never committed, is a
// visible regression on the public page.
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const emojiMap = JSON.parse(fs.readFileSync("src/emoji-map.json", "utf8"));

test("every badge and companion glyph has local artwork", () => {
  const glyphs = new Set();
  for (const badge of allBadgeMetadata)
    for (const { segment } of segmenter.segment(badge.emoji ?? ""))
      glyphs.add(segment);
  for (const pet of PETS)
    for (const { segment } of segmenter.segment(pet.emoji)) glyphs.add(segment);
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

test("the shop's jump links match the sections it renders", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const companion = fs.readFileSync("src/components/PetShelf.jsx", "utf8");
  const source = `${shop}\n${companion}`;
  const ids = [...shop.matchAll(/\{ id: "([a-z-]+)", label: "([^"]+)" \}/g)];
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
