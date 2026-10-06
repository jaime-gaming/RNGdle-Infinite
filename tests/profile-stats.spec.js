import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  accountStats,
  drawExportCardToCanvas,
  exportFileName,
  exportPayload,
} from "../src/profile-stats.js";
import zlib from "node:zlib";
import {
  AVATAR_LIMIT,
  applyProgress,
  emptyProgress,
  parseProgress,
  validAvatar,
} from "../src/progress.js";
import { BADGE_TOTAL } from "../src/rebirth.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { PETS } from "../src/pets.js";
import { SKILLS } from "../src/skills.js";

// A tiny PNG reader, so the exported card can be inspected for real pixels
// rather than for "some bytes came out". Handles the colour types a canvas
// writes (RGB and RGBA) and every scanline filter.
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const target = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? target[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft = prior && x >= channels ? prior[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      target[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

const at = (day) => Date.UTC(2026, 7, day, 12, 0, 0);
const [badgeA] = allBadgeMetadata.map((badge) => badge.id);

function played(extra = {}) {
  return {
    ...emptyProgress(),
    profile: { id: "p1", username: "LuckyOtter41", createdAt: at(1) },
    balance: 125000,
    totalEarned: 400000,
    discovered: [badgeA, "missing-badge"],
    pets: ["pebble", "moth"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    rebirths: 2,
    ultraRebirths: 1,
    history: [
      {
        id: "r1",
        type: "roll",
        at: at(2),
        number: 812044,
        tier: "rare",
        ep: 12000,
        badges: [badgeA],
      },
      {
        id: "r1:unlock",
        type: "unlock",
        at: at(2),
        number: 812044,
        badges: [badgeA],
      },
      {
        id: "r2",
        type: "roll",
        at: at(3),
        number: 999999,
        tier: "godly",
        ep: 512000,
        badges: [],
      },
      {
        id: "r2:pet",
        type: "pet",
        at: at(3),
        productId: "moth",
        name: "Lumen Moth",
      },
      {
        id: "r3",
        type: "roll",
        at: at(4),
        number: 1337,
        tier: "trash",
        ep: 40,
        badges: [],
        source: "offline",
      },
      {
        id: "r4",
        type: "roll",
        at: at(4),
        number: 4242,
        tier: "common",
        ep: 260,
        badges: [],
        flywheel: "boost",
        skills: ["surge"],
      },
      {
        id: "b1",
        type: "purchase",
        at: at(5),
        productId: "surge",
        name: "Surge",
        ep: 180000,
      },
      {
        id: "reb1",
        type: "rebirth",
        at: at(6),
        count: 2,
        skill: "reborn-drive",
      },
    ],
    ...extra,
  };
}

test("every profile figure is derived from the save and its activity log", () => {
  const stats = accountStats(played());
  expect(stats.rolls).toBe(4);
  expect(stats.onlineRolls).toBe(3);
  expect(stats.offlineRolls).toBe(1);
  expect(stats.bestRoll).toMatchObject({
    number: 999999,
    ep: 512000,
    tier: "godly",
  });
  expect(stats.favoriteTier).toBe("rare"); // all four tie; the first seen wins
  expect(stats.totalEarned).toBe(400000);
  expect(stats.spent).toBe(180000);
  expect(stats.uniqueBadges).toBe(1);
  // Only real badge ids count: the fixture also carries one that does not exist.
  expect(stats.badgesNow).toBe(1);
  expect(stats.badgesTotal).toBe(BADGE_TOTAL);
  expect(stats.companions).toBe(2);
  expect(stats.companionsFound).toBe(1);
  expect(stats.companionsTotal).toBe(PETS.length);
  expect(stats.skills).toBe(1);
  expect(stats.skillsTotal).toBe(SKILLS.length);
  expect(stats.skillsUsed).toBe(1);
  expect(stats.boostsUsed).toBe(1);
  expect(stats.rebirths).toBe(2);
  expect(stats.ultraRebirths).toBe(1);
  expect(stats.firstEventAt).toBe(at(2));
  expect(stats.lastEventAt).toBe(at(6));
  // Nothing is written back: the caller's object is untouched.
  const progress = played();
  const before = JSON.stringify(progress);
  accountStats(progress);
  expect(JSON.stringify(progress)).toBe(before);
});

test("an empty save reads as zeros rather than as invented progress", () => {
  const stats = accountStats(emptyProgress());
  expect(stats.rolls).toBe(0);
  expect(stats.bestRoll).toBeNull();
  expect(stats.favoriteTier).toBeNull();
  expect(stats.uniqueBadges).toBe(0);
  expect(stats.skillsUsed).toBe(0);
  expect(stats.firstEventAt).toBeNull();
  expect(stats.lastEventAt).toBeNull();
});

test("the export is a read-only PNG snapshot with no import path", async () => {
  const progress = played();
  const payload = exportPayload(progress);
  expect(payload.app).toBe("RNGdle Infinite");
  expect(payload.format).toBe("png");
  expect(payload.accountName).toBe("LuckyOtter41");
  expect(payload.biggestRoll).toEqual(payload.stats.bestRoll);
  expect(payload.profile.username).toBe("LuckyOtter41");
  expect(payload.stats.rolls).toBe(4);
  expect(payload.save).toMatchObject({
    balance: 125000,
    totalEarned: 400000,
    pets: ["pebble", "moth"],
    activePet: "pebble",
    equippedSkills: ["surge"],
    rebirths: 2,
    ultraRebirths: 1,
  });
  expect(payload.save.history).toHaveLength(progress.history.length);
  expect(exportFileName(progress)).toMatch(
    /^rngdle-infinite-luckyotter41-\d{4}-\d{2}-\d{2}\.png$/,
  );
  expect(exportFileName(emptyProgress())).toMatch(
    /^rngdle-infinite-guest-\d{4}-\d{2}-\d{2}\.png$/,
  );

  // The UI offers a PNG card download, and the only file input in the whole
  // page is the logo picker — images in, never account data out of a file.
  const profile = fs.readFileSync("src/components/LocalProfile.jsx", "utf8");
  expect(profile).toContain("Export my data");
  expect(profile).toContain("renderExportPngBlob");
  expect(profile).toContain("accept={AVATAR_ACCEPT}");
  expect(profile).not.toMatch(/readAsText|Import from|importProgress/);
});

test("the PNG card paints the logo, the name, the biggest roll and the key stats", () => {
  // A recording 2d surface: every string the card paints and every image it
  // draws, without needing a browser canvas.
  const paint = (progress, logo) => {
    const texts = [];
    let images = 0;
    const ctx = {
      fillText: (text) => texts.push(String(text)),
      drawImage: () => {
        images += 1;
      },
      createLinearGradient: () => ({ addColorStop: () => {} }),
      arc: () => {},
      arcTo: () => {},
      beginPath: () => {},
      clip: () => {},
      closePath: () => {},
      fill: () => {},
      fillRect: () => {},
      moveTo: () => {},
      restore: () => {},
      save: () => {},
      stroke: () => {},
    };
    const canvas = { getContext: () => ctx };
    drawExportCardToCanvas(canvas, progress, logo);
    return { canvas, texts, images };
  };
  const progress = played();
  const card = paint(progress, { width: 128, height: 128 });
  expect([card.canvas.width, card.canvas.height]).toEqual([1200, 680]);
  // Identity: the account name, with its logo drawn beside it.
  expect(card.images).toBe(1);
  expect(card.texts).toContain("LuckyOtter41");
  // The hero: the biggest roll's number, tier and EP — r2, the godly roll.
  expect(card.texts).toContain("BIGGEST ROLL");
  expect(card.texts).toContain("999,999");
  expect(card.texts).toContain("GODLY TIER · +512,000 EP");
  // The key stats grid, all six tiles.
  for (const label of [
    "ALL-TIME EP EARNED",
    "TOTAL ROLLS",
    "BADGES DISCOVERED",
    "REBIRTHS & PRESTIGE",
    "COMPANIONS",
    "SKILLS UNLOCKED",
  ])
    expect(card.texts).toContain(label);
  // Without a logo the card still paints everything else — just no image.
  const plain = paint(progress, null);
  expect(plain.images).toBe(0);
  expect(plain.texts).toContain("LuckyOtter41");
  expect(plain.texts).toContain("999,999");
});

test("the account logo is part of the save, and only a small image data URL is one", async () => {
  const base = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAg";
  expect(validAvatar(base)).toBe(true);
  // Wrong shapes: other formats, remote addresses, scripts, empty strings.
  for (const bad of [
    "",
    "https://example.com/logo.png",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "javascript:alert(1)",
    `data:image/png;base64,${"A".repeat(AVATAR_LIMIT)}`,
  ])
    expect(validAvatar(bad), bad.slice(0, 24)).toBe(false);

  // The action sets and clears it, refuses anything else, and is profile-only.
  const withLogo = applyProgress(played(), { type: "avatar", avatar: base });
  expect(withLogo.profile.avatar).toBe(base);
  expect(
    applyProgress(withLogo, { type: "avatar", avatar: "" }).profile.avatar,
  ).toBeUndefined();
  expect(() =>
    applyProgress(played(), {
      type: "avatar",
      avatar: "data:text/html;base64,AA",
    }),
  ).toThrow(/PNG, JPEG or WebP/);
  expect(() =>
    applyProgress(
      { ...emptyProgress(), profile: null },
      {
        type: "avatar",
        avatar: base,
      },
    ),
  ).toThrow(/local profile/);

  // A save carries it across a reload, and a broken one is dropped rather
  // than allowed to brick the account over a cosmetic field.
  const parsed = parseProgress(JSON.stringify(withLogo));
  expect(parsed.profile.avatar).toBe(base);
  const broken = parseProgress(
    JSON.stringify({
      ...withLogo,
      profile: { ...withLogo.profile, avatar: "data:text/html;base64,AA" },
    }),
  );
  expect(broken.profile.avatar).toBeUndefined();
  expect(broken.profile.username).toBe("LuckyOtter41");
});

test("the PNG card carries the account's own logo", async ({ page }) => {
  await page.goto("/");
  // A solid blue square, so the card can be checked pixel by pixel.
  const logo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.fillRect(0, 0, 128, 128);
    return canvas.toDataURL("image/png");
  });
  const withLogo = played();
  withLogo.profile = { ...withLogo.profile, avatar: logo };
  const [plainPng, logoPng] = await page.evaluate(
    async ([withSave, withoutSave]) => {
      const { renderExportPngBlob } = await import(
        `${location.origin}/src/profile-stats.js`
      );
      const bytes = async (save) => {
        const blob = await renderExportPngBlob(save);
        const buffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(buffer));
      };
      return [await bytes(withoutSave), await bytes(withSave)];
    },
    [withLogo, played()],
  );
  const plain = decodePng(Buffer.from(plainPng));
  const card = decodePng(Buffer.from(logoPng));
  expect([plain.width, plain.height]).toEqual([1200, 680]);
  expect([card.width, card.height]).toEqual([1200, 680]);
  // Different pictures: the card with a logo is not the card without one.
  expect(logoPng.length).not.toBe(plainPng.length);
  // The logo sits in a circle just left of the account name: the blue lands
  // where the name would otherwise start.
  const at = (image, x, y) => {
    const index = y * image.width * image.channels + x * image.channels;
    return [
      image.pixels[index],
      image.pixels[index + 1],
      image.pixels[index + 2],
    ];
  };
  expect(at(card, 80, 108)[2]).toBeGreaterThan(200);
  expect(at(card, 80, 108)[0]).toBeLessThan(80);
  expect(at(plain, 80, 108)[2]).toBeLessThan(200);
});
