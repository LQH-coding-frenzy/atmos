const CACHE_NAME = 'atmos-shell-v1';
const rootUrl = new URL('/', self.location.origin).href;

async function cacheRootShell(cache) {
  try {
    const response = await fetch(rootUrl, { cache: 'reload' });
    if (!response.ok) return false;
    const html = await response.clone().text();
    if (html.includes('Weather data is temporarily unavailable')) return false;
    await cache.put(rootUrl, response);
    return true;
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cacheRootShell(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('atmos-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (requestUrl.pathname === '/' && !requestUrl.search && response.ok) {
            const html = await response.clone().text();
            if (!html.includes('Weather data is temporarily unavailable')) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(rootUrl, response.clone());
            }
          }
          return response;
        } catch {
          const cachedShell = await caches.match(rootUrl);
          return (
            cachedShell ??
            new Response(
              '<!doctype html><html lang="en"><meta charset="utf-8"><title>Atmos offline</title><body><h1>Atmos is offline</h1><p>Connect once to load the dashboard and save a forecast for offline use.</p></body></html>',
              { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
            )
          );
        }
      })(),
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith('/_next/static/') ||
    requestUrl.pathname.startsWith('/maplibre/') ||
    requestUrl.pathname === '/icon.svg' ||
    requestUrl.pathname === '/manifest.webmanifest';
  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
