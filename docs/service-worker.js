"use strict";

const SCOPE_PATH = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `garss-review-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v10-20261002`;
const NETWORK_TIMEOUT_MS = 8000;
const APP_SHELL = [
  "./review.html",
  "./assets/review.css",
  "./assets/review.js",
  "./assets/review/app.mjs",
  "./assets/review/candidates.mjs",
  "./assets/review/transfers.mjs",
  "./assets/review/payload.mjs",
  "./assets/review/online.mjs",
  "./assets/review/source-proposal.mjs",
  "./assets/review/fetch-controls.mjs",
  "./assets/shared/dom.mjs",
  "./assets/shared/base.css",
  "./assets/fonts/editorial-heading.ttf",
  "./assets/review/validation.mjs",
  "./assets/review/contract.mjs",
  "./assets/review/storage.mjs",
  "./assets/review/view.mjs",
  "./assets/review/routes.mjs",
  "./assets/review/pwa.mjs",
  "./assets/review/urls.mjs",
  "./manifest.webmanifest",
  "./_media/favicon.ico",
  "./_media/review-icon-192.png",
  "./_media/review-icon-512.png",
];
const CATALOG_PATHS = new Set([
  "api/v1/feed-candidates.json",
  "api/v1/rsshub-routes.json",
  "api/v1/review-schema.json",
  "api/v1/review-decisions.json",
  "api/v1/feed-health.json",
]);

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  // Preserve previously downloaded catalogs across shell upgrades. Exact URLs
  // ensure that a legacy shared cache cannot copy data from a different project.
  for (const key of await caches.keys()) {
    if (key === CACHE_NAME || !key.startsWith("garss-review-")) continue;
    const oldCache = await caches.open(key);
    for (const path of CATALOG_PATHS) {
      const url = new URL(path, self.registration.scope).href;
      if (await cache.match(url)) continue;
      const response = await oldCache.match(url);
      if (response) await cache.put(url, response).catch(() => {});
    }
  }
  await self.skipWaiting();
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function networkFirst(request) {
  const cache = await openCache();
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok && cache) {
      await cache.put(request, response.clone()).catch(() => {});
    } else if (response.status >= 500 || [408, 429].includes(response.status)) {
      const cached = cache && await cache.match(request);
      if (cached) return cached;
    }
    return response;
  } catch (error) {
    const cached = cache && await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

function staleWhileRevalidate(event) {
  const request = event.request;
  const cachePromise = openCache();
  const refresh = cachePromise.then(async (cache) => {
      const response = await fetchWithTimeout(request);
      if (response.ok && cache) await cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  event.waitUntil(refresh.then(() => {}));
  return cachePromise.then(async (cache) => {
    const cached = cache && await cache.match(request);
    return cached || (await refresh) || new Response("Offline", { status: 503 });
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE_PATH)) return;
  const relativePath = url.pathname.slice(SCOPE_PATH.length);

  if (CATALOG_PATHS.has(relativePath)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (event.request.mode === "navigate" && relativePath === "review.html") {
    event.respondWith(
      networkFirst(event.request).catch(async () =>
        (await caches.match(new URL("./review.html", self.registration.scope))) ||
        new Response("Offline", { status: 503 }),
      ),
    );
    return;
  }
  const shellUrls = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).pathname));
  if (event.request.mode !== "navigate" && shellUrls.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
