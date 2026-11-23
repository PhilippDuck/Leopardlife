# Arbeitsablauf

- Lege für Änderungen an LeoLife einen eigenen Git-Worktree mit einem Arbeitsbranch an.
- Committe abgeschlossene Änderungen auf dem Arbeitsbranch, pushe ihn und öffne einen Pull Request gegen den Zielbranch. Der Standard-Zielbranch ist `main`.

## Versionierung

- Verwende für LeoLife das Schema `MAJOR.MINOR.PATCH`.
- Ändere die Major-Version nur auf ausdrückliche Anweisung von Philipp.
- Wähle bei Änderungen am Spiel selbst zwischen Minor für neue Funktionen und Patch für Fehlerkorrekturen oder kleine Anpassungen. Führe `python3 tools/bump-sw.py minor` oder `python3 tools/bump-sw.py patch` aus, um die App-Version und den Offline-Cache gemeinsam zu aktualisieren.
