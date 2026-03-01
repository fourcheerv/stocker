const CACHE_NAME = "stocker-cache-v2";  // Version incrémentée
const urlsToCache = [
  '/stocker/',
  '/stocker/index.html',
  '/stocker/login.html',
  '/stocker/css/login.css',
  '/stocker/js/auth-db.js',
  '/stocker/js/login.js',
  '/stocker/icons/favicon.ico',
  'https://cdnjs.cloudflare.com/ajax/libs/idb/7.0.2/idb.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bcrypt.js/2.4.0/bcrypt.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(error => {
          console.log('Échec de mise en cache:', error);
        });
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});