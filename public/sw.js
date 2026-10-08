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

// Push notifications (opt-in on the account page). The server sends
// { title, body, url, tag } as JSON; anything else shows a generic notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(typeof data.title === "string" ? data.title : "Dota Den", {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

// Opens the notification's page: focuses an open Dota Den tab when there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin);
      // navigate() only works on tabs this worker controls; otherwise open a new window.
      if (!open) return self.clients.openWindow(target.href);
      return open
        .navigate(target.href)
        .then((w) => (w ?? open).focus())
        .catch(() => self.clients.openWindow(target.href));
    }),
  );
});
