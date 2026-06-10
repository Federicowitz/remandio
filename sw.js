const CACHE_NAME = "remandio-shell-v25";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
  "./src/styles.css?v=36",
  "./src/app.js?v=26",
  "./src/lib/catalog.js?v=22",
  "./src/lib/schema.js?v=17",
  "./src/lib/storage.js?v=17"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const oldKeys = keys.filter((key) => key !== CACHE_NAME);
        return Promise.all(oldKeys.map((key) => caches.delete(key))).then(() => oldKeys.length > 0);
      })
      .then((deletedOldCaches) => self.clients.claim().then(() => deletedOldCaches))
      .then((deletedOldCaches) => {
        if (!deletedOldCaches) return;
        return self.clients
          .matchAll({ type: "window" })
          .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))));
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
