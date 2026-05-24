// ==============================================
// Service Worker - Test Prep App
// Increment CACHE_VERSION to force cache refresh
// ==============================================

const CACHE_VERSION = "v14";
const CACHE_NAME    = `study-pwa-${CACHE_VERSION}`;

// Files to pre-cache for offline support
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./assets/icon.svg",
];

// Install: pre-cache all listed assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // Replace old SW immediately
});

// Activate: delete all previous cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // Take control of all clients immediately
});

// Fetch: cache-first, fall back to network
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).catch(() => {
        // Offline navigation: serve index.html as fallback
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
