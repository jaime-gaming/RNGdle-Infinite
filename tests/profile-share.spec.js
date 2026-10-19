import { test, expect } from "@playwright/test";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { emptyProgress } from "../src/progress.js";
import {
  decodeShareCard,
  encodeShareCard,
  shareCardData,
  shareCardUrl,
} from "../src/profile-card.js";

// Log times are epoch milliseconds; the card carries them as ISO strings.
const at = (day) => Date.UTC(2026, 2, day, 10, 0, 0);
const iso = (day) => new Date(at(day)).toISOString();

function played() {
  return {
    ...emptyProgress(),
    profile: { id: "p1", username: "LuckyOtter41", createdAt: at(1) },
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

test("the profile link opens as a read-only card anywhere, and never touches the game there", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedProgress(page, {
    balance: 5000,
    totalEarned: 90000,
    bookmarks: ["r1"],
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
    "Link copied",
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
  await expect(visitor.getByText("A shared card, read-only.")).toBeVisible();
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
  await expect(visitor.getByText("A shared card, read-only.")).toBeVisible();
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
