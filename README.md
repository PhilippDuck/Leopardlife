# LeopardLife – Jäger der Wildnis

Third-Person-Jagdspiel im Browser (Three.js, installierbar als PWA). Du beginnst als kleines Leoparden-Jungtier,
jagst, versteckst dich vor Raubtieren, wächst, gründest eine Familie und führst deine Blutlinie über Generationen
durch Savanne und Sumpf.

**Spielen:** https://philippduck.github.io/Leopardlife/

## Inhalt

- Wachstum mit Stufen, Eigenschaften, Fähigkeiten (Hinterhalt, Klettern, Brüllen, Nachtsicht …) und Erbanlagen
- Tarnung im hohen Gras, Wind und Witterung, Fährten, Warnpfeile vor Raubtieren
- Partner, Junges großziehen, Generationen mit Ahnenkraft und Ahnenbuch
- Tag-Nacht-Wechsel, Regen und Gewitter, Tagesziele, drei Schwierigkeitsgrade
- Gebiete: Savanne und Sumpf (mit Krokodilen); weitere geplant
- Steuerung mit Tastatur und Maus, Touch oder Xbox-Controller
- Gemeinsames Spiel (Splitscreen) für bis zu 4 Spieler: Im Spiel drückt ein weiterer Controller Start und steigt ein –
  auf der Stufe von Spieler 1, mit den passenden Punkten zum Verteilen. Back: eigene Entwicklung · Back halten: aussteigen. Erfahrung wird geteilt, Eigenschaften und
  Fähigkeiten verteilt jeder selbst.
  Familie: Wer einsteigt, ist ein fremder Leopard – ab Stufe 8 können sich Spieler paaren (F bzw. X antippen). Ein Wurf hat ein
  Junges je Spieler; jeder entscheidet selbst, ob er als Junges weiterspielt. Junge eines Wurfs sind Geschwister: Verwandte paaren sich nicht.
  Wer zu Boden geht, kann von Mitspielern wiederbelebt werden (daneben X bzw. F halten, 3 s), sonst erwacht er nach einer Minute im Bau.
  Q bzw. Steuerkreuz links markiert die Mitspieler kurz. Schlafen geht nur gemeinsam (jeder wählt auf seinem Baum „Schlafen").
  Die Entwicklung öffnet sich im eigenen Ausschnitt, das Spiel läuft dabei weiter (nicht, solange man gejagt wird).

## Aufbau

Kein Build-Schritt: Der Browser lädt die Dateien direkt. three.js (r128, MIT-Lizenz) liegt in `vendor/`, damit das Spiel ohne fremden Server und offline läuft.

| Datei | Zweck |
|---|---|
| `index.html` | Seite, Stile und Oberfläche |
| `src/actions.js` | Aktionen des Leoparden: Sprung, Klettern, Brüllen, Treffer austeilen und einstecken, Tod und Neubeginn |
| `src/ai.js` | Tierverhalten: Rudeljagd, Flucht, Angriff, Herden |
| `src/animals.js` | Alle Tiere der Welt: Anlegen pro Gebiet, Platzieren und Herden bilden |
| `src/audio.js` | Ton: Geräusche, Umgebung (Wind, Vögel) und laufend erzeugte Musik, synthetisch über WebAudio, dazu aufgenommene Geräusche aus `audio/` (Brüllen, mit ElevenLabs erzeugt; Synth-Ersatz, solange sie fehlen) |
| `src/carcass.js` | Kadaver, Aasfresser, Herden und Ahnenbuch |
| `src/controls.js` | Steuerquellen: übersetzen Tastatur, Maus, Touch oder Controller in den Steuerwunsch eines Spielers |
| `src/coop.js` | Mitspieler am selben Gerät: Beitreten per Controller, geteiltes Bild, eigene Anzeige, am Boden und Wiederbeleben |
| `src/crocodile.js` | Krokodile: lauern im Wasser und schnellen hervor |
| `src/data.js` | Feste Spieldaten: Eigenschaften, Fähigkeiten, Erbanlagen, Schwierigkeitsgrade, Gebiete, |
| `src/daynight.js` | Tag und Nacht: Sonne, Mond, Himmelsfarben, Nebel, Nachtsicht, Schlafen auf Bäumen |
| `src/effects.js` | Partikel-Wolken (Staub, Blut, Blasen) |
| `src/engine.js` | Darstellung: Zeichenfläche, Renderer, Szene, Kamera, Licht (Himmelslicht, Sonne/Mond), Wind und Fenstergröße |
| `src/events.js` | Einfache Ereignisse zwischen Modulen, damit sich niedrige Schichten (Grafik, Welt) |
| `src/family.js` | Partnersuche, Paarung, Junges (Füttern, Wachsen, Überfälle) und Weiterleben als Junges |
| `src/gamepad.js` | Controller-Steuerung (Xbox-Belegung) und Menübedienung per Controller |
| `src/goals.js` | Tagesziele |
| `src/hide.js` | Versteck-Anzeige am Fadenkreuz und dunkler Bildrand |
| `src/hud.js` | Anzeige: Entdeckungswarnung, Kamera, Fadenkreuz, Statusleisten, Ziel, Spürkarte |
| `src/input.js` | Eingabe über Tastatur, Maus und Touch, Umschalten der Anzeige je nach zuletzt benutzter Eingabe |
| `src/kin.js` | Partner und Elterntiere am Bau: verteidigen, Futter bringen, beschützen; Wechsel ins Junge |
| `src/kinship.js` | Verwandtschaft und Familie im gemeinsamen Spiel: wer mit wem verwandt ist, Spieler als Paar, Wurf mit einem Jungen je Spieler |
| `src/life.js` | Lebenslauf: Hunger, Altern, Fressen aus dem Vorrat |
| `src/main.js` | Einstieg: Hauptschleife (Bild für Bild: Spieler, Tiere, Kamera, Anzeige) und Spielstart |
| `src/menu.js` | Pausenmenü, Einstellungen, Steuerungsliste, Neustart |
| `src/models.js` | Tiermodelle aus Blöcken, Fellvarianten (inkl. Albino und Panther), Zusammenführen starrer Teile, Laufanimation |
| `src/move.js` | Bewegung eines Leoparden pro Bild: Laufen, Sprinten, Sprung, Klettern, Kollision, Tarnung |
| `src/perf.js` | Leistung: Schattentakt, automatische Auflösung, Bildratenanzeige |
| `src/player.js` | Der Leopard des Spielers: Zustand, Startposition und Modell |
| `src/quality.js` | Grafikstufen (niedrig/hoch/ultra) anwenden: Auflösung, Schatten, Gras, Nebel, Sichtweite |
| `src/regions.js` | Gebiete-Fenster und Wandern zwischen Gebieten |
| `src/save.js` | Spielstand: Laden/Speichern, Gebiet, Schwierigkeit und daraus abgeleitete Werte (Leben, Ausdauer, Schaden, Tempo …) |
| `src/skills.js` | Entwicklungsfenster: Eigenschaften, Fähigkeiten, Erbanlagen, Ahnenkraft |
| `src/sky.js` | Himmel: Farbverlauf mit Sonne, Wolken und Sterne |
| `src/state.js` | Gemeinsamer veränderlicher Zustand, den mehrere Teile des Spiels lesen und schreiben |
| `src/terrain.js` | Gelände: Höhenformel und Wasserlöcher, Kacheln mit Sichtbarkeitsprüfung, Boden, fernes Umland, Wasser und Hindernisse (Kollision) |
| `src/tracks.js` | Spuren und Fährten der Tiere |
| `src/ui.js` | Meldungen (mit Warteschlange) und schwebende Texte |
| `src/util.js` | Kleine Hilfsfunktionen ohne Spielzustand |
| `src/vegetation.js` | Pflanzen: Bäume (mit Ausblenden vor der Kamera), Büsche, Felsen, Stämme, Blumen, Bodengras, hohes Gras als Versteck und die Felsen am Bau |
| `src/weather.js` | Wetter: Regen und Gewitter |
| `vendor/three.min.js` | three.js r128 |
| `sw.js` | Service Worker für Installation und Offline-Betrieb |
| `manifest.webmanifest`, `icon-*.png` | PWA-Angaben und Icons |
| `tests/logic-test.js` | Logiktest ohne Browser (prüft vorher mit `tests/check-imports.js`, dass jeder Import exportiert wird) |
| `tests/typecheck.js`, `jsconfig.json`, `types/` | Typprüfung aller Module mit TypeScript (ohne Build-Schritt; der Editor nutzt dieselben Einstellungen) |
| `tests/check-names.js` | Meldet Namen, die ein Modul benutzt, aber weder anlegt noch importiert |
| `tools/add-imports.py` | Ergänzt solche fehlenden Importe automatisch aus den Exporten der anderen Module |
| `tools/coop-shot.py` | Splitscreen-Browsertest mit simulierten Controllern (Einsteigen, Bewegen, Aussteigen, Pause) |
| `tools/shot.py` | Startet das Spiel in Headless-Chrome, öffnet alle Fenster, macht Bildschirmfotos und meldet Fehler |

Nach Änderungen am Spiel `python3 tools/bump-sw.py` ausführen: Das trägt alle Module in den Service-Worker-Cache ein und zählt die Version hoch, sonst behalten installierte Geräte den alten Stand.

## Lokal starten und testen

```bash
python3 -m http.server 8080      # dann http://localhost:8080 öffnen
node tests/logic-test.js         # Importe, Namen, Typen und Spiellogik prüfen, endet mit "ALL OK"
python3 tools/shot.py            # echter Browsertest (braucht den Server oben auf Port 8765)
```

Der Spielstand liegt im `localStorage` des jeweiligen Browsers.
