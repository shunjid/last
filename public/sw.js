const CACHE = "last-shell-v3";
const OFFLINE_URL = "/offline.html";
const UPSTREAM_DOWN = [502, 503, 504];
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
    return;
  }
  if (request.mode !== "navigate") return;
  const offline = () => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error());
  event.respondWith(
    fetch(request)
      .then((response) => (UPSTREAM_DOWN.includes(response.status) ? offline() : response))
      .catch(offline),
  );
});
