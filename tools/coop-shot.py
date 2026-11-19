"""Splitscreen-Test in Headless-Chrome mit simulierten Controllern.
Ersetzt navigator.getGamepads durch steuerbare Attrappen (window.__pad(i, {...})), startet mit Tastatur,
lässt bis zu drei Controller per Start einsteigen, bewegt sie und macht Bildschirmfotos.
Aufruf: python3 tools/coop-shot.py [Ausgabeordner]   (erwartet einen Webserver auf http://localhost:8765)"""
import sys, os
from playwright.sync_api import sync_playwright
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/coop'
os.makedirs(out, exist_ok=True)
errors = []
FAKE = """
(() => {
  const pads = [];
  const mk = i => ({ index: i, id: 'Testcontroller ' + i + ' (Xbox)', connected: true, mapping: 'standard',
    buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})), axes: [0, 0, 0, 0], vibrationActuator: null });
  navigator.getGamepads = () => pads;
  // __pad(i, {b: [Tasten gedrückt], ax: [lx, ly, rx, ry]}) setzt den Zustand von Controller i
  window.__pad = (i, s) => { const p = pads[i] || (pads[i] = mk(i)); p.buttons.forEach((b, k) => { b.pressed = (s.b || []).includes(k); b.value = b.pressed ? 1 : 0; }); p.axes = s.ax || [0, 0, 0, 0]; };
})();
"""
def shot(pg, name): pg.screenshot(path=f'{out}/{name}.png')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.add_init_script(FAKE)
    pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_timeout(2000)
    pg.click('#btnPlay'); pg.wait_for_timeout(1200)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    if pg.locator('#menu').is_visible(): pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.keyboard.down('KeyW'); pg.wait_for_timeout(600); pg.keyboard.up('KeyW')
    # Controller 0: Start = Spieler 2 steigt ein (Spieler 1 spielt mit Tastatur)
    pg.evaluate("__pad(0,{b:[9]})"); pg.wait_for_timeout(200); pg.evaluate("__pad(0,{})"); pg.wait_for_timeout(600)
    joined = pg.locator('.pv').count()
    # Spieler 2 läuft nach vorn und dreht die Kamera
    pg.evaluate("__pad(0,{ax:[0.3,-1,0.4,0]})"); pg.wait_for_timeout(1500); pg.evaluate("__pad(0,{})"); pg.wait_for_timeout(300)
    shot(pg, '1-zwei-spieler')
    # Spieler 2 springt (A)
    pg.evaluate("__pad(0,{b:[0]})"); pg.wait_for_timeout(120); pg.evaluate("__pad(0,{})"); pg.wait_for_timeout(500)
    # Controller 1: Spieler 3
    pg.evaluate("__pad(1,{b:[9]})"); pg.wait_for_timeout(200); pg.evaluate("__pad(1,{})"); pg.wait_for_timeout(800)
    shot(pg, '2-drei-spieler')
    pg.evaluate("__pad(2,{b:[9]})"); pg.wait_for_timeout(200); pg.evaluate("__pad(2,{})"); pg.wait_for_timeout(300)
    pg.evaluate("__pad(2,{ax:[-1,-0.5,0,0]})"); pg.wait_for_timeout(1200); pg.evaluate("__pad(2,{})"); pg.wait_for_timeout(300)
    shot(pg, '3-vier-spieler')
    four = pg.locator('.pv').count()
    # Spieler 3 steigt aus: Back zweimal
    for _ in range(2):
        pg.evaluate("__pad(1,{b:[8]})"); pg.wait_for_timeout(150); pg.evaluate("__pad(1,{})"); pg.wait_for_timeout(250)
    pg.wait_for_timeout(400)
    after = pg.locator('.pv').count()
    shot(pg, '4-nach-aussteigen')
    # Pause über Controller 0 (Start) und wieder zurück
    pg.evaluate("__pad(0,{b:[9]})"); pg.wait_for_timeout(150); pg.evaluate("__pad(0,{})"); pg.wait_for_timeout(400)
    menu = pg.locator('#menu').is_visible()
    shot(pg, '5-pause')
    b.close()
print('eingestiegen:', joined, '| bei vier:', four, '| nach Aussteigen:', after, '| Pause per Controller:', menu)
print('Fehler/Warnungen:', len(errors))
for e in errors[:15]: print(' ', e)
