# LeoLife – Jäger der Wildnis

Third-Person-Jagdspiel im Browser (Three.js, installierbar als PWA). Du beginnst als kleines Leoparden-Jungtier,
jagst, versteckst dich vor Raubtieren, wächst, gründest eine Familie und führst deine Blutlinie über Generationen
durch Savanne und Sumpf.

**Spielen:** https://philippduck.github.io/Leopardlife/

## Inhalt

- Wachstum mit Stufen, Eigenschaften, Fähigkeiten (Hinterhalt, Klettern, Brüllen, Nachtsicht …) und Erbanlagen
- Tarnung im hohen Gras, Wind und Witterung, Fährten, Warnpfeile vor Raubtieren
- Partner, Junges großziehen, Generationen mit Ahnenkraft und Ahnenbuch
- Tag-Nacht-Wechsel, Regen und Gewitter, Tagesziele, drei Schwierigkeitsgrade
- Hunger und Durst: Beute fressen und an Wasserlöchern trinken – dort lauern Krokodile, die sich an Trinkende heranschleichen
- Wildtiere suchen regelmäßig Wasser und können an Krokodil-Wasserlöchern angegriffen werden; Geier finden Kadaver nach einer Weile, kreisen lange darüber, landen nacheinander und fressen – wer sich nähert, verscheucht sie und kann sich die Beute sichern
- Wasserschweine, Wildschweine, Hirsche, Antilopen, Hyänen und Löwen haben Junge; wehrhafte Eltern verteidigen sie
- Perlhühner schlagen Alarm, Madenhacker warnen ihre Wirte; Fliegen über Kadavern verraten Aas, nachts leuchten Glühwürmchen
- Puffottern liegen getarnt im Gras, zischen als Warnung und beißen mit nachwirkendem Gift
- Elefantenherden mit Jungen ziehen durch die Savanne und treffen sich an den Wasserlöchern; wer zu nahe kommt, wird erst angedroht (Ohren gespreizt, Trompeten) und dann niedergetrampelt
- Nilpferde dösen tagsüber in großen Wasserlöchern (nur Rücken, Augen und Ohren schauen heraus) und grasen nachts am Ufer; wer zwischen sie und das Wasser gerät oder ihnen zu nahe kommt, wird erst angedroht und dann angegriffen
- Felsplateaus (Kopjes) aus großen Granitblöcken: hinaufklettern für Aussicht und Sicherheit, Beute mitnehmen, oben schlafen; die Höhle am Fuß ist ein Versteck und Schlafplatz und kann im Startgebiet zum Bau für die Jungen werden
- Ein Fluss schlängelt sich durch die Savanne und die weite Welt. Er entspringt an einer Quelle, fließt durch eine flache Aue stetig bergab und mündet in einen großen See ohne Abfluss. Dahinter beginnt der nächste Flussabschnitt an einer neuen Quelle. Im Tiefen muss man langsam schwimmen, und Herden kommen nur an den flachen Furten (Stromschnellen) hinüber. Krokodile lauern dort und vor allem in den breiten, tiefen Gumpen; im See leben Krokodile und Nilpferde. Am Ufer kann man trinken.
- Trübe Tümpel verbergen Krokodile – nur feine Wellen und geducktes Lauschen am Ufer verraten sie
- Tierlexikon im Menü: jede neu entdeckte Art bringt Erfahrung und einen Tipp
- Erfahrung auch für unbemerktes Anpirschen, Beute im Baum, eine Nacht ohne Verletzung und ein vor dem Räuber gerettetes Junges
- Erfahrung gibt es auch fürs Erkunden neuer Wasserlöcher, Ausweichen vor Krokodilen, Vertreiben von Wilderern und Räubern und fürs Großziehen eines Jungen
- Gebiete: Savanne (mit einzelnen Krokodilen) und Sumpf (mit vielen Krokodilen und dem Riesenkrokodil); weitere geplant
- Steuerung mit Tastatur und Maus, Touch oder Xbox-Controller
- Online spielen über mehrere Geräte (im Aufbau): Ein Gerät öffnet auf dem Startbildschirm oder im Pause-Menü unter „Online spielen“ einen Raum, die anderen treten mit dem Raumcode bei und spielen in derselben Welt. Das Spiel nutzt dafür einen kleinen Relay-Server (Standard: `wss://leolife.duck-box.de`, kein Schlüssel nötig); eigenen Server einrichten siehe [`server/README.md`](server/README.md). Man sieht sich gegenseitig, und alle erleben dieselben Tiere, dieselbe Tageszeit, dasselbe Wetter und dieselben Ereignisse: Das berechnet der Gastgeber, und seine Raubtiere jagen auch die Leoparden der anderen Geräte. Noch nicht übers Netz: selbst jagen als Gast, gemeinsame Beute (kommt als Nächstes).
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
| `src/bite.js` | Festbeißen bei großer Beute (Minispiel), Wunden, Blutspur |
| `src/title.js` | Startbildschirm in 3D: Kamera um den Leoparden, Musik, Mitspieler schon hier hinzufügen |
| `src/ctrlart.js` | Steuerungsbilder (Tastatur, Controller, Touch) als SVG |
| `src/tutorial.js` | Erste Schritte: geführtes erstes Leben für neue Spieler (je Steuerung eigene Texte) |
| `src/calls.js` | Tierrufe aus der Umgebung (Hyäne, Löwe, Schakal), Knurren und Alarmschnauben mit Richtung |
| `src/controls.js` | Steuerquellen: übersetzen Tastatur, Maus, Touch oder Controller in den Steuerwunsch eines Spielers |
| `src/coop.js` | Mitspieler am selben Gerät: Beitreten per Controller, geteiltes Bild, eigene Anzeige, am Boden und Wiederbeleben |
| `src/crocodile.js` | Krokodile: lauern abgetaucht im Wasser, schleichen sich an Trinkende heran, schnellen hervor und zerren Richtung Wasser |
| `src/hippo.js` | Nilpferde: tagsüber abgetaucht im Wasserloch, nachts grasend am Ufer; drohen mit offenem Maul und greifen an, wer ihnen den Weg zum Wasser versperrt |
| `src/elephants.js` | Elefanten: Herden, Drohen mit Ohren und Trompeten, Angriff auf Leoparden, die nicht zurückweichen |
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
| `src/kopje.js` | Felsplateaus: Granitblöcke mit flacher Oberseite und Höhle, Klettern und Höhle über die Baumliste, nachgeladen in der weiten Welt |
| `src/kopjesites.js` | Lage und Größe der Felsplateaus im Startgebiet und in der weiten Welt (Pflanzen weichen ihnen aus) |
| `src/kinship.js` | Verwandtschaft und Familie im gemeinsamen Spiel: wer mit wem verwandt ist, Spieler als Paar, Wurf mit einem Jungen je Spieler |
| `src/life.js` | Lebenslauf: Hunger, Durst, Altern, Fressen aus dem Vorrat |
| `src/thirst.js` | Trinken am Ufer eines Wasserlochs (Aktionstaste) |
| `src/main.js` | Einstieg: Hauptschleife (Bild für Bild: Spieler, Tiere, Kamera, Anzeige) und Spielstart |
| `src/menu.js` | Pausenmenü, Einstellungen, Steuerungsliste, Neustart |
| `src/models.js` | Tiermodelle aus Blöcken, Fellvarianten (inkl. Albino und Panther), eigenes Krokodilmodell (Schuppen, Zähne, Kiefer, schlängelnder Schwanz), Zusammenführen starrer Teile, Laufanimation |
| `src/move.js` | Bewegung eines Leoparden pro Bild: Laufen, Sprinten, Sprung, Klettern, Kollision, Tarnung |
| `src/net.js` | Online-Spiel: Verbindung zum Relay-Server, Räume, Leoparden der anderen Geräte (beim Gastgeber auch als Ziel für seine Tiere) |
| `src/networld.js` | Online-Spiel: Der Gastgeber schickt Tiere, Tageszeit, Wetter und Ereignisse, die Gäste zeigen sie an; Treffer auf Gäste gehen an deren Gerät |
| `src/perf.js` | Leistung: Schattentakt, automatische Auflösung, Bildratenanzeige |
| `src/player.js` | Der Leopard des Spielers: Zustand, Startposition und Modell |
| `src/quality.js` | Grafikstufen (niedrig/hoch/ultra) anwenden: Auflösung, Schatten, Gras, Nebel, Sichtweite |
| `src/river.js` | Fluss und See: Wasserflächen je Abschnitt, Krokodile an Furten und in Gumpen, Krokodile und Nilpferde im See (Verlauf, Gefälle, Tiefe und Aue in `terrain.js`) |
| `src/regions.js` | Gebiete-Fenster und Wandern zwischen Gebieten |
| `src/save.js` | Spielstand: Laden/Speichern, Gebiet, Schwierigkeit und daraus abgeleitete Werte (Leben, Ausdauer, Schaden, Tempo …) |
| `src/skills.js` | Entwicklungsfenster: Eigenschaften, Fähigkeiten, Erbanlagen, Ahnenkraft |
| `src/sky.js` | Himmel: Farbverlauf mit Sonne, Wolken und Sterne |
| `src/state.js` | Gemeinsamer veränderlicher Zustand, den mehrere Teile des Spiels lesen und schreiben |
| `src/terrain.js` | Gelände: Höhenformel, Wasserlöcher, Flüsse mit Gefälle, Furten, Aue und See, Kacheln mit Sichtbarkeitsprüfung, Boden, fernes Umland, Wasser und Hindernisse (Kollision) |
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

