import { expect, test } from "./helpers/clock.js";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { LEGACY_DEVICE_LINK_STORAGE_KEYS } from "../src/device-link-migration.js";
import { seedProgress } from "./helpers/progress.js";

test("the home screen has no account banner; a guest can choose local play from their profile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".play-choice-banner")).toHaveCount(0);
  await expect(page.getByText(/Choose how to play:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  const continueLocally = page.getByRole("button", {
    name: "Continue locally",
  });
  await expect(continueLocally).toBeVisible();
  await continueLocally.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.locator(".sign-in")).toContainText("Name profile");
  await page.reload();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
});

test("the retired device-link notice is only shown when a local profile exists", async ({
  page,
}) => {
  await page.addInitScript(
    ({ progressKey, progress, legacyKey }) => {
      localStorage.setItem(progressKey, JSON.stringify(progress));
      localStorage.setItem(
        legacyKey,
        JSON.stringify({ room: "old-room", key: "do-not-show-this-token" }),
      );
    },
    {
      progressKey: PROGRESS_KEY,
      progress: {
        ...emptyProgress(),
        profile: { id: "local-profile", username: "LocalPlayer", createdAt: 1 },
      },
      legacyKey: LEGACY_DEVICE_LINK_STORAGE_KEYS[0],
    },
  );
  await page.goto("/");
  await expect(page.getByText("Device linking has changed.")).toBeVisible();
  await expect(
    page.getByText(/same Cloud Account on each device/),
  ).toBeVisible();
  await expect(page.getByText("do-not-show-this-token")).toHaveCount(0);
});

test("the retired device-link notice stays hidden without a local profile", async ({
  page,
}) => {
  await page.addInitScript(
    ({ progressKey, legacyKey }) => {
      localStorage.setItem(progressKey, JSON.stringify({ profile: null }));
      localStorage.setItem(
        legacyKey,
        JSON.stringify({ room: "old-room", key: "private-token" }),
      );
    },
    {
      progressKey: PROGRESS_KEY,
      legacyKey: LEGACY_DEVICE_LINK_STORAGE_KEYS[0],
    },
  );
  await page.goto("/");
  await expect(page.locator(".device-link-migration-banner")).toHaveCount(0);
});

test("offline play explains that a local profile stays on this device", async ({
  page,
}) => {
  await seedProgress(page, { balance: 42 });
  await page.goto("/");
  await page.context().setOffline(true);
  const notice = page.getByTestId("offline-save-notice");
  await expect(notice).toContainText(
    "Offline — progress is saved on this device.",
  );
  await expect(notice).toContainText("Link a Cloud Account when online");
});

test("email credential controls and cloud account deletion require a signed-in account", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.getByTestId("cloud-account-security")).toHaveCount(0);
  await expect(page.getByTestId("cloud-account-delete")).toHaveCount(0);
});

test("a local player names their profile before play and keeps existing session progress", async ({
  page,
}) => {
  const original = {
    ...emptyProgress(),
    balance: 2,
    totalEarned: 2,
    history: [
      {
        id: "session-roll",
        type: "roll",
        at: 1_700_000_000_000,
        number: 604827,
        badges: [],
        ep: 2,
        tier: "common",
      },
    ],
  };
  await page.addInitScript(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: PROGRESS_KEY, data: original },
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Continue locally" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start saving my progress" }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("LocalPlayer");
  await page.getByRole("button", { name: "Start saving my progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, LocalPlayer" }),
  ).toBeVisible();

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.balance).toBe(2);
  expect(saved.totalEarned).toBe(2);
  expect(saved.profile.username).toBe("LocalPlayer");
  expect(saved.history).toHaveLength(1);
  expect(saved.history[0].id).toBe("session-roll");
});

test("Cloud Account explains privacy and legal pages are linked from How to Play", async ({
  page,
}) => {
  await page.goto("/profile");
  const securityOverview = page.getByTestId("cloud-security-overview");
  await expect(securityOverview).toContainText("Your account and progress");
  await expect(securityOverview).toContainText("Cloud is optional");
  await expect(securityOverview).toContainText("App Check:");
  await expect(securityOverview).not.toContainText(
    "checks are configured and enforced",
  );

  await seedProgress(page);
  await page.goto("/profile");
  await expect(page.getByTestId("cloud-security-overview")).toContainText(
    "Saved on this device",
  );

  await page.goto("/about");
  await expect(
    page.getByRole("link", { name: "Privacy & Rights" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Terms of Service" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "jaimegamingpro@gmail.com" }),
  ).toHaveAttribute("href", "mailto:jaimegamingpro@gmail.com");

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy & Rights" }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
  ).toHaveCount(0);

  await page.goto("/tos");
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
  ).toHaveCount(0);
});
