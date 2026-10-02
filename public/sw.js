// Dota Den service worker. Deliberately minimal: it caches nothing but the offline page, so a
// new release is never hidden behind stale files. When a page can't load because the device
// is offline, it shows that page instead of the browser's error.
const OFFLINE_URL = "/offline.html";
const CACHE = "dd-offline-v2";
const OFFLINE_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, OFFLINE_ICON])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // The offline page's logo, when the network is gone.
  if (new URL(event.request.url).pathname === OFFLINE_ICON) {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match(OFFLINE_ICON)) ?? Response.error(),
      ),
    );
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
