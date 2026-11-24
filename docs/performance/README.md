# Performance-Baseline

`tools/performance.cjs` startet einen lokalen HTTP-Server und einen isolierten Chromium-Browser. Nur die vom Messserver ausgelieferten JavaScript-Dateien erhalten Zeitmessungen. Die Spieldateien, der Offline-Cache und normale Spielstarts bleiben unverändert. Der Server wird nach dem Lauf geschlossen. Playwright und sein Chromium müssen installiert sein (wie für `tests/world-browser.cjs`).

```bash
npm install --prefix /tmp/leolife-perf-deps playwright
/tmp/leolife-perf-deps/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/leolife-perf-deps/node_modules node tools/performance.cjs /tmp/baseline.json
```

Standard: Software-WebGL, 1280 × 720, DPR 1, Grafik niedrig, automatische Auflösung aus, Weltsamen und Zufallsfolge 12345, frischer Browserkontext je Szenario, zwei Sekunden Aufwärmphase und zehn Sekunden Messfenster. `PERF_SECONDS=30` verlängert das Messfenster (maximal 120 Sekunden). Mit `PERF_WIDTH` und `PERF_HEIGHT` lässt sich die Auflösung ändern (mindestens 160 Pixel pro Achse); kleine Auflösungen dienen nur einem schnellen Funktionstest. Keine vorhandenen Spielstände werden benutzt oder überschrieben.

Für verwertbare GPU-/Spielgerätevergleiche auf einem Rechner mit Bildschirm und GPU:

```bash
NODE_PATH=/tmp/leolife-perf-deps/node_modules PERF_GPU=hardware PERF_HEADED=1 PERF_SECONDS=30 node tools/performance.cjs /tmp/hardware-60hz.json
```

Mit `PERF_QUALITY=high` bzw. `ultra` zusätzlich Schatten und größere Sichtweiten prüfen; die Stufe `low` schaltet echte Schatten ab und genügt daher nicht zur Bewertung der Schattenoptimierung. Den Browser im Vordergrund halten. Display zunächst auf 60 Hz stellen, dann auf beispielsweise 120/144 Hz, und jeweils mindestens drei Läufe durchführen. Tatsächlichen GPU-Namen im Ergebnis prüfen: `PERF_GPU=hardware` deaktiviert lediglich die erzwungene Software-Backend-Wahl und garantiert keine Hardwarebeschleunigung. Bildschirmmodell, eingestellte Hz, Energieprofil und eventuelle Hintergrundlast ergänzend festhalten. Vorher/Nachher mit gleichem Gerät, Browser, Grafik, Auflösung und Messdauer vergleichen. Headless-rAF simuliert keinen bestimmten echten Monitor.

## Szenarien

- `idle-1`: laufendes Einzelspiel am Startpunkt.
- `explore-1`: kontrollierte Bewegung mit 18 m/s entlang +X; Delta auf 100 ms begrenzt. Absichtlich synthetischer Streaming-Stresstest, kein normaler Eingabepfad. Bei sehr niedrigen FPS wird weniger Strecke zurückgelegt.
- `animals-1`: vorhandene lebende, nicht befreundete Tiere einmalig in 18–47 m Entfernung versetzen; KI bleibt aktiv. Kein zusätzlicher Tier-Spawn. Tiere können anschließend weggehen.
- `idle-2/3/4`: lokale Spieler mit neutralen simulierten Controllern; bei drei Spielern wird auch die gemeinsame Zielanzeige ausgeführt.
- `pause-1`: `G.paused=true`, Umgebung und Rendering laufen gemäß Spielcode weiter; kein Test eines bestimmten Menüdialogs.

Während der Messung werden Gesundheit, Hunger und Durst der Spieler stabil gehalten, damit Tod die Szenarien nicht beendet. Zufallsfolge und Startzustand sind fest, die zeitabhängige Simulation ist trotzdem nicht über Geräte und FPS exakt identisch. Anzahl Tiere und Spieler werden mit ausgegeben.

## Auswertung und Grenzen

JSON enthält Commit, App-Version, CPU, Betriebssystem, Browser, GPU pro Szenario, Parameter sowie Median, p95, p99 und Maximum:

- `intervalMs`: rAF-Abstände, erster Frame ausgeschlossen; das ist die sichtbare Frame-Taktung, nicht nur CPU-Arbeit.
- `workMs`: synchrone Hauptschleife einschließlich Messhilfen und Render-Aufruf. GPU-Abschluss wird nicht abgewartet.
- `cpuMs`: summierte Laufzeiten je Frame für Tier-KI, Chunk-Update, Bäume, Radar, HUD und Render-Aufruf. `updateCoopHud` enthält seine verschachtelten HUD-Aufrufe; diese Werte **nicht addieren**. Nicht erfasste Spielsysteme verbleiben in der gesamten Hauptschleifenzeit. `updateChunks` enthält seine Filler, aber nicht das initiale Laden vor Messbeginn.
- `drawCalls`: über alle Render-Ansichten eines Frames summiert (Renderer-Autoreset deaktiviert, manuelles Reset am Frame-Ende).

Die Wrapper selbst kosten Zeit, besonders bei vielen Tieren. Ergebnisse sind instrumentierte Vergleichswerte, keine unverfälschte FPS-Benchmark. GPU-Zeiten werden ausdrücklich nicht gemessen; CPU-Zeit von `renderAll` ist kein Ersatz. Bei Bedarf auf dem Zielgerät einen GPU-fähigen Profiler ergänzen.

Kleine Stichproben nicht als belastbare p99-Werte interpretieren. Software-WebGL beansprucht die CPU zusätzlich und ist kein Ersatz für Messungen auf Spielgeräten. Bei Messserver-Quellcodeänderungen brechen fehlende Funktionsmarker mit Fehler ab, statt still falsche Abschnitte zu messen.

## Folgende Entscheidungen

Issue #81 sammelt die Baseline; #83 (Chunks), #84 (Tiersuchen) und #85 (Bäume/Schatten/Pause) bleiben bis zur belastbaren Auswertung blockiert. #82 (Radar/HUD) kann unabhängig begonnen werden, braucht aber ebenfalls einen Vorher/Nachher-Vergleich. Ein kurzer Software-Lauf allein rechtfertigt keine Priorisierung größerer Umbauten.

## Validierung des Werkzeugs

Die Spiellogiktests (`node tests/logic-test.js`), Importprüfung und Namensprüfung bestehen. Die separat mit TypeScript 5.7.3 ausgeführte Typprüfung meldet im unveränderten Spielcode 22 Fehler; diese sind in Issue #86 erfasst. Die Messarbeit ändert keine Dateien unter `src/`, daher ist kein App-/Cache-Versionssprung erforderlich.
