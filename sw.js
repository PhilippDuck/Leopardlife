// Service Worker: macht das Spiel installierbar und offline spielbar.
// VERSION und SHELL werden von tools/bump-sw.py aktualisiert.
const VERSION = 'leopardlife-v0.36.1';
const SHELL = ['./', 'index.html', 'src/acaciamodel.js', 'src/actions.js', 'src/ai.js', 'src/animals.js', 'src/audio.js', 'src/baboons.js', 'src/baobabmodel.js', 'src/birds.js', 'src/bite.js', 'src/burrows.js', 'src/calls.js', 'src/carcass.js', 'src/chunkplants.js', 'src/chunks.js', 'src/controls.js', 'src/coop.js', 'src/crocodile.js', 'src/ctrlart.js', 'src/cubfollow.js', 'src/data.js', 'src/daynight.js', 'src/deadtreemodel.js', 'src/effects.js', 'src/elephants.js', 'src/engine.js', 'src/envsound.js', 'src/events.js', 'src/explore.js', 'src/family.js', 'src/fish.js', 'src/gamepad.js', 'src/goals.js', 'src/hide.js', 'src/hippo.js', 'src/hud.js', 'src/human.js', 'src/input.js', 'src/insects.js', 'src/kin.js', 'src/kinship.js', 'src/kopje.js', 'src/kopjesites.js', 'src/lexicon.js', 'src/life.js', 'src/main.js', 'src/menu.js', 'src/meshmodel.js', 'src/models.js', 'src/move.js', 'src/net.js', 'src/netcoop.js', 'src/netfamily.js', 'src/networld.js', 'src/noise.js', 'src/perf.js', 'src/player.js', 'src/quality.js', 'src/reeds.js', 'src/regions.js', 'src/river.js', 'src/save.js', 'src/skills.js', 'src/sky.js', 'src/snake.js', 'src/state.js', 'src/terrain.js', 'src/thirst.js', 'src/title.js', 'src/tracks.js', 'src/tutorial.js', 'src/ui.js', 'src/util.js', 'src/vegetation.js', 'src/version.js', 'src/vision.js', 'src/waterplants.js', 'src/weather.js', 'src/wildbirds.js', 'src/worldcontent.js', 'src/worldevents.js', 'audio/alarm.mp3', 'audio/amb-day-1.mp3', 'audio/amb-day-2.mp3', 'audio/amb-night.mp3', 'audio/amb-wind-1.mp3', 'audio/amb-wind-2.mp3', 'audio/baboon-bark.mp3', 'audio/baboon-screech.mp3', 'audio/bird-1.mp3', 'audio/bird-2.mp3', 'audio/boar-grunt.mp3', 'audio/boar-squeal.mp3', 'audio/claws.mp3', 'audio/croc.mp3', 'audio/dove-1.mp3', 'audio/dove-2.mp3', 'audio/eat.mp3', 'audio/ele-rumble.mp3', 'audio/ele-trumpet.mp3', 'audio/fire.mp3', 'audio/fly.mp3', 'audio/frogs.mp3', 'audio/gnu.mp3', 'audio/growl-1.mp3', 'audio/growl-2.mp3', 'audio/guinea.mp3', 'audio/gunshot.mp3', 'audio/gust.mp3', 'audio/hippo.mp3', 'audio/hurt-1.mp3', 'audio/hurt-2.mp3', 'audio/hyena-1.mp3', 'audio/hyena-2.mp3', 'audio/jackal-1.mp3', 'audio/jackal-2.mp3', 'audio/leopard-saw.mp3', 'audio/lion.mp3', 'audio/mew.mp3', 'audio/music-1.mp3', 'audio/music-2.mp3', 'audio/music-3.mp3', 'audio/music-4.mp3', 'audio/owl-1.mp3', 'audio/owl-2.mp3', 'audio/owl-3.mp3', 'audio/owl-4.mp3', 'audio/paws.mp3', 'audio/rain.mp3', 'audio/river.mp3', 'audio/roar.mp3', 'audio/snake-hiss.mp3', 'audio/squeak.mp3', 'audio/thunder-far.mp3', 'audio/thunder-mid-2.mp3', 'audio/thunder-mid.mp3', 'audio/thunder.mp3', 'vendor/three.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL.map(path => new Request(path, {cache: 'reload'})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('leopardlife-v') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Startseite und Module aus demselben Versionscache laden.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req.mode === 'navigate' ? 'index.html' : req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) await c.put(req, res.clone()).catch(() => {});
    return res;
  }));
});
