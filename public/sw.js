// LAST service worker. It exists so notifications can be shown on mobile
// browsers, which only allow ServiceWorkerRegistration.showNotification().
// There is deliberately no fetch handler: nothing here is cached or offline.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const sessionId = event.notification.data && event.notification.data.sessionId;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("focus" in client) await client.focus();
        client.postMessage({ sessionId, type: "open-session" });
        return;
      }
      const target = sessionId ? `/?session=${encodeURIComponent(sessionId)}` : "/";
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
