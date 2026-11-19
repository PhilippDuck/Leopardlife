// Service Worker: macht das Spiel installierbar und offline spielbar.
// Bei jeder neuen Version VERSION hochzählen, damit Clients den Cache erneuern.
const VERSION = 'leopardlife-v44';
const SHELL = ['./', 'index.html', 'src/audio.js', 'src/data.js', 'src/engine.js', 'src/main.js', 'src/save.js', 'src/sky.js', 'src/state.js', 'src/terrain.js', 'src/util.js', 'src/vegetation.js', 'vendor/three.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Seite selbst: erst Netz (damit Updates ankommen), offline aus dem Cache.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  // Alles andere: erst Cache, sonst Netz und nachträglich cachen.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
