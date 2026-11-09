import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import fs from "node:fs";
import path from "node:path";
import { PETS } from "../src/pets.js";
import { CREATURE_IDS } from "../src/components/game-icons.jsx";
import { allBadgeMetadata } from "../src/infinite-badges.js";

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
  const icons = new Set(CREATURE_IDS);
  for (const pet of PETS)
    expect(icons.has(pet.id), `no icon for ${pet.id}`).toBe(true);
  expect(
    CREATURE_IDS.filter((id) => PETS.some((pet) => pet.id === id)),
  ).toEqual(PETS.map((pet) => pet.id));

  const parade = fs.readFileSync("src/components/PetParade.jsx", "utf8");
  const shelf = fs.readFileSync("src/components/PetShelf.jsx", "utf8");
  for (const source of [parade, shelf]) {
    expect(source).toContain("PetIcon");
    expect(source).not.toContain("Emoji");
  }
});

test("the README is a short, player-friendly guide with current screenshots", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  );
  expect(images.length).toBeGreaterThanOrEqual(5);
  for (const image of images) {
    expect(fs.existsSync(image), `README points at a missing image: ${image}`);
  }
  expect(readme.split("\n").length).toBeLessThanOrEqual(100);
  for (const section of [
    "## How to play",
    "## What you can discover",
    "## Keep your progress",
    "## FAQ",
    "## Privacy & contact",
    "## Credits",
  ])
    expect(readme).toContain(section);
  expect(readme).toContain("https://rngdle-infinite.jaime-gaming.com/");
  expect(readme).toContain("Settings → Restore save");
  expect(readme).toContain("jaimegamingpro@gmail.com");
  expect(readme).toMatch(/_Documentation updated [A-Za-z]+ \d{1,2}, \d{4}\._/);
  expect(readme).not.toMatch(/^## (Main files|Tests)$/m);
  for (const implementationDetail of [
    "VITE_",
    "rngdle-infinite-jg",
    "Firestore",
    "Firebase Console",
    "service-account",
    "npm run",
    "src/",
  ])
    expect(readme).not.toContain(implementationDetail);
});

test("the production entry point uses the custom domain and ships every linked icon", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const origin = "https://rngdle-infinite.jaime-gaming.com/";
  expect(html).toContain(`<link rel="canonical" href="${origin}" />`);
  expect(html).toMatch(
    /<meta\s+property="og:url"\s+content="https:\/\/rngdle-infinite\.jaime-gaming\.com\/"\s*\/>/,
  );
  expect(html).toMatch(
    /<meta\s+property="og:image"\s+content="https:\/\/rngdle-infinite\.jaime-gaming\.com\/icon-512\.png"\s*\/>/,
  );

  const publicAssets = new Set(fs.readdirSync("public"));
  expect(publicAssets.has("icon-512.png")).toBe(true);
  for (const [, asset] of html.matchAll(/(?:href|src)="\/(?!\/)([^"?#]+)"/g)) {
    if (asset.startsWith("src/")) continue;
    expect(
      publicAssets.has(asset.split("/")[0]),
      `missing public asset: ${asset}`,
    ).toBe(true);
  }
});

test("the shop hub links match the shelf pages it renders", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const data = fs.readFileSync("src/shop-data.js", "utf8");
  const companion = fs.readFileSync("src/components/PetShelf.jsx", "utf8");
  const source = `${shop}\n${companion}`;

  const ids = [
    ...data.matchAll(
      /\bid: "([a-z-]+)",\s*\n\s*label: "([^"]+)",\s*\n\s*icon: "/g,
    ),
  ];
  expect(ids.length).toBeGreaterThanOrEqual(6);
  const seen = new Set();
  for (const [, id, label] of ids) {
    expect(seen.has(id)).toBe(false);
    seen.add(id);
    expect(label).toMatch(/^[A-Z]/);

    expect(source).toContain(`id="shop-${id}"`);

    expect(shop).toContain('pathForSubpage("shop", entry.id)');
    expect(shop).toContain('id="shop-hub"');
  }
  expect(seen).toEqual(
    new Set(["skills", "pace", "companions", "auras", "offline", "tools"]),
  );
});
