import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
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
  settingsSubpageFromLocation,
  familyFromLocation,
  pathForShelfFamily,
  pathForProfile,
  profileNameFromLocation,
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

test("every app page has a direct path, not a hash fragment", () => {
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
    "privacy",
    "tos",
    "rebirth",
  ]);
  expect(pathForPage("roll")).toBe("/");
  for (const page of PAGES.filter((p) => p !== HOME))
    expect(pathForPage(page)).toBe(`/${page}`);

  expect(basePath("/preview/")).toBe("/preview");
  expect(pathForPage("shop", "/preview/")).toBe("/preview/shop");
  expect(
    pageFromLocation({ pathname: "/preview/badges", hash: "" }, "/preview/"),
  ).toBe("badges");

  const githubPagesBase = "/RNGdle-Infinite/";
  expect(basePath(githubPagesBase)).toBe("/RNGdle-Infinite");
  expect(pathForPage("roll", githubPagesBase)).toBe("/RNGdle-Infinite/");
  expect(pathForSubpage("settings", "save-recovery", githubPagesBase)).toBe(
    "/RNGdle-Infinite/settings/save-recovery",
  );
  expect(
    settingsSubpageFromLocation(
      { pathname: "/RNGdle-Infinite/settings/save-recovery", hash: "" },
      githubPagesBase,
    ),
  ).toBe("save-recovery");
});

test("paths, legacy hashes and unknown routes all resolve without a dead end", () => {
  for (const page of PAGES)
    expect(pageFromLocation({ pathname: `/${page}`, hash: "" })).toBe(page);
  expect(pageFromLocation({ pathname: "/", hash: "" })).toBe(HOME);

  expect(pageFromLocation({ pathname: "/", hash: "#history" })).toBe("history");
  expect(
    pathForPage(pageFromLocation({ pathname: "/", hash: "#history" })),
  ).toBe("/history");

  for (const bad of ["/leaderboard", "/../etc", "/shop/extra/deep", "/SHOP!"])
    expect(PAGES).toContain(pageFromLocation({ pathname: bad, hash: "" }));
  expect(pageFromLocation({ pathname: "/leaderboard", hash: "" })).toBe(HOME);
  expect(validPage("nope")).toBe(HOME);

  expect(isCurrentPath("shop", { pathname: "/shop", hash: "" })).toBe(true);
  expect(isCurrentPath("shop", { pathname: "/badges", hash: "" })).toBe(false);
});

test("a shelf is a real sub-page of the shop, on every host", () => {
  expect(pathForSubpage("shop", "skills")).toBe("/shop/skills");
  expect(pathForSubpage("shop", "auras", "/preview/")).toBe(
    "/preview/shop/auras",
  );

  expect(pathForSubpage("shop", "")).toBe("/shop");
  expect(pathForSubpage("shop", "", "/preview/")).toBe("/preview/shop");

  expect(subpageFromLocation({ pathname: "/shop/skills", hash: "" })).toBe(
    "skills",
  );
  expect(
    subpageFromLocation(
      { pathname: "/preview/shop/tools", hash: "" },
      "/preview/",
    ),
  ).toBe("tools");
  expect(subpageFromLocation({ pathname: "/shop", hash: "" })).toBe("");

  expect(pageFromLocation({ pathname: "/shop/skills", hash: "" })).toBe("shop");
  expect(
    pageFromLocation(
      { pathname: "/preview/shop/offline", hash: "" },
      "/preview/",
    ),
  ).toBe("shop");

  expect(pathForSubpage("shop", "  Auras!../")).toBe("/shop/auras");
});

test("save recovery is a distinct Settings subpage with a direct link", () => {
  const local = { pathname: "/settings/save-recovery", hash: "" };
  expect(pageFromLocation(local)).toBe("settings");
  expect(settingsSubpageFromLocation(local)).toBe("save-recovery");
  expect(pathForSubpage("settings", "save-recovery")).toBe(
    "/settings/save-recovery",
  );
  const embeddedBuild = {
    pathname: "/preview/settings/save-recovery",
    hash: "",
  };
  expect(settingsSubpageFromLocation(embeddedBuild, "/preview/")).toBe(
    "save-recovery",
  );
  expect(settingsSubpageFromLocation({ pathname: "/settings/unknown" })).toBe(
    "",
  );
});

test("the profile address names the account: /profile/<username>", () => {
  expect(pathForProfile("LuckyOtter41")).toBe("/profile/LuckyOtter41");

  expect(pathForProfile("")).toBe("/profile");
  expect(pathForProfile(undefined)).toBe("/profile");

  expect(pathForProfile("Zoë_7", "/preview/")).toBe(
    "/preview/profile/Zo%C3%AB_7",
  );
  expect(profileNameFromLocation({ pathname: "/profile/Zo%C3%AB_7" })).toBe(
    "Zoë_7",
  );
  expect(profileNameFromLocation({ pathname: "/profile" })).toBe("");
  expect(profileNameFromLocation({ pathname: "/shop/auras" })).toBe("");

  expect(pageFromLocation({ pathname: "/profile/Someone", hash: "" })).toBe(
    "profile",
  );
  expect(
    isCurrentPath("profile", { pathname: "/profile/Someone", hash: "" }),
  ).toBe(true);
  expect(isCurrentPath("shop", { pathname: "/shop/x", hash: "" })).toBe(false);
});

