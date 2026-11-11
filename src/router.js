export const PAGES = [
  "roll",
  "tasks",
  "pass",
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
];
export const HOME = "roll";

export function basePath(base = import.meta.env?.BASE_URL ?? "/") {
  const trimmed = String(base || "/").replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function validPage(name) {
  return PAGES.includes(name) ? name : HOME;
}

export function pageFromLocation(location, base) {
  const prefix = basePath(base);
  const hash = String(location.hash || "").replace(/^#/, "");
  if (hash && PAGES.includes(hash)) return hash;
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const segment = path.split("/").filter(Boolean)[0] ?? "";

  return PAGES.includes(segment) ? segment : HOME;
}

export function subpageFromLocation(location, base) {
  const prefix = basePath(base);
  let path = String(location.pathname || "/");
  if (prefix && path.toLowerCase().startsWith(prefix.toLowerCase()))
    path = path.slice(prefix.length);
  const [, second = ""] = path.split("/").filter(Boolean);
  return second.toLowerCase();
}

export function settingsSubpageFromLocation(location, base) {
  if (pageFromLocation(location, base) !== "settings") return "";
  const subpage = subpageFromLocation(location, base);
  return ["save-recovery", "cloud-account"].includes(subpage) ? subpage : "";
}

export function pathForSubpage(page, sub, base) {
  const prefix = basePath(base);
  const name = validPage(page);

  const clean = String(sub || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const suffix = clean ? `/${clean}` : "";
  return `${prefix}/${name}${suffix}`.replace(/\/{2,}/g, "/");
}

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

  return `${prefix}/${name === HOME ? "" : name}`.replace(/\/{2,}/g, "/");
}

export function pathForProfile(username, base) {
  const prefix = basePath(base);
  const name = typeof username === "string" ? username.trim() : "";
  return `${prefix}/profile${name ? `/${encodeURIComponent(name)}` : ""}`.replace(
    /\/{2,}/g,
    "/",
  );
}

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

export function isCurrentPath(page, location, base) {
  const target = pathForPage(page, base);
  const current = String(location.pathname || "/");
  if (location.hash) return false;
  if (page === "profile" && current.startsWith(`${target}/`)) return true;
  return current === target || current === target.replace(/\/$/, "");
}
