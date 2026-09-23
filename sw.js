const VER = 'scp-v1';
const STATIC = ['./', './index.html', './style.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './favicon.ico'];
const CDN = 'https://cdn.tailwindcss.com';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await c.addAll(STATIC);
    try { await c.put(CDN, await fetch(CDN, { mode: 'no-cors' })); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isStatic = url.origin === location.origin &&
    STATIC.some(p => new URL(p, location.href).pathname === url.pathname);

  if (isStatic || url.href.startsWith(CDN)) {
    // Cache-first for static assets
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(VER).then(c => c.put(req, copy));
      return r;
    })));
  } else {
    // Network-first with cache fallback for everything else
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone();
      caches.open(VER).then(c => c.put(req, copy));
      return r;
    }).catch(() => caches.match(req).then(h => h || caches.match('./index.html'))));
  }
});
