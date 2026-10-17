'use strict';
// Atomic shell release. Capture/upload data lives in IndexedDB, never in caches.
const VERSION = 'livre-souvenirs-20261017-2';
const SHELL_CACHE = VERSION + '-shell';
const FILTER_CACHE = VERSION + '-filters';
const SHELL = [
  '/', '/index.html', '/css/style.css?v=20261017-2',
  '/js/filter-render.js?v=20261017-2', '/js/app.js?v=20261017-2',
  '/filters/filters.json', '/manifest.webmanifest', '/icon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('livre-souvenirs-') && ![SHELL_CACHE, FILTER_CACHE].includes(key))
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  const documentRequest = request.mode === 'navigate';
  const configRequest = url.pathname === '/filters/filters.json';
  if (documentRequest || configRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        await cache.put(request, response.clone()); return response;
      } catch (err) {
        return await cache.match(request) || (documentRequest ? await cache.match('/') : undefined) || Response.error();
      }
    })()); return;
  }
  const filter = url.pathname.startsWith('/filters/');
  const shell = /\.(js|css|svg|webmanifest)$/.test(url.pathname);
  if (!filter && !shell) return;
  event.respondWith((async () => {
    const cache = await caches.open(filter ? FILTER_CACHE : SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