## App-Version

Die Version steht in `src/version.js` und erscheint auf dem Startbildschirm und in den Einstellungen. Sie folgt dem Schema `MAJOR.MINOR.PATCH`.

- **Major** legt Philipp fest. Für eine von ihm freigegebene Major-Version die Nummer in `src/version.js` eintragen und `python3 tools/bump-sw.py sync` ausführen.
- **Minor** eignet sich für neue Funktionen. `python3 tools/bump-sw.py minor` erhöht Minor und setzt Patch auf null.
- **Patch** eignet sich für Fehlerkorrekturen und kleine Anpassungen. `python3 tools/bump-sw.py patch` erhöht Patch. Das ist auch die Voreinstellung ohne Argument.

Agenten wählen Minor oder Patch nach eigenem Ermessen. Das Skript aktualisiert auch den Service-Worker-Cache für installierte und offline gestartete Apps.

## Lokal starten und testen

```bash
python3 -m http.server 8080      # dann http://localhost:8080 öffnen
node tests/logic-test.js         # Importe, Namen, Typen und Spiellogik prüfen, endet mit "ALL OK"
python3 tools/shot.py            # echter Browsertest (braucht den Server oben auf Port 8765)
```

Der Spielstand liegt im `localStorage` des jeweiligen Browsers.

## Geräusche und Musik

Die Aufnahmen in `audio/` sind mit ElevenLabs erzeugt. Neue Dateien kommen so ins Spiel: Ziel-Dateiname und Download-Adresse in
`audio/sources.json` eintragen und pushen – die GitHub-Action „Audio holen“ (`.github/workflows/audio-fetch.yml`) lädt sie herunter
und checkt sie im selben Zweig ein. Danach `git pull`. Fehlt eine Datei, spielt das Spiel einen synthetischen Ersatzton.

Performance-Messungen mit isoliertem Browser: siehe [Messanleitung](docs/performance/README.md).
