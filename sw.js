/* ═══════════════════════════════════════════════════════════════
   SERVICE WORKER — Livre de Souvenirs
   Salma & Soufiane · 23 octobre 2026

   Objectif : rendre l'application instantanée à partir du deuxième
   souvenir, et la garder utilisable si le wifi de la salle faiblit.

   Conception volontairement prudente — une panne de service worker
   le soir du mariage serait bien pire que l'absence de cache :

   - rien n'est mis en cache à l'installation (aucun échec bloquant) ;
   - le HTML passe par le réseau d'abord (jamais de page périmée
     après un déploiement Netlify) ;
   - CSS et JS utilisent « stale-while-revalidate » (affichage immédiat,
     mise à jour en arrière-plan) ;
   - les images de filtres, lourdes et immuables, sont servies depuis le
     cache en priorité ;
   - tout ce qui n'est pas de la même origine — en particulier
     script.google.com — n'est jamais intercepté.
   ═══════════════════════════════════════════════════════════════ */

const VERSION = 'livre-souvenirs-v1';
const SHELL_CACHE = VERSION + '-shell';
const FILTER_CACHE = VERSION + '-filtres';

const CACHES = [SHELL_CACHE, FILTER_CACHE];

self.addEventListener('install', (event) => {
  /* Aucune pré-mise en cache : l'installation ne peut pas échouer. */
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.indexOf('livre-souvenirs-') === 0 && CACHES.indexOf(name) === -1)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function isFilterAsset(url) {
  return url.pathname.indexOf('/filters/') === 0 && !url.pathname.endsWith('.json');
}

function isShellAsset(url) {
  return url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.svg') ||
         url.pathname.endsWith('.webmanifest');
}

function isDocument(request, url) {
  return request.mode === 'navigate' ||
         url.pathname === '/' ||
         url.pathname.endsWith('.html');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  /* Jamais d'interception hors de notre origine : l'envoi vers Google
     Apps Script et les polices Google doivent rester intacts. */
  if (url.origin !== self.location.origin) return;

  /* Le service worker lui-même n'est jamais servi depuis le cache. */
  if (url.pathname.endsWith('/sw.js')) return;

  if (isDocument(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isFilterAsset(url)) {
    event.respondWith(cacheFirst(request, FILTER_CACHE));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
});


/* Le réseau fait autorité ; le cache n'est qu'un filet de sécurité. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

/* Images de filtres : lourdes, immuables, téléchargées une seule fois. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

/* Affichage immédiat depuis le cache, mise à jour silencieuse ensuite. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || network.then((r) => r || Response.error());
}
