/* Service worker — offline cache + versioned updates.
   VERSION and ASSETS are rewritten by tools/build.py on every build. */
const VERSION = '84a7f2915055b250';
const ASSETS = [
 "./",
 "app.css",
 "app.js",
 "data/docs/catequesis.json",
 "data/docs/constituciones.json",
 "data/docs/direccion-espiritual.json",
 "data/docs/ecumenismo.json",
 "data/docs/espiritualidad.json",
 "data/docs/misiones-populares.json",
 "data/docs/oratorio.json",
 "data/docs/vida-liturgica.json",
 "data/docs/works-of-mercy.json",
 "data/library.json",
 "data/search.json",
 "fonts/eb-garamond-latin-400-italic.woff2",
 "fonts/eb-garamond-latin-400-normal.woff2",
 "fonts/eb-garamond-latin-500-normal.woff2",
 "fonts/eb-garamond-latin-600-normal.woff2",
 "fonts/source-serif-4-latin-400-italic.woff2",
 "fonts/source-serif-4-latin-400-normal.woff2",
 "fonts/source-serif-4-latin-600-normal.woff2",
 "icons/apple-touch-icon.png",
 "icons/brand-192.png",
 "icons/brand-32.png",
 "icons/brand-512.png",
 "icons/brand-apple-180.png",
 "icons/brand-fdea1bafce0b-192.png",
 "icons/brand-fdea1bafce0b-32.png",
 "icons/brand-fdea1bafce0b-512.png",
 "icons/brand-fdea1bafce0b-apple-180.png",
 "icons/brand-fdea1bafce0b-maskable-512.png",
 "icons/brand-fdea1bafce0b.svg",
 "icons/brand-maskable-512.png",
 "icons/brand.svg",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "index.html",
 "manifest.webmanifest",
 "robots.txt",
 "search-worker.js",
 "vendor/minisearch.js"
];
const CACHE = 'ive-en-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
  );
  // wait for the page to ask before taking over (so the user can choose when to update)
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ive-en-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // navigation → app shell
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
