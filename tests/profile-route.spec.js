import { test, expect } from "@playwright/test";
import { seedProgress, testProfile } from "./helpers/progress.js";

test("the profile page lives at /profile/<username> and follows the account", async ({
  page,
}) => {
  // A guest lands on the bare page: there is no name to show yet.
  await page.goto("/profile");
  await expect(page.getByText("Start saving your progress")).toBeVisible();
  await expect(page.getByTestId("cloud-migration-note")).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile$/);
  // Signing up rewrites the address to the new name without a new entry.
  await page.getByLabel("Username").fill("LuckyOtter41");
  await page.getByRole("button", { name: /Start saving my progress/ }).click();
  await expect(page).toHaveURL(/\/profile\/LuckyOtter41$/);
  await expect(page.getByTestId("cloud-migration-note")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/profile/);
});

test("a direct /profile/<other-name> link stays on that public profile", async ({
  page,
}) => {
  await seedProgress(page, { balance: 10, totalEarned: 10 });
  await page.goto("/profile/SomebodyElse");
  await expect(
    page.getByRole("heading", { name: "SomebodyElse" }),
  ).toBeVisible();
  await expect(page.getByText("Public profile unavailable")).toBeVisible();
  await expect(page).toHaveURL(/\/profile\/SomebodyElse$/);

  // The header button still opens this browser's own named profile.
  await page.goto("/");
  await page.locator(".sign-in").click();
  await expect(page).toHaveURL(new RegExp(`/profile/${testProfile.username}$`));
  await expect(
    page.getByRole("heading", {
      name: `Your profile, ${testProfile.username}`,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/profile/${testProfile.username}$`));
});
