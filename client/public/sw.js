// client/public/sw.js
//
// Minimal PWA service worker. Cache-first for the built static assets
// (JS/CSS/images) so the shell loads instantly on repeat visits and works
// offline; API calls always go to the network (save data must never be
// served stale) and simply fail gracefully if offline — SaveManager
// already handles that via its localStorage mirror fallback.

// BUMP THIS ON EVERY DEPLOY THAT CHANGES SHIPPED FILES.
//
// The fetch handler below is cache-first, which by design never re-checks
// the network for a hit. That means a returning player keeps whatever this
// cache holds *forever* unless the name changes — so shipping new art or a
// new bundle under an unchanged name leaves existing players permanently
// on the old one, with no way to self-correct. The version bump is what
// triggers the activate handler to delete the stale cache.
//
// v2: art re-encoded PNG -> WebP and boss art removed (43MB -> ~0.4MB).
const CACHE_NAME = 'candle-rider-v2';

// Art lives in its own cache so it can be capped independently — the shell
// must never be evicted to make room for textures.
const ART_CACHE_NAME = 'candle-rider-art-v2';
const ART_CACHE_MAX_ENTRIES = 40;

const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

function isArtRequest(url) {
  return url.pathname.startsWith('/assets/');
}

// Cache-first storage is unbounded by default, which on a long-lived PWA
// grows until the browser evicts the whole origin. Trimming oldest-first
// keeps it predictable.
async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== ART_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
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

  // Cache-first for everything else (the built client shell + art).
  const targetCache = isArtRequest(url) ? ART_CACHE_NAME : CACHE_NAME;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful, same-origin GET responses.
        if (event.request.method === 'GET' && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(targetCache).then(async (cache) => {
            await cache.put(event.request, clone);
            if (targetCache === ART_CACHE_NAME) {
              await trimCache(ART_CACHE_NAME, ART_CACHE_MAX_ENTRIES);
            }
          });
        }
        return response;
      });
    })
  );
});
