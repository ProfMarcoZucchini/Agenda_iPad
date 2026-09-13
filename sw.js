const CACHE_PREFIXES = ['note-ipad-', 'lavagna-ipad-'];
const CACHE = 'note-ipad-0.1.43';
const CORE = ['./', './index.html', './src/main.js?v=0.1.43', './src/ruler.js', './src/beautify.js', './src/audio-recorder.js', './src/voice-script.js', './src/lasso.js', './src/lasso-tool.js', './src/password-vault.js', './src/shapes.js', './src/extra-shapes.js', './src/sync-core.js', './src/lan-sync.js', './src/cloud-sync.js', './src/cloud-crypto.js', './src/blob-store.js', './src/backup.js', './src/backup-worker.js', './src/lesson-pdf.js', './src/lesson-pdf-layout.js', './src/vendor/pdf-lib.esm.min.js', './src/cloud-auth.js', './src/styles.css?v=0.1.43', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './apple-touch-icon.png', './assets/cover-agenda-ipad.png', './assets/welcome-agenda-ipad.png', './assets/welcome-note-ipad.png', './assets/weather/sun.svg', './assets/weather/sun-cloud.svg', './assets/weather/cloud.svg', './assets/weather/rain.svg', './assets/weather/fog.svg', './assets/weather/snow.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
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
