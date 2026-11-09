import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { AVATAR_LIMIT } from "../src/progress.js";
import { readSavedProgress } from "./helpers/save.js";

const avatar = async (page) =>
  (await readSavedProgress(page))?.profile?.avatar ?? "";

async function draw(page, size, color) {
  const dataUrl = await page.evaluate(
    ([side, fill]) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, side, side);
      return canvas.toDataURL("image/png");
    },
    [size, color],
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("a guest has no logo, and sign-up is the way to get one", async ({
  page,
}) => {
  await page.goto("/profile");
  await waitForApp(page);

  await expect(page.getByTestId("avatar-upload")).toHaveCount(0);
  await expect(page.locator(".profile-title .avatar-mark")).toHaveCount(0);
  await expect(page.locator(".sign-in")).toHaveAttribute(
    "aria-label",
    "Sign in",
  );

  await seedProgress(page, { balance: 0, totalEarned: 0 });
  await page.goto("/profile");
  await waitForApp(page);
  await expect(page.locator(".profile-title .avatar-mark")).toHaveAttribute(
    "data-avatar",
    "icon",
  );
  await expect(page.getByTestId("avatar-upload")).toBeVisible();
  await expect(page.getByTestId("avatar-remove")).toHaveCount(0);
});

test("an uploaded logo lands in the save, the header and the profile", async ({
  page,
}) => {
  await seedProgress(page, { balance: 5000000, totalEarned: 5000000 });
  await page.goto("/profile");
  await waitForApp(page);
  await expect(page.locator(".sign-in")).toHaveAttribute("data-avatar", "icon");

  await page.setInputFiles('[data-testid="avatar-input"]', {
    name: "logo.png",
    mimeType: "image/png",
    buffer: await draw(page, 320, "#3b5bff"),
  });
  await expect(page.getByTestId("avatar-remove")).toBeVisible();
  await expect(page.getByTestId("avatar-upload")).toHaveAccessibleName(
    "Replace logo",
  );
  await expect(page.locator(".profile-logo-line [role=status]")).toContainText(
    /Logo saved\./,
  );

  const stored = await avatar(page);
  expect(stored.startsWith("data:image/png;base64,")).toBe(true);
  expect(stored.length).toBeLessThanOrEqual(AVATAR_LIMIT);

  await expect(page.locator(".sign-in")).toHaveAttribute("data-avatar", "logo");
  await expect(page.locator(".page-icon")).toHaveClass(/has-logo/);
  await expect(page.locator(".profile-title .avatar-mark img")).toBeVisible();

  await page.reload();
  await waitForApp(page);
  await expect(page.getByTestId("avatar-remove")).toBeVisible();
  expect(await avatar(page)).toBe(stored);

  await page.getByTestId("avatar-remove").click();
  await expect(page.getByTestId("avatar-remove")).toHaveCount(0);
  await expect(page.locator(".sign-in")).toHaveAttribute("data-avatar", "icon");
  expect(await avatar(page)).toBe("");
});

test("a huge picture is shrunk instead of refused, and rubbish is refused", async ({
  page,
}) => {
  await seedProgress(page, { balance: 5000000, totalEarned: 5000000 });
  await page.goto("/profile");
  await waitForApp(page);

  await page.setInputFiles('[data-testid="avatar-input"]', {
    name: "photo.png",
    mimeType: "image/png",
    buffer: await draw(page, 1400, "#d9a441"),
  });
  await expect(page.getByTestId("avatar-remove")).toBeVisible({
    timeout: 15000,
  });
  const stored = await avatar(page);
  expect(stored.length).toBeLessThanOrEqual(AVATAR_LIMIT);
  expect(stored.length).toBeGreaterThan(1000);

  const size = await page.evaluate(
    (source) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
        image.onerror = () => resolve(null);
        image.src = source;
      }),
    stored,
  );
  expect(size).toEqual([256, 256]);

  await page.setInputFiles('[data-testid="avatar-input"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("just some text"),
  });
  await expect(page.locator(".profile-logo-line [role=status]")).toContainText(
    /That image could not be used/,
  );
  expect(await avatar(page)).toBe(stored);
});
