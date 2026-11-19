# LeopardLife – Jäger der Wildnis

Third-Person-Jagdspiel im Browser (Three.js, installierbar als PWA). Du beginnst als kleines Leoparden-Jungtier,
jagst, versteckst dich vor Raubtieren, wächst, gründest eine Familie und führst deine Blutlinie über Generationen
durch Savanne und Sumpf.

**Spielen:** https://philippduck.github.io/leopardlife/

## Inhalt

- Wachstum mit Stufen, Eigenschaften, Fähigkeiten (Hinterhalt, Klettern, Brüllen, Nachtsicht …) und Erbanlagen
- Tarnung im hohen Gras, Wind und Witterung, Fährten, Warnpfeile vor Raubtieren
- Partner, Junges großziehen, Generationen mit Ahnenkraft und Ahnenbuch
- Tag-Nacht-Wechsel, Regen und Gewitter, Tagesziele, drei Schwierigkeitsgrade
- Gebiete: Savanne und Sumpf (mit Krokodilen); weitere geplant
- Steuerung mit Tastatur und Maus, Touch oder Xbox-Controller

## Aufbau

Kein Build-Schritt: Der Browser lädt die Dateien direkt. three.js (r128, MIT-Lizenz) liegt in `vendor/`, damit das Spiel ohne fremden Server und offline läuft.

| Datei | Zweck |
|---|---|
| `index.html` | Seite, Stile und Oberfläche |
| `src/main.js` | Einstieg und restliche Spiellogik (wird weiter aufgeteilt) |
| `src/data.js` | Feste Spieldaten: Tierarten, Gebiete, Erbanlagen, Eigenschaften, Schwierigkeit, Icons |
| `src/save.js` | Spielstand, Gebiet, Schwierigkeit und abgeleitete Werte (Leben, Schaden, Tempo …) |
| `src/engine.js` | Renderer, Szene, Kamera, Licht, Wind |
| `src/sky.js` | Himmel, Wolken, Sterne |
| `src/terrain.js` | Gelände, Wasserlöcher, Kacheln, Boden, Hindernisse |
| `src/vegetation.js` | Bäume, Büsche, Gras, Verstecke |
| `src/audio.js` | Geräusche, Umgebungston und Musik (WebAudio) |
| `src/state.js` | Gemeinsamer veränderlicher Zustand `G` |
| `src/util.js` | Kleine Hilfsfunktionen |
| `vendor/three.min.js` | three.js r128 |
| `sw.js` | Service Worker für Installation und Offline-Betrieb |
| `manifest.webmanifest`, `icon-*.png` | PWA-Angaben und Icons |
| `tests/logic-test.js` | Logiktest ohne Browser |
| `tools/shot.py` | Startet das Spiel in Headless-Chrome und macht Bildschirmfotos |

Nach Änderungen am Spiel `python3 tools/bump-sw.py` ausführen: Das trägt alle Module in den Service-Worker-Cache ein und zählt die Version hoch, sonst behalten installierte Geräte den alten Stand.

## Lokal starten und testen

```bash
python3 -m http.server 8080      # dann http://localhost:8080 öffnen
node tests/logic-test.js         # Spiellogik prüfen, endet mit "ALL OK"
```

Der Spielstand liegt im `localStorage` des jeweiligen Browsers.
