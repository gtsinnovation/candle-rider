// client/public/sw.js
//
// Minimal PWA service worker. Cache-first for the built static assets
// (JS/CSS/images) so the shell loads instantly on repeat visits and works
// offline; API calls always go to the network (save data must never be
// served stale) and simply fail gracefully if offline — SaveManager
// already handles that via its localStorage mirror fallback.

const CACHE_NAME = 'candle-rider-v1';
const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — save/leaderboard data must always be fresh.
  if (url.pathname.startsWith('/api')) {
    return; // let it hit the network normally, no caching layer at all
  }

  // Cache-first for everything else (the built client shell + assets).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful, same-origin GET responses.
        if (event.request.method === 'GET' && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
