import { test, expect } from "@playwright/test";
import { deflateSync, strToU8 } from "fflate";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { AVATAR_LIMIT, emptyProgress } from "../src/progress.js";
import {
  decodeShareCard,
  encodeShareCard,
  shareCardData,
  shareCardUrl,
} from "../src/profile-card.js";

// Log times are epoch milliseconds; the card carries them as ISO strings.
const at = (day) => Date.UTC(2026, 2, day, 10, 0, 0);
const iso = (day) => new Date(at(day)).toISOString();

// A logo that satisfies the save's avatar validation: one png data URL.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function played() {
  return {
    ...emptyProgress(),
    profile: {
      id: "p1",
      username: "LuckyOtter41",
      createdAt: at(1),
      avatar: LOGO,
    },
    balance: 125000,
    totalEarned: 400000,
    bookmarks: ["r1", "r3"],
    equipped: "starfall",
    owned: ["starfall"],
    rebirths: 2,
    history: [
      {
        id: "r1",
        type: "roll",
        at: at(2),
        number: 812044,
        tier: "rare",
        ep: 12000,
        badges: [],
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
        id: "r3",
        type: "roll",
        at: at(4),
        number: 1337,
        tier: "trash",
        ep: 40,
        badges: [],
      },
    ],
  };
}

test("a profile card survives the trip through the address and rejects damage", () => {
  const card = shareCardData(played(), new Date(at(5)));
  expect(card.name).toBe("LuckyOtter41");
  expect(card.best).toMatchObject({
    number: 999999,
    tier: "godly",
    ep: 512000,
  });
  expect(card.pins.map((pin) => pin.number)).toEqual([812044, 1337]);
  expect(card.aura).toBe("Starfall");
  const token = encodeShareCard(card);
  // URL-safe: nothing that needs escaping in a query string.
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  const back = decodeShareCard(token);
  expect(back).toMatchObject({
    name: "LuckyOtter41",
    at: iso(5),
    since: iso(1),
    rolls: 3,
    earned: 400000,
    rebirths: 2,
    aura: "Starfall",
  });
  expect(back.best).toEqual({
    number: "999999",
    ep: 512000,
    tier: "godly",
    at: iso(3),
  });
  expect(back.pins).toEqual([
    { number: "812044", ep: 12000, tier: "rare" },
    { number: "1337", ep: 40, tier: "trash" },
  ]);
  // The logo rides along, so a shared profile shows the same face its owner
  // wears; a card without one keeps sharing just the same.
  expect(card.avatar).toBe(LOGO);
  expect(back.avatar).toBe(LOGO);
  expect(
    decodeShareCard(encodeShareCard({ ...card, avatar: null })).avatar,
  ).toBeNull();
  // A forged logo — the wrong mime, markup, a remote address — is dropped.
  for (const forged of [
    "data:text/html;base64,PGI+",
    "https://example.com/logo.png",
    `${LOGO}|extra`,
  ])
    expect(
      decodeShareCard(encodeShareCard({ ...card, avatar: forged })).avatar,
    ).toBeNull();
  // The token is the card line deflated behind a "z1" tag: a share stays
  // compact even with a logo inside, and the tag cannot collide with a plain
  // old token (those are base64url of raw text and always begin A–f).
  expect(token.startsWith("z1")).toBe(true);
  expect(token.length).toBeLessThan(500);
  // An uncompressed old link still opens: version 2 predates the logo field.
  const secs = (day) => Math.floor(at(day) / 1000).toString(36);
  const legacyToken = btoa(
    [
      "2",
      "LuckyOtter41",
      secs(5),
      secs(1),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Starfall",
      "",
    ].join("|"),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const legacy = decodeShareCard(legacyToken);
  expect(legacy.name).toBe("LuckyOtter41");
  expect(legacy.avatar).toBeNull();
  // Damaged, foreign or oversized data is dropped field by field or whole.
  expect(decodeShareCard("")).toBeNull();
  expect(decodeShareCard("not-a-card")).toBeNull();
  expect(decodeShareCard(encodeShareCard({ v: 99, name: "x" }))).toBeNull();
  expect(decodeShareCard(encodeShareCard({ ...card, name: "" }))).toBeNull();
  const forged = decodeShareCard(
    encodeShareCard({
      ...card,
      best: { number: "<script>", tier: "godly", ep: 1 },
      pins: [{ number: "1", tier: "made-up", ep: 1 }, ...card.pins],
      rolls: -5,
      aura: "x".repeat(200),
    }),
  );
  expect(forged.best).toBeNull();
  expect(forged.pins).toHaveLength(2);
  expect(forged.rolls).toBe(0);
  const outOfRange = decodeShareCard(
    encodeShareCard({
      ...card,
      best: { number: "9999999", tier: "godly", ep: 1, at: iso(5) },
      pins: [{ number: "9999999", tier: "godly", ep: 1 }],
    }),
  );
  expect(outOfRange.best).toBeNull();
  expect(outOfRange.pins).toEqual([]);
  expect(forged.aura).toHaveLength(40);
  // The link points at the named profile on the given origin and base.
  const url = new URL(
    shareCardUrl(
      played(),
      "https://jaime-gaming.github.io",
      "/RNGdle-Infinite/",
    ),
  );
  expect(url.pathname).toBe("/RNGdle-Infinite/profile/LuckyOtter41");
  expect(decodeShareCard(url.searchParams.get("card")).name).toBe(
    "LuckyOtter41",
  );
});

test("share-card tokens and expanded data stay within fixed limits", () => {
  const bomb = `z1${base64Url(deflateSync(strToU8("X".repeat(1_000_000))))}`;
  expect(decodeShareCard(bomb)).toBeNull();
  expect(decodeShareCard("A".repeat(400_001))).toBeNull();

  const prefix = "data:image/png;base64,";
  const avatar = `${prefix}${"A".repeat(AVATAR_LIMIT - prefix.length)}`;
  const card = {
    ...shareCardData(played(), new Date(at(6))),
    avatar,
    best: { number: "1000000", ep: 1, tier: "godly", at: iso(5) },
  };
  const token = encodeShareCard(card);
  const decoded = decodeShareCard(token);
  expect(decoded.avatar).toBe(avatar);
  expect(decoded.best.number).toBe("1000000");
});

test("the profile link opens as a read-only card anywhere, and never touches the game there", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedProgress(page, {
    balance: 5000,
    totalEarned: 90000,
    bookmarks: ["r1"],
    profile: { ...testProfile, avatar: LOGO },
    history: [
      {
        id: "r1",
        type: "roll",
        at: at(2),
        number: 424242,
        tier: "epic",
        ep: 9000,
        badges: [],
      },
    ],
  });
  await page.goto("/profile");
  await page.getByTestId("profile-share").click();
  await expect(page.locator(".profile-share-note")).toContainText(
    "Progress card link copied.",
  );
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`/profile/${testProfile.username}\\?card=`));

  // A different browser, a different (guest) player.
  const other = await browser.newContext();
  const visitor = await other.newPage();
  await visitor.goto(link);
  await expect(
    visitor.getByRole("heading", { level: 2, name: testProfile.username }),
  ).toBeVisible();
  await expect(visitor.getByText("A saved profile card.")).toBeVisible();
  // The logo came along: the shared profile wears the same face.
  await expect(
    visitor.locator(".profile-title .avatar-mark img"),
  ).toHaveAttribute("src", LOGO);
  await expect(visitor.locator(".profile-best")).toHaveAttribute(
    "data-best-roll",
    "424242",
  );
  await expect(visitor.getByLabel("Pinned rolls")).toContainText("+9,000 EP");
  // None of the owner's controls exist on a shared card.
  await expect(visitor.getByTestId("profile-share")).toHaveCount(0);
  await expect(visitor.getByTestId("avatar-upload")).toHaveCount(0);
  await expect(visitor.getByText("Delete account")).toHaveCount(0);
  // The address keeps the card, so a reload shows the same thing.
  await visitor.reload();
  await expect(visitor.getByText("A saved profile card.")).toBeVisible();
  // The visitor's own game is untouched: still a guest with nothing saved.
  expect(
    await visitor.evaluate(() =>
      localStorage.getItem("rng-infinite-progress-v1"),
    ),
  ).toBeNull();
  // Moving on in the app leaves the card behind: the visitor's own (empty) profile.
  await visitor.getByRole("button", { name: /Roll a number/ }).click();
  await expect(visitor).not.toHaveURL(/card=/);
  await visitor.locator(".sign-in").click();
  await expect(visitor.getByText("Start saving your progress")).toBeVisible();
  await other.close();

  // A damaged link is just the owner's own profile page.
  await page.goto(`/profile/${testProfile.username}?card=broken`);
  await expect(
    page.getByRole("heading", {
      name: `Your profile, ${testProfile.username}`,
    }),
  ).toBeVisible();
});

test("a heavy logo is shrunk to link size before it travels", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedProgress(page, { balance: 5000, totalEarned: 90000 });
  await page.goto("/profile");
  // A real photo-like logo (random pixels, the compressible kind never
  // shrinks) goes into the save, then the link is copied. It stays under the
  // save's avatar ceiling so it survives the parse on reload.
  const heavy = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 200;
    const context = canvas.getContext("2d");
    let seed = 7;
    const roll = () => (
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff),
      seed
    );
    const noise = context.createImageData(200, 200);
    for (let i = 0; i < noise.data.length; i += 4) {
      noise.data[i] = roll() % 256;
      noise.data[i + 1] = roll() % 256;
      noise.data[i + 2] = roll() % 256;
      noise.data[i + 3] = 255;
    }
    context.putImageData(noise, 0, 0);
    return canvas.toDataURL("image/png");
  });
  expect(heavy.length).toBeGreaterThan(50000);
  expect(heavy.length).toBeLessThanOrEqual(240000);
  await page.evaluate(
    ([key, avatar]) => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.profile.avatar = avatar;
      localStorage.setItem(key, JSON.stringify(saved));
    },
    ["rng-infinite-progress-v1", heavy],
  );
  await page.reload();
  await page.getByTestId("profile-share").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  // Compact: the logo rides as a small square, not as the whole picture.
  expect(link.length).toBeLessThan(heavy.length / 4);

  // The visitor still sees the face that was shared.
  const other = await browser.newContext();
  const visitor = await other.newPage();
  await visitor.goto(link);
  await expect(visitor.getByText("A saved profile card.")).toBeVisible();
  const src = await visitor
    .locator(".profile-title .avatar-mark img")
    .getAttribute("src");
  expect(src.startsWith("data:image/")).toBe(true);
  expect(src.length).toBeLessThan(12000);
  await other.close();
});
