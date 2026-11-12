self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {});

// Persistent notifications carry the action buttons. Forward the choice to an
// open tab so the page can stop Auto-Roll or focus itself.
self.addEventListener("notificationclick", (event) => {
  const action = event.action || "click";
  event.notification.close();
  if (action === "dismiss") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: "rngdle-notification-action",
            action,
            tag: event.notification.tag,
          });
          if (action !== "stop-auto-roll" && client.focus)
            return client.focus();
        }
        if (action !== "stop-auto-roll" && self.clients.openWindow)
          return self.clients.openWindow("./");
      })
      .catch(() => {}),
  );
});
