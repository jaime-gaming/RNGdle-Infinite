// The app's own icon changes for the sale day, and changes back the moment the
// day is over. Only the links already in the document head move: no file is
// rewritten, nothing is cached, and a browser that ignores a manifest swap
// still picks up the favicon and the touch icon.
import { basePath } from "./router.js";

const NORMAL = {
  icon: "favicon.svg",
  apple: "apple-touch-icon.png",
  manifest: "manifest.webmanifest",
  themeColor: "#fafafa",
};
const SALE = {
  icon: "favicon-sale.svg",
  apple: "apple-touch-icon-sale.png",
  manifest: "manifest-sale.webmanifest",
  themeColor: "#050505",
};

// Every head tag the sale is allowed to wear, and the attribute it writes.
export const SALE_BRANDING_TARGETS = [
  ['link[rel="icon"]', "href", "icon"],
  ['link[rel="apple-touch-icon"]', "href", "apple"],
  ['link[rel="manifest"]', "href", "manifest"],
  ['meta[name="theme-color"]', "content", "themeColor"],
];

function url(file) {
  const base = basePath(import.meta.env?.BASE_URL ?? "/");
  return `${base}/${file}`.replace(/\/{2,}/g, "/");
}

// True while the head is wearing the sale icon.
export function applySaleBranding(active, doc = globalThis.document) {
  if (!doc?.querySelector) return false;
  const skin = active ? SALE : NORMAL;
  let changed = false;
  for (const [selector, attribute, key] of SALE_BRANDING_TARGETS) {
    const element = doc.querySelector(selector);
    if (!element) continue;
    const value = key === "themeColor" ? skin[key] : url(skin[key]);
    if (element.getAttribute(attribute) === value) continue;
    element.setAttribute(attribute, value);
    changed = true;
  }
  return changed;
}
