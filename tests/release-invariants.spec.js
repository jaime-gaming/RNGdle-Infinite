import fs from "node:fs";
import { expect, test } from "./helpers/clock.js";

const read = (file) => fs.readFileSync(`src/${file}`, "utf8");

test("companion skin previews keep the mystery option disabled and visible", () => {
  const shelf = read("components/PetShelf.jsx");
  const skinCss = read("pet-skin-picker.css");
  expect(shelf).toContain("<PetSkinPicker");
  expect(shelf).toContain('label: "???"');
  expect(shelf).toContain("pet-skin-description");
  expect(shelf).toContain("has-skin-view");
  expect(skinCss).toContain("grid-template-columns: minmax(145px, 0.65fr)");
  expect(shelf).toContain('option.id === "mystery" ||');
  expect(shelf).toContain("pet-skin-toggle icon-button");
  expect(shelf).toContain("is-skin-view");
  expect(shelf).toContain(
    'className={`pet-body ${skinView === pet.id ? "is-skin-view" : ""}`}',
  );
  expect(shelf).not.toContain("pet-skin-close");
  expect(shelf).toContain("preview only");
  expect(skinCss).toContain(".pet-figure.is-mystery-silhouette");
});

test("pass premium purchase is routed through Shop, and More owns the transaction", () => {
  const pass = read("components/BattlePass.jsx");
  const shop = read("components/Shop.jsx");
  expect(pass).toContain('navigate?.("shop", null, "more")');
  expect(pass).not.toContain('type: "buy-pass-premium"');
  expect(shop).toContain('perform("buy-pass-premium")');
  expect(shop).toContain("BATTLE_PASS_PREMIUM_PRICE");
  expect(read("shop-data.js")).toContain('id: "more"');
});

test("pass UI shows the season end, avoids a Season Status label and uses a compact shop item", () => {
  const pass = read("components/BattlePass.jsx");
  const shopCss = read("shop.css");
  const changelog = read("changelog.js");
  expect(pass).not.toContain("Season status");
  expect(pass).toContain("passDateLabel(season.end)");
  expect(shopCss).toContain(".shop-more-pass {");
  expect(read("components/Shop.jsx")).toContain(
    'shop-tile shop-more-pass ${premiumPassOwned ? "is-owned" : ""}',
  );
  expect(changelog).toContain('date: "2026-11-18"');
});

test("the pass theme and skin transitions respect reduced motion", () => {
  const styles = read("components/battle-pass.css");
  const skinStyles = read("pet-skin-picker.css");
  expect(styles).toContain('data-pass-theme="first-light-pass"');
  expect(styles).toContain("prefers-reduced-motion: reduce");
  expect(skinStyles).toContain("@media (prefers-reduced-motion: reduce)");
});

test("the loader uses the game infinity mark and a blurred traveling light", () => {
  const loader = read("components/LoadingScreen.jsx");
  const loaderCss = read("loading-screen.css");
  expect(loader).toContain("import { InfinityMark }");
  expect(loader).toContain("loading-light-halo");
  expect(loader).toContain("loading-logo-back");
  expect(loader).toContain("loading-logo-glow");
  expect(loaderCss).toContain("filter: blur(3.1px)");
  expect(loaderCss).toContain("prefers-reduced-motion: reduce");
});

test("service issues stack together and maintenance uses the 24-hour handoff", () => {
  const banner = read("components/StatusBanner.jsx");
  const settings = read("components/Settings.jsx");
  const status = read("status-page.js");
  const footer = read("settings-footer.css");
  expect(footer).toContain("grid-template-columns: minmax(0, 1fr)");
  expect(status).toContain("maintenanceSettingsVisible");
  expect(status).toContain("serviceIssuesFromSummary");
  expect(banner).toContain("visible.map");
  expect(banner).toContain("maintenanceNoticeVisible");
  expect(settings).toContain("longRangeMaintenance.map");
  expect(settings).toContain('data-testid="settings-maintenance"');
  expect(settings).toContain('data-testid="settings-internal-version"');
  expect(
    settings.indexOf('data-testid="settings-internal-version"'),
  ).toBeLessThan(settings.indexOf('className="settings-maintenance-list"'));
});
