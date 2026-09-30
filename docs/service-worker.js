"use strict";

const CACHE_NAME = "garss-review-v1-20260930";
const APP_SHELL = [
  "./review.html",
  "./assets/review.css",
  "./assets/review.js",
  "./manifest.webmanifest",
  "./_media/favicon.ico",
  "./_media/review-icon-192.png",
  "./_media/review-icon-512.png",
];
const CATALOG_PATHS = new Set([
  "api/v1/feed-candidates.json",
  "api/v1/rsshub-routes.json",
  "api/v1/review-schema.json",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
      self.skipWaiting(),
    ]),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("garss-review-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await refresh) || new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.slice(scopePath.length);

  if (CATALOG_PATHS.has(relativePath)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirst(event.request).catch(() => caches.match(new URL("./review.html", self.registration.scope))),
    );
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
