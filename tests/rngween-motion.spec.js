import { test, expect } from "./helpers/clock.js";
import { mockSeasonClock } from "./helpers/season-clock.js";

// The explicit accessibility preference also applies when the OS has not
// requested reduced motion, both to the season and to earned aura previews.
test("the saved reduced-motion setting stills Halloween decorations and cosmetic previews", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00Z"));
  await mockSeasonClock(page, Date.parse("2026-10-28T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("rng-theme", "dark");
    localStorage.setItem(
      "rng-infinite-settings-v1",
      JSON.stringify({ reduceMotion: "on" }),
    );
  });
  await page.goto("/tasks/rngween");
  await expect(page.locator(".rngween-decor")).toHaveClass(/is-reduced-motion/);
  for (const sprite of await page
    .locator(".rngween-bat, .rngween-ghost, .rngween-spider, .rngween-flame")
    .all())
    await expect(sprite).toHaveCSS("animation-name", "none");
  for (const id of ["jack-o-glow", "phantom-veil", "witchfire", "blood-moon"]) {
    const box = page.locator(`.rngween-event [data-cosmetic="${id}"]`);
    await expect(box).toHaveAttribute("data-motion", "reduced");
    await expect(box.locator(".box-halo")).toHaveCSS("animation-name", "none");
    await expect(box.locator(".box-particles i").first()).toHaveCSS(
      "animation-name",
      "none",
    );
  }
});
