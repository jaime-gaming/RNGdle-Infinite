import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { emptyProgress, parseAndRepairProgress } from "../src/progress.js";
import {
  shareCardData,
  encodeShareCard,
  decodeShareCard,
} from "../src/profile-card.js";
import { rebirthSurplus } from "../src/rebirth.js";
import { seedProgress } from "./helpers/progress.js";

test("pinned Déjà Vu survives profile and shared-card encoding", () => {
  const progress = {
    ...emptyProgress(),
    profile: { id: "p", username: "Lucky", createdAt: 1 },
    history: [
      {
        type: "roll",
        id: "first",
        number: 123,
        tier: "common",
        ep: 10,
        at: 1000,
      },
      {
        type: "roll",
        id: "repeat",
        number: 123,
        tier: "common",
        ep: 10,
        at: 2000,
      },
    ],
    bookmarks: ["first", "repeat"],
  };
  const card = decodeShareCard(encodeShareCard(shareCardData(progress)));
  expect(card.pins[0]).not.toHaveProperty("dejaVu");
  expect(card.pins[1].dejaVu).toBe(true);
});

test("advanced resets reward surplus without cutting accumulated dividends on reload", () => {
  expect(rebirthSurplus(100_000_000, 0).bankedBonus).toBe(0.1);
  expect(rebirthSurplus(100_000_000, 0, "prestige").bankedBonus).toBe(0.2);
  expect(rebirthSurplus(100_000_000, 0, "rollback").bankedBonus).toBeCloseTo(
    0.3,
  );
  const repaired = parseAndRepairProgress(
    JSON.stringify({ ...emptyProgress(), surplusBanked: 240 }),
  );
  expect(repaired.progress.surplusBanked).toBe(240);
});

test("Cloud Account opens from its scrollable Settings section and the top Profile button opens the profile", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: { id: "p", username: "Lucky", createdAt: 1 },
  });
  await page.goto("/settings");
  await waitForApp(page);
  await expect(page.locator(".cloud-account")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Settings sections" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Cloud Account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/cloud-account$/);
  await expect(page.locator(".cloud-account")).toBeVisible();
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".cloud-account")).toBeVisible();
  await page.locator(".sign-in").click();
  await expect(page).toHaveURL(/\/profile\/Lucky$/);
});

test("aura reveals distinguish moving digits by brightness only", async ({
  page,
}) => {
  await page.goto("/shop/auras/celestial");
  await waitForApp(page);
  const { shopProducts } = await import("../src/shop-data.js");
  const auras = shopProducts.filter((p) => p.kind === "aura").map((p) => p.id);
  for (const theme of ["light", "dark"]) {
    const results = await page.evaluate(
      ({ auras, theme }) => {
        document.documentElement.dataset.theme = theme;
        return auras.map((aura) => {
          const box = document.createElement("div");
          box.className = "number-box number-artifact is-spinning tier-godly";
          box.dataset.cosmetic = aura;
          box.dataset.dejaVu = "true";
          box.innerHTML =
            '<span class="number-box-content"><span class="artifact-digits"><span class="artifact-digit">1</span><span class="artifact-digit is-scrambling">2</span></span></span>';
          document.body.append(box);
          const [landed, moving] = [
            ...box.querySelectorAll(".artifact-digit"),
          ].map((el) => {
            const style = getComputedStyle(el);
            return [
              style.webkitTextFillColor,
              style.backgroundColor,
              style.textDecorationLine,
              style.boxShadow,
              style.opacity,
            ];
          });
          box.remove();
          return { aura, landed, moving };
        });
      },
      { auras, theme },
    );
    expect(results.length).toBeGreaterThan(10);
    for (const { landed, moving } of results) {
      // Only brightness changes; no background, underline or box is added.
      expect(moving.slice(0, 4)).toEqual(landed.slice(0, 4));
      expect(Number(moving[4])).toBeLessThan(Number(landed[4]));
      expect(moving[1]).toBe("rgba(0, 0, 0, 0)");
      expect(moving[2]).toBe("none");
    }
  }
});
