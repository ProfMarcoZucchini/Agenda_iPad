const CACHE_PREFIX = 'agenda-ipad-reintegration-';
const CACHE = 'agenda-ipad-reintegration-0.1.46';
const CORE = ['./', './index.html', './src/main.js', './src/sync-core.js', './src/lan-sync.js', './src/cloud-sync.js', './src/cloud-crypto.js', './src/blob-store.js', './src/backup.js', './src/cloud-auth.js', './src/styles.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './apple-touch-icon.png', './assets/cover-agenda-ipad.png', './assets/welcome-agenda-ipad.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // I transport Sync non devono mai passare dalla cache PWA né dal fallback index.html.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/agenda-sync/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
});
