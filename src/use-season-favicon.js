import { useEffect } from "react";

// CLEANUP Nov 4, 2026: delete this file with the seasonal decoration.
// The Halloween tab icon belongs to the whole decorated site, RNGween World
// included: the World renders outside the ordinary shell, so it cannot rely on
// the seasonal decoration mount. Only the icon link changes, and it is put back
// the moment the decoration ends.
export function useSeasonFavicon(enabled) {
  useEffect(() => {
    if (!enabled) return;
    const favicon = document.querySelector('link[rel="icon"]');
    const original = favicon?.getAttribute("href");
    favicon?.setAttribute(
      "href",
      `${import.meta.env.BASE_URL}favicon-halloween.svg`,
    );
    return () => {
      if (original) favicon?.setAttribute("href", original);
    };
  }, [enabled]);
}
