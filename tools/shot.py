"""Startet das Spiel in Headless-Chrome (Software-WebGL), spielt kurz und macht Bildschirmfotos.
Aufruf: python3 tools/shot.py [Ausgabeordner]   (erwartet einen Webserver auf http://localhost:8765)"""
import sys, os, time
from playwright.sync_api import sync_playwright
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(out, exist_ok=True)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/1-start.png')
    pg.click('#btnPlay')
    pg.wait_for_timeout(3000)
    pg.screenshot(path=f'{out}/2-spiel.png')
    pg.keyboard.down('KeyW'); pg.wait_for_timeout(2500); pg.keyboard.up('KeyW')
    pg.screenshot(path=f'{out}/3-gelaufen.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{out}/4-menue.png')
    fps = pg.evaluate("document.getElementById('fps') ? document.getElementById('fps').textContent : ''")
    b.close()
print('Fehler/Warnungen:', len(errors))
for e in errors[:15]: print(' ', e[:200])
