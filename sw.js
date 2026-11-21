/* Service Worker: macht die Werkstatt installierbar und offline nutzbar.
   Bei jeder Änderung an App-Dateien VERSION und die ?v=-Parameter in index.html erhöhen. */
const VERSION = '2026-11-21d';
const SHELL_CACHE = 'cw-shell-' + VERSION;
const IMG_CACHE = 'cw-images';
const FONT_CACHE = 'cw-fonts';
const V = '?v=' + VERSION;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'fonts/fonts.css' + V,
  'fonts/inter-latin-wght-normal.woff2',
  'fonts/big-shoulders-display-latin-800-normal.woff2',
  'fonts/big-shoulders-display-latin-900-normal.woff2',
  'fonts/unbounded-latin-700-normal.woff2',
  'fonts/unbounded-latin-900-normal.woff2',
  'fonts/cinzel-latin-700-normal.woff2',
  'fonts/cinzel-latin-900-normal.woff2',
  'css/style.css' + V,
  'css/life.css' + V,
  'data/precons.js' + V,
  'js/data.js' + V,
  'js/api.js' + V,
  'js/cards.js' + V,
  'js/engine.js' + V,
  'js/app.js' + V,
  'js/life.js' + V,
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cw-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('index.html')) || Response.error();
  }
}

async function cacheFirst(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    cache.put(req, res.clone());
    if (maxEntries) cache.keys().then((keys) => keys.length > maxEntries && Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k))));
  }
  return res;
}

// Nur die Dateien der Werkstatt selbst verwalten – andere Apps unter derselben Adresse
// (z. B. ./dienstplan/) bleiben unberührt.
const BASE = new URL('./', self.location).pathname;
const OWN = new Set(SHELL.map((f) => new URL(f, self.location).pathname + (f.includes('?') ? '?' + f.split('?')[1] : '')));
const isAppPage = (url) => url.pathname === BASE || url.pathname === BASE + 'index.html';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Startseite: immer zuerst Netz (Updates kommen sofort an), offline aus dem Cache
    if (isAppPage(url)) return event.respondWith(networkFirst(req));
    // App-Dateien aus der Liste oben: aus dem Cache, sonst Netz
    if (OWN.has(url.pathname + url.search) || OWN.has(url.pathname)) {
      return event.respondWith(caches.match(req).then((hit) => hit || networkFirst(req)));
    }
    return; // alles andere (andere Seiten/Apps) normal übers Netz
  }
  // Kartenbilder: einmal geladen, offline verfügbar
  if (url.hostname === 'cards.scryfall.io') return event.respondWith(cacheFirst(req, IMG_CACHE, 600));
  // Schriften
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return event.respondWith(cacheFirst(req, FONT_CACHE));
  // APIs (Scryfall, EDHREC) laufen direkt übers Netz
});
