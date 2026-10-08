// Flow service worker — lets the app open with no signal.
// The app's own files: network first (so a new deploy shows up right away), cache as the fallback.
// Libraries and fonts (Firebase SDK, Google Fonts, jsDelivr): served from cache, refreshed in the background.
// Firestore traffic is never touched here; Firestore keeps its own offline copy of your data.
const CACHE = 'flow-shell-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const LIB_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-site files: network first, fall back to the cached copy when offline
  if (url.origin === self.location.origin) {
    // Netlify functions (Stripe) must always hit the network
    if (url.pathname.startsWith('/.netlify/')) return;
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Libraries and fonts: cache first, update in the background
  if (LIB_HOSTS.includes(url.hostname)) {
    // Skip the AI model files — WebLLM caches those itself and they're huge
    if (/web-llm|mlc|wasm/i.test(url.pathname) && url.hostname === 'cdn.jsdelivr.net' && !/\.m?js$|\+esm$/.test(url.pathname)) return;
    e.respondWith(
      caches.open(CACHE).then(cache => cache.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
