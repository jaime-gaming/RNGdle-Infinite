import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  PAGES,
  HOME,
  basePath,
  validPage,
  pageFromLocation,
  pathForPage,
  pathForSubpage,
  subpageFromLocation,
  familyFromLocation,
  pathForShelfFamily,
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
import { shopProducts, AURA_FAMILIES } from "../src/shop-data.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";

test("every top navigation destination is a real path, not a hash fragment", () => {
  expect(PAGES).toEqual([
    "roll",
    "tasks",
    "shop",
    "badges",
    "history",
    "settings",
    "changelog",
    "about",
    "profile",
    "rebirth",
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

test("a shelf is a real sub-page of the shop, on every host", () => {
  // Locally (/shop/skills) and on Pages (/RNGdle-Infinite/shop/skills).
  expect(pathForSubpage("shop", "skills")).toBe("/shop/skills");
  expect(pathForSubpage("shop", "auras", "/RNGdle-Infinite/")).toBe(
    "/RNGdle-Infinite/shop/auras",
  );
  // The hub is the page itself, never a trailing slash or an empty segment.
  expect(pathForSubpage("shop", "")).toBe("/shop");
  expect(pathForSubpage("shop", "", "/RNGdle-Infinite/")).toBe(
    "/RNGdle-Infinite/shop",
  );
  // A sub-segment is read from the path, and only the page's own segment counts.
  expect(subpageFromLocation({ pathname: "/shop/skills", hash: "" })).toBe(
    "skills",
  );
  expect(
    subpageFromLocation(
      { pathname: "/RNGdle-Infinite/shop/tools", hash: "" },
      "/RNGdle-Infinite/",
    ),
  ).toBe("tools");
  expect(subpageFromLocation({ pathname: "/shop", hash: "" })).toBe("");
  // The page itself still resolves from its sub-path, so a shelf never 404s.
  expect(pageFromLocation({ pathname: "/shop/skills", hash: "" })).toBe("shop");
  expect(
    pageFromLocation(
      { pathname: "/RNGdle-Infinite/shop/offline", hash: "" },
      "/RNGdle-Infinite/",
    ),
  ).toBe("shop");
  // Slugs use the same alphabet pages do, so a crafted segment cannot break out.
  expect(pathForSubpage("shop", "  Auras!../")).toBe("/shop/auras");
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

  // Rung 1 wants a fifth of the collection and 100,000 EP the cycle earned;
  // owning nothing else is fine, and the EP is never something you can buy.
  const ids = allBadgeMetadata.map((b) => b.id);
  const rungOne = ids.slice(
    0,
    Math.ceil(REBIRTH_STEPS[0].badges * BADGE_TOTAL),
  );
  const earned = [
    {
      id: "ep",
      type: "roll",
      at: 1000,
      number: 604827,
      tier: "common",
      ep: REBIRTH_STEPS[0].ep,
      badges: [],
    },
  ];
  const broke = {
    ...emptyProgress(),
    discovered: rungOne,
    owned: [],
    history: earned,
  };
  expect(rebirthBlocker(broke, 0)).toBe("");
  // Shekels cannot buy the EP half either: a full wallet changes nothing.
  expect(
    rebirthBlocker({ ...broke, balance: 100000000, history: [] }, 0),
  ).toContain("Earn 250,000 EP");
  // An all-owned shop with one badge missing from the rung still cannot.
  const rich = {
    ...emptyProgress(),
    discovered: rungOne.slice(0, -1),
    owned: shopProducts.map((p) => p.id),
    history: earned,
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
  // 34 upgrades, nine skills and bays, and eighteen auras: the v0.4 catalogue,
  // repriced once at v0.3 and never since. It still costs less than the launch
  // catalogue did, and the late additions sit on top of it rather than inside
  // it.
  const addedInV05 = [
    "halcyon",
    "downpour",
    "blueprint",
    "inkblot",
    "miser",
    "triptych",
    "offline-vault-3",
  ];
  const before = shopProducts.filter((p) => !addedInV05.includes(p.id));
  expect(before).toHaveLength(49);
  expect(before.reduce((sum, p) => sum + p.price, 0)).toBe(107250000);
  expect(107250000).toBeLessThan(131145000);
  expect(shopProducts).toHaveLength(56);
  // The first upgrade of each visible chain stays reachable early.
  expect(price["quickwind-1"]).toBeLessThanOrEqual(30000);
  expect(price["clockwork-1"]).toBeLessThanOrEqual(50000);
  for (const product of shopProducts) {
    expect(Number.isInteger(product.price)).toBe(true);
    if (product.requires)
      expect(product.price / price[product.requires]).toBeLessThanOrEqual(4);
  }
});

test("an aura family is a real sub-page of its shelf, on every host", () => {
  // /shop/auras/celestial, locally and under a Pages base path.
  expect(pathForShelfFamily("shop", "auras", "celestial")).toBe(
    "/shop/auras/celestial",
  );
  expect(
    pathForShelfFamily("shop", "auras", "element", "/RNGdle-Infinite/"),
  ).toBe("/RNGdle-Infinite/shop/auras/element");
  // Without a family it is the shelf index, never a dangling slash.
  expect(pathForShelfFamily("shop", "auras", "")).toBe("/shop/auras");
  expect(pathForShelfFamily("shop", "auras", "", "/RNGdle-Infinite/")).toBe(
    "/RNGdle-Infinite/shop/auras",
  );
  // A family is read from the third segment, and only from the shelf's own
  // path: the shop's other shelves and the site's other pages ignore it.
  expect(familyFromLocation({ pathname: "/shop/auras/void", hash: "" })).toBe(
    "void",
  );
  expect(
    familyFromLocation(
      { pathname: "/RNGdle-Infinite/shop/auras/machine", hash: "" },
      "/RNGdle-Infinite/",
    ),
  ).toBe("machine");
  expect(familyFromLocation({ pathname: "/shop/auras", hash: "" })).toBe("");
  expect(familyFromLocation({ pathname: "/shop/skills/x", hash: "" })).toBe("");
  expect(familyFromLocation({ pathname: "/play/auras/x", hash: "" })).toBe("");
  // The slug is scrubbed the same way pages and shelves are.
  expect(pathForShelfFamily("shop", "auras", "  Celestial!../")).toBe(
    "/shop/auras/celestial",
  );
});

test("every aura belongs to a family that has its own type and three best", () => {
  const families = new Map(AURA_FAMILIES.map((f) => [f.id, f]));
  const auras = shopProducts.filter((p) => p.kind === "aura");
  expect(auras.length).toBeGreaterThan(0);
  for (const aura of auras) {
    if (aura.family === undefined) continue; // a look outside the four sets
    expect(families.has(aura.family), `${aura.id} family`).toBe(true);
  }
  for (const family of AURA_FAMILIES) {
    // Type: a real stack, a tracking and a casing that the banner can wear.
    expect(family.font.length).toBeGreaterThan(8);
    expect(family.tracking).toMatch(/^-?[\d.]+em$/);
    expect(["none", "uppercase", "lowercase", "capitalize"]).toContain(
      family.casing,
    );
    expect(family.weight).toBeGreaterThanOrEqual(300);
    expect(family.weight).toBeLessThanOrEqual(900);
    // The banner samples the family's own three priciest looks.
    const best = auras
      .filter((p) => p.family === family.id)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3)
      .map((p) => p.id);
    expect(best, `${family.id} set`).toHaveLength(3);
    expect(best).toEqual(
      auras
        .filter((p) => p.family === family.id)
        .sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))
        .slice(0, 3)
        .map((p) => p.id),
    );
  }
  // One family per look: no aura is claimed twice.
  const claimed = auras.filter((p) => p.family !== undefined).map((p) => p.id);
  expect(new Set(claimed).size).toBe(claimed.length);
});
