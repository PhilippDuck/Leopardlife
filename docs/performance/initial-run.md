# Erster Funktionstest der Performance-Messung

Stand: 24. November 2026, Spielbasis b96ff94, Issue #81.

Dieser Lauf prüft ausschließlich die Messinstrumentierung: Software-WebGL (SwiftShader), 320 × 180, niedrige Grafik, automatische Auflösung aus, fünf Sekunden Messfenster je Szenario. Es handelt sich **nicht um eine belastbare Performance-Baseline**. Auf dem gemeinsam genutzten Host lief zeitweise weitere Arbeit; die CPU- und GPU-Messwerte dürfen daher keine Optimierungsrangfolge begründen.

Aufruf:

```bash
NODE_PATH=/tmp/leolife-perf-deps/node_modules PERF_WIDTH=320 PERF_HEIGHT=180 PERF_SECONDS=5 node tools/performance.cjs /tmp/leolife-baseline.json
```

Die Rohzusammenfassung liegt in `initial-software.json`. Wegen der sehr kleinen Stichproben sind insbesondere die ausgegebenen p95/p99-Werte nicht aussagekräftig. GPU-Zeiten fehlen ausdrücklich. Ein früherer Versuch mit drei Sekunden Messdauer brach korrekt wegen zu weniger Frames ab.

## Noch offen in #81

- Drei wiederholte Läufe auf einem realen Spielgerät bei 1280 × 720, zunächst 60 Hz, dann höherer Bildwiederholrate.
- Grafik hoch/ultra für Schatten und größere Sichtweiten einbeziehen.
- Ausreichend Frames sammeln und die synthetischen Szenarien mit normalem Spielen abgleichen.
- Erst danach #83–#85 anhand nachgewiesener Engpässe priorisieren und freigeben.

Das Messwerkzeug ist der erste Umsetzungsschritt. Issue #81 bleibt bis zur vollständigen Baseline offen; der zugehörige PR bleibt zunächst ein Entwurf.
