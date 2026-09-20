import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  PAGES,
  HOME,
  basePath,
  validPage,
  pageFromLocation,
  pathForPage,
  isCurrentPath,
} from "../src/router.js";
import {
  BADGE_TOTAL,
  REBIRTH_STEPS,
  REBIRTH_OPTIONAL_KINDS,
  rebirthOptionalProducts,
  rebirthRelevantPurchases,
  rebirthBlocker,
} from "../src/rebirth.js";
import { emptyProgress } from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";

test("every top navigation destination is a real path, not a hash fragment", () => {
  expect(PAGES).toEqual([
    "roll",
    "shop",
    "badges",
    "history",
    "settings",
    "changelog",
    "about",
  ]);
  expect(pathForPage("roll")).toBe("/");
  for (const page of PAGES.filter((p) => p !== HOME))
    expect(pathForPage(page)).toBe(`/${page}`);
  // A repository subpath deployment keeps the same routes under its base.
  expect(basePath("/RNGdle-Infinite/")).toBe("/RNGdle-Infinite");
  expect(pathForPage("shop", "/RNGdle-Infinite/")).toBe(
    "/RNGdle-Infinite/shop",
  );
  expect(
    pageFromLocation(
      { pathname: "/RNGdle-Infinite/badges", hash: "" },
      "/RNGdle-Infinite/",
    ),
  ).toBe("badges");
});

test("paths, legacy hashes and unknown routes all resolve without a dead end", () => {
  for (const page of PAGES)
    expect(pageFromLocation({ pathname: `/${page}`, hash: "" })).toBe(page);
  expect(pageFromLocation({ pathname: "/", hash: "" })).toBe(HOME);
  // Old #shop bookmarks keep working and are normalised to the real path.
  expect(pageFromLocation({ pathname: "/", hash: "#history" })).toBe("history");
  expect(
    pathForPage(pageFromLocation({ pathname: "/", hash: "#history" })),
  ).toBe("/history");
  // Nonsense and removed routes fall back to the roll page rather than a blank.
  for (const bad of ["/leaderboard", "/../etc", "/shop/extra/deep", "/SHOP!"])
    expect(PAGES).toContain(pageFromLocation({ pathname: bad, hash: "" }));
  expect(pageFromLocation({ pathname: "/leaderboard", hash: "" })).toBe(HOME);
  expect(validPage("nope")).toBe(HOME);
  // Re-navigating to the current page must not push a duplicate history entry.
  expect(isCurrentPath("shop", { pathname: "/shop", hash: "" })).toBe(true);
  expect(isCurrentPath("shop", { pathname: "/badges", hash: "" })).toBe(false);
});

test("static hosting ships a 404 fallback so real URLs survive a direct load", () => {
  const config = fs.readFileSync("vite.config.js", "utf8");
  expect(config).toContain("404.html");
});

test("the rebirth ladder depends on the collection alone, never on auras or tools", () => {
  expect(BADGE_TOTAL).toBe(allBadgeMetadata.length);
  expect(REBIRTH_OPTIONAL_KINDS).toContain("aura");
  // No purchase is ever part of a rung: shekels can buy the shop, not the ladder.
  const auras = shopProducts.filter((p) => p.kind === "aura").map((p) => p.id);
  for (const id of auras) expect(rebirthOptionalProducts).toContain(id);
  for (const id of ["auto-roll", "archive-lens", "offline-roller"])
    expect(rebirthOptionalProducts).toContain(id);
  expect(rebirthRelevantPurchases([...auras, "auto-roll"])).toEqual([]);

  // Rung 1 wants half the collection; owning nothing else is fine.
  const ids = allBadgeMetadata.map((b) => b.id);
  const rungOne = ids.slice(0, Math.ceil(REBIRTH_STEPS[0] * BADGE_TOTAL));
  const broke = {
    ...emptyProgress(),
    discovered: rungOne,
    owned: [],
  };
  expect(rebirthBlocker(broke, 0)).toBe("");
  // An all-owned shop with three badges missing from the rung still cannot.
  const rich = {
    ...emptyProgress(),
    discovered: rungOne.slice(0, -1),
    owned: shopProducts.map((p) => p.id),
  };
  expect(rebirthBlocker(rich, 0)).toContain(
    `Discover ${rungOne.length} badges`,
  );
});
test("light mode keeps a single source of truth for the palette", () => {
  // roll.css is imported after styles.css, so an unscoped :root palette there
  // silently overrides light mode. Theme overrides must be theme-scoped.
  const roll = fs.readFileSync("src/roll.css", "utf8");
  const rootBlock = roll.slice(roll.indexOf(":root {"), roll.indexOf("}"));
  for (const token of ["--text:", "--muted:", "--secondary:", "--border:"])
    expect(rootBlock).not.toContain(token);
  // Semantic colours are themed rather than hardcoded to dark-mode values.
  const styles = fs.readFileSync("src/styles.css", "utf8");
  for (const token of ["--danger:", "--warning:", "--rank-low:", "--scrim:"]) {
    expect(styles).toContain(token);
    expect(styles.split(token).length - 1).toBeGreaterThanOrEqual(2);
  }
  for (const [file, gone] of [
    ["src/rebirth.css", "#e05757"],
    ["src/activity.css", "#c24141"],
    ["src/offline.css", "#d97706"],
    ["src/shop.css", "#0006"],
  ])
    expect(fs.readFileSync(file, "utf8")).not.toContain(gone);
});

test("rebalanced prices keep the catalogue shape and every chain affordable", () => {
  const price = Object.fromEntries(shopProducts.map((p) => [p.id, p.price]));
  // 34 upgrades plus the nine v0.3 skills and bays, cheaper curve: the grind
  // shrank without losing content.
  expect(shopProducts).toHaveLength(43);
  const total = shopProducts.reduce((sum, p) => sum + p.price, 0);
  expect(total).toBe(96350000);
  expect(total).toBeLessThan(131145000);
  // The first upgrade of each visible chain stays reachable early.
  expect(price["quickwind-1"]).toBeLessThanOrEqual(30000);
  expect(price["clockwork-1"]).toBeLessThanOrEqual(50000);
  for (const product of shopProducts) {
    expect(Number.isInteger(product.price)).toBe(true);
    if (product.requires)
      expect(product.price / price[product.requires]).toBeLessThanOrEqual(4);
  }
});
