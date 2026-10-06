/* Installability hook for the home-screen app. Deliberately a pass-through:
   it registers a fetch handler (part of the install criteria on some
   browsers) but never caches, so the game always loads exactly what the
   server ships and dev/HMR behaviour is untouched. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {});
