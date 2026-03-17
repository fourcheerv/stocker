const CACHE_NAME = "stocker-cache-v2";
const APP_SHELL = [
  "/stocker/",
  "/stocker/index.html",
  "/stocker/login.html",
  "/stocker/admin.html",
  "/stocker/bobines.html",
  "/stocker/manifest.json",
  "/stocker/css/styles.css",
  "/stocker/css/login.css",
  "/stocker/css/admin.css",
  "/stocker/js/app.js",
  "/stocker/js/login.js",
  "/stocker/js/admin.js",
  "/stocker/js/bobines.js",
  "/stocker/js/gmail.js",
  "/stocker/js/pwa.js",
  "/stocker/js/voice-input.js",
  "/stocker/js/service-worker.js",
  "/stocker/icons/favicon.ico",
  "/stocker/icons/logo_package_192x192.png",
  "/stocker/icons/logo_package_512x512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          return cachedPage || caches.match("/stocker/index.html") || caches.match("/stocker/login.html");
        })
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