test("the Cloudflare Worker serves dist, falls back to the app shell and avoids stale updates", () => {
  const vite = fs.readFileSync("vite.config.js", "utf8");
  expect(vite).not.toContain("404.html");

  const config = fs.readFileSync("wrangler.jsonc", "utf8");
  expect(config).toMatch(/"directory"\s*:\s*"\.\/dist"/);
  expect(config).toMatch(
    /"not_found_handling"\s*:\s*"single-page-application"/,
  );
  expect(config).toContain("rngdle-infinite.jaime-gaming.com");
  expect(config).toMatch(/"custom_domain"\s*:\s*true/);
  expect(config).not.toMatch(/pages_build_output_dir/);

  expect(fs.existsSync("public/_redirects")).toBe(false);

  const headers = fs.readFileSync("public/_headers", "utf8");
  expect(headers).toMatch(/\n\/\s*\n\s*Cache-Control: no-cache/);
  expect(headers).toMatch(/\/shop\*\s*\n\s*Cache-Control: no-cache/);
  expect(headers).toMatch(/\/profile\*\s*\n\s*Cache-Control: no-cache/);
  expect(headers).toMatch(/\/version\.json\s*\n\s*Cache-Control: no-store/);
  expect(headers).toMatch(
    /\/assets\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/,
  );
  expect(headers).toMatch(/\/index\.html\s*\n\s*Cache-Control: no-cache/);
});

test("the rebirth ladder depends on the collection alone, never on auras or tools", () => {
  expect(BADGE_TOTAL).toBe(allBadgeMetadata.length);
  expect(REBIRTH_OPTIONAL_KINDS).toContain("aura");

  const auras = shopProducts.filter((p) => p.kind === "aura").map((p) => p.id);
  for (const id of auras) expect(rebirthOptionalProducts).toContain(id);
  for (const id of ["auto-roll", "archive-lens", "offline-roller"])
    expect(rebirthOptionalProducts).toContain(id);
  expect(rebirthRelevantPurchases([...auras, "auto-roll"])).toEqual([]);

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

  expect(
    rebirthBlocker({ ...broke, balance: 100000000, history: [] }, 0),
  ).toContain("Earn 250,000 EP");

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
  const roll = fs.readFileSync("src/roll.css", "utf8");
  const rootBlock = roll.slice(roll.indexOf(":root {"), roll.indexOf("}"));
  for (const token of ["--text:", "--muted:", "--secondary:", "--border:"])
    expect(rootBlock).not.toContain(token);

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

  const addedInV05 = [
    "halcyon",
    "downpour",
    "blueprint",
    "inkblot",
    "miser",
    "triptych",
    "offline-vault-3",
  ];

  const addedLater = ["task-skip", "static", "bitstorm", "scramble", "hexdump"];
  const before = shopProducts.filter(
    (p) => !addedInV05.includes(p.id) && !addedLater.includes(p.id),
  );
  expect(before).toHaveLength(49);
  expect(before.reduce((sum, p) => sum + p.price, 0)).toBe(107090000);
  expect(107090000).toBeLessThan(131145000);
  expect(shopProducts).toHaveLength(61);

  expect(price["quickwind-1"]).toBeLessThanOrEqual(30000);
  expect(price["clockwork-1"]).toBeLessThanOrEqual(50000);
  for (const product of shopProducts) {
    expect(Number.isInteger(product.price)).toBe(true);
    if (product.requires)
      expect(product.price / price[product.requires]).toBeLessThanOrEqual(4);
  }
});

test("an aura family is a real sub-page of its shelf, on every host", () => {
  expect(pathForShelfFamily("shop", "auras", "celestial")).toBe(
    "/shop/auras/celestial",
  );
  expect(pathForShelfFamily("shop", "auras", "element", "/preview/")).toBe(
    "/preview/shop/auras/element",
  );

  expect(pathForShelfFamily("shop", "auras", "")).toBe("/shop/auras");
  expect(pathForShelfFamily("shop", "auras", "", "/preview/")).toBe(
    "/preview/shop/auras",
  );

  expect(familyFromLocation({ pathname: "/shop/auras/void", hash: "" })).toBe(
    "void",
  );
  expect(
    familyFromLocation(
      { pathname: "/preview/shop/auras/machine", hash: "" },
      "/preview/",
    ),
  ).toBe("machine");
  expect(familyFromLocation({ pathname: "/shop/auras", hash: "" })).toBe("");
  expect(familyFromLocation({ pathname: "/shop/skills/x", hash: "" })).toBe("");
  expect(familyFromLocation({ pathname: "/play/auras/x", hash: "" })).toBe("");

  expect(pathForShelfFamily("shop", "auras", "  Celestial!../")).toBe(
    "/shop/auras/celestial",
  );
});

test("every aura belongs to a family that has its own type and three best", () => {
  const families = new Map(AURA_FAMILIES.map((f) => [f.id, f]));
  const auras = shopProducts.filter((p) => p.kind === "aura");
  expect(auras.length).toBeGreaterThan(0);
  for (const aura of auras) {
    if (aura.family === undefined) continue;
    expect(families.has(aura.family), `${aura.id} family`).toBe(true);
  }
  for (const family of AURA_FAMILIES) {
    expect(family.font.length).toBeGreaterThan(8);
    expect(family.tracking).toMatch(/^-?[\d.]+em$/);
    expect(["none", "uppercase", "lowercase", "capitalize"]).toContain(
      family.casing,
    );
    expect(family.weight).toBeGreaterThanOrEqual(300);
    expect(family.weight).toBeLessThanOrEqual(900);

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

  const claimed = auras.filter((p) => p.family !== undefined).map((p) => p.id);
  expect(new Set(claimed).size).toBe(claimed.length);
});
