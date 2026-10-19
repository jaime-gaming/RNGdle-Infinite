import { expect } from "@playwright/test";

export async function chooseTheme(page, theme) {
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("menuitemradio", {
      name: `${theme[0].toUpperCase()}${theme.slice(1)} theme`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menu", { name: "Appearance", exact: true }),
  ).toHaveCount(0);
}
