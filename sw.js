const CACHE_NAME = "remandio-shell-v28";
const APP_SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./assets/icon-192.svg", "./assets/icon-512.svg",
  "./src/styles.css?v=37", "./src/app.js?v=29",
  "./src/lib/catalog.js?v=25", "./src/lib/schema.js?v=19",
  "./src/lib/storage.js?v=19", "./src/lib/import-text.js?v=1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("remandio-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const shellUrls = APP_SHELL.map((path) => new URL(path, self.registration.scope).href);
  if (event.request.mode !== "navigate" && !shellUrls.includes(event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") {
      const index = await cache.match(new URL("./index.html", self.registration.scope).href);
      if (index) return index;
    }
    return fetch(event.request);
  })());
});
