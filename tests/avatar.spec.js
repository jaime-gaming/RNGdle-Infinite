import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { AVATAR_LIMIT } from "../src/progress.js";

// The account's face. A logo is a picture the player uploads: it is squared,
// shrunk and stored inside the save — never uploaded anywhere — which is what
// makes it show up on the profile, in the header and on the export card, and
// what makes a device link carry it to the other browser.

const avatar = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).profile?.avatar ?? "",
    PROGRESS_KEY,
  );

// Draws a real PNG inside the page and hands the bytes back: the upload path
// is exercised with an actual image, not a stub.
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
  // Guest play is a demo, and the logo belongs to an account: no picker until
  // there is a profile to hang it on.
  await expect(page.getByTestId("avatar-upload")).toHaveCount(0);
  await expect(page.locator(".profile-title .avatar-mark")).toHaveCount(0);
  await expect(page.locator(".sign-in")).toHaveAttribute(
    "aria-label",
    "Sign up",
  );

  // The first profile a browser creates starts with the neutral icon.
  await seedProgress(page, { balance: 0, totalEarned: 0 });
  await page.goto("/profile");
  await expect(page.locator(".profile-logo .avatar-mark")).toHaveAttribute(
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
  await expect(page.locator(".sign-in")).toHaveAttribute("data-avatar", "icon");

  await page.setInputFiles('[data-testid="avatar-input"]', {
    name: "logo.png",
    mimeType: "image/png",
    buffer: await draw(page, 320, "#3b5bff"),
  });
  await expect(page.getByTestId("avatar-remove")).toBeVisible();
  await expect(page.getByTestId("avatar-upload")).toHaveText(/Replace logo/);
  await expect(page.locator(".profile-logo-note")).toContainText(
    /travels with your account/,
  );

  // The save holds a small image data URL, not the original file.
  const stored = await avatar(page);
  expect(stored.startsWith("data:image/png;base64,")).toBe(true);
  expect(stored.length).toBeLessThanOrEqual(AVATAR_LIMIT);
  // The header and the page heading wear it immediately.
  await expect(page.locator(".sign-in")).toHaveAttribute("data-avatar", "logo");
  await expect(page.locator(".page-icon")).toHaveClass(/has-logo/);
  await expect(page.locator(".profile-title .avatar-mark img")).toBeVisible();

  // A reload keeps it, because it is part of the save.
  await page.reload();
  await expect(page.getByTestId("avatar-remove")).toBeVisible();
  expect(await avatar(page)).toBe(stored);

  // Removing it hands the icon back and rewrites the save.
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

  // A 1400px photograph is far too large to store raw: the page squares and
  // shrinks it until it fits, and says so in the save.
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
  // It really is a 256px square after the shrink.
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

  // A file that is not an image never reaches the save.
  await page.setInputFiles('[data-testid="avatar-input"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("just some text"),
  });
  await expect(page.locator(".profile-logo-note")).toContainText(
    /PNG, JPEG, WebP or GIF/,
  );
  expect(await avatar(page)).toBe(stored);
});

test("the logo rides the device link to the other browser", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, { balance: 5000000, totalEarned: 5000000 });
  await pageA.goto("/profile");
  await pageA.setInputFiles('[data-testid="avatar-input"]', {
    name: "logo.png",
    mimeType: "image/png",
    buffer: await draw(pageA, 256, "#22d3ee"),
  });
  await expect(pageA.getByTestId("avatar-remove")).toBeVisible();
  const stored = await avatar(pageA);

  // Hand-link, because it needs no relay at all: the code carries the save,
  // logo included.
  await pageA.goto("/settings/link");
  await pageA.locator(".sync-hand summary").click();
  await pageA.getByTestId("peer-code-copy").click();
  const code = await pageA.getByTestId("peer-code-field").inputValue();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/settings/link");
  await pageB.locator(".sync-hand summary").click();
  await pageB.getByTestId("peer-code-field").fill(code);
  await pageB.getByTestId("peer-code-adopt").click();
  await expect
    .poll(async () => (await avatar(pageB)).length, { timeout: 10000 })
    .toBe(stored.length);
  expect(await avatar(pageB)).toBe(stored);

  await pageB.goto("/profile");
  await expect(pageB.locator(".sign-in")).toHaveAttribute(
    "data-avatar",
    "logo",
  );
  await expect(pageB.locator(".page-icon")).toHaveClass(/has-logo/);

  await contextB.close();
  await contextA.close();
});
