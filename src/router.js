// Real URLs instead of hash fragments: /shop, /badges, /history, /settings.
// The site is also published to a repository subpath on GitHub Pages, so every
// route is resolved against the build-time base rather than the domain root.
export const PAGES = [
  "roll",
  "shop",
  "badges",
  "history",
  "settings",
  "changelog",
  "about",
  "profile",
  "rebirth",
];
export const HOME = "roll";

// import.meta.env.BASE_URL is "/" locally and "/RNGdle-Infinite/" on Pages.
export function basePath(base = import.meta.env?.BASE_URL ?? "/") {
  const trimmed = String(base || "/").replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function validPage(name) {
  return PAGES.includes(name) ? name : HOME;
}

// Accepts a full URL, a pathname, or a legacy "#shop" fragment.
export function pageFromLocation(location, base) {
  const prefix = basePath(base);
  const hash = String(location.hash || "").replace(/^#/, "");
  if (hash && PAGES.includes(hash)) return hash;
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const segment = path.split("/").filter(Boolean)[0] ?? "";
  // Unknown paths fall back to the roll page rather than a dead end.
  return PAGES.includes(segment) ? segment : HOME;
}

// A page can own sub-pages: /shop/skills, /shop/auras and so on. The
// sub-segment is read from the address bar and resolved against the same
// build-time base, so a shelf link works locally and on Pages alike.
export function subpageFromLocation(location, base) {
  const prefix = basePath(base);
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const [, second = ""] = path.split("/").filter(Boolean);
  return second.toLowerCase();
}

export function pathForSubpage(page, sub, base) {
  const prefix = basePath(base);
  const name = validPage(page);
  // Sub-pages share the page's own slug alphabet: [a-z0-9-].
  const clean = String(sub || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const suffix = clean ? `/${clean}` : "";
  return `${prefix}/${name}${suffix}`.replace(/\/{2,}/g, "/");
}

export function pathForPage(page, base) {
  const prefix = basePath(base);
  const name = validPage(page);
  // basePath("/") is "", so the home route must not collapse into "//".
  return `${prefix}/${name === HOME ? "" : name}`.replace(/\/{2,}/g, "/");
}

// True when the address bar already points at this page, so history is not
// filled with duplicate entries when a component re-navigates to itself.
export function isCurrentPath(page, location, base) {
  const target = pathForPage(page, base);
  const current = String(location.pathname || "/");
  return (
    (current === target || current === target.replace(/\/$/, "")) &&
    !location.hash
  );
}
