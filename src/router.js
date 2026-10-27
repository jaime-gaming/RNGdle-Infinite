// Real URLs instead of hash fragments: /shop, /badges, /history, /settings.
// The site is also published to a repository subpath on GitHub Pages, so every
// route is resolved against the build-time base rather than the domain root.
export const PAGES = [
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

// A shelf can own sub-pages of its own: /shop/auras/celestial. The shelf is
// the second segment and the family the third, so a family page is a real
// address a player can bookmark, share or go back to. Only the shelf asked
// for owns families, so /shop/skills/x is the skills shelf with nothing
// dangling after it.
export function familyFromLocation(location, base, shelf = "auras") {
  const prefix = basePath(base);
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const [page = "", sub = "", group = "", nested = ""] = path
    .split("/")
    .filter(Boolean);
  if (page !== validPage("shop") || sub.toLowerCase() !== shelf) return "";
  const family = group === "special" && nested ? nested : group;
  return family.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function pathForShelfFamily(page, shelf, family, base) {
  const prefix = basePath(base);
  const name = validPage(page);
  const clean = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
  const familyId = clean(family);
  const parts = [clean(shelf), familyId].filter(Boolean);
  return `${prefix}/${name}${parts.length ? `/${parts.join("/")}` : ""}`.replace(
    /\/{2,}/g,
    "/",
  );
}

export function pathForPage(page, base) {
  const prefix = basePath(base);
  const name = validPage(page);
  // basePath("/") is "", so the home route must not collapse into "//".
  return `${prefix}/${name === HOME ? "" : name}`.replace(/\/{2,}/g, "/");
}

// The profile lives at /profile/<username>: the name is part of the address
// so a profile can be linked to, and so anything social added later already
// has a place to point at. Guests (no profile yet) land on the bare /profile.
// The name is kept as typed — case and all — and only URL-escaped.
export function pathForProfile(username, base) {
  const prefix = basePath(base);
  const name = typeof username === "string" ? username.trim() : "";
  return `${prefix}/profile${name ? `/${encodeURIComponent(name)}` : ""}`.replace(
    /\/{2,}/g,
    "/",
  );
}

// The username named in a /profile/<username> address, or "".
export function profileNameFromLocation(location, base) {
  const prefix = basePath(base);
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const [page = "", second = ""] = path.split("/").filter(Boolean);
  if (page !== "profile" || !second) return "";
  try {
    return decodeURIComponent(second);
  } catch {
    return "";
  }
}

// True when the address bar already points at this page, so history is not
// filled with duplicate entries when a component re-navigates to itself.
// /profile/<anyone> counts as the profile page; the name is checked by the
// page itself, which rewrites the address to the account that is signed in.
export function isCurrentPath(page, location, base) {
  const target = pathForPage(page, base);
  const current = String(location.pathname || "/");
  if (location.hash) return false;
  if (page === "profile" && current.startsWith(`${target}/`)) return true;
  return current === target || current === target.replace(/\/$/, "");
}
