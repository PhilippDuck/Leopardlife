// Service Worker: macht das Spiel installierbar und offline spielbar.
// Bei jeder neuen Version VERSION hochzählen, damit Clients den Cache erneuern.
const VERSION = 'leopardlife-v64';
const SHELL = ['./', 'index.html', 'src/actions.js', 'src/ai.js', 'src/animals.js', 'src/audio.js', 'src/carcass.js', 'src/controls.js', 'src/coop.js', 'src/crocodile.js', 'src/data.js', 'src/daynight.js', 'src/effects.js', 'src/engine.js', 'src/events.js', 'src/family.js', 'src/gamepad.js', 'src/goals.js', 'src/hide.js', 'src/hud.js', 'src/input.js', 'src/kin.js', 'src/kinship.js', 'src/life.js', 'src/main.js', 'src/menu.js', 'src/models.js', 'src/move.js', 'src/perf.js', 'src/player.js', 'src/quality.js', 'src/regions.js', 'src/save.js', 'src/skills.js', 'src/sky.js', 'src/state.js', 'src/terrain.js', 'src/tracks.js', 'src/ui.js', 'src/util.js', 'src/vegetation.js', 'src/weather.js', 'audio/roar.mp3', 'vendor/three.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];

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
