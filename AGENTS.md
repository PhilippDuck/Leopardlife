# Arbeitsablauf

- Lege für Änderungen an LeoLife einen eigenen Git-Worktree mit einem Arbeitsbranch unter `~/Leopardlife-worktrees/` an.
- Committe abgeschlossene Änderungen auf dem Arbeitsbranch, pushe ihn und öffne einen Pull Request gegen den Zielbranch. Der Standard-Zielbranch ist `main`.

## Versionierung

- Verwende für LeoLife das Schema `MAJOR.MINOR.PATCH`.
- Ändere die Major-Version nur auf ausdrückliche Anweisung von Philipp.
- Wähle bei Änderungen am Spiel selbst zwischen Minor für neue Funktionen und Patch für Fehlerkorrekturen oder kleine Anpassungen. Führe `python3 tools/bump-sw.py minor` oder `python3 tools/bump-sw.py patch` aus, um die App-Version und den Offline-Cache gemeinsam zu aktualisieren.

## Aufgaben und paralleles Arbeiten

Offene Aufgaben (Etappen, Fehler, Ideen) sind GitHub-Issues. Mehrere Agenten können gleichzeitig arbeiten, jeder an genau einem Issue.

**Labels**
- `etappe-3`, `etappe-4`, `etappe-5`: zu welcher Etappe die Aufgabe gehört
- `bereit`: kann sofort begonnen werden
- `in-arbeit`: von einem Agenten reserviert
- `blockiert`: wartet auf andere Aufgaben (steht im Issue)
- `braucht-entscheidung`: erst nach Philipps Entscheidung umsetzen
- `anspielen`: braucht Rückmeldung aus dem Spiel, nicht selbst umsetzen

**Aufgabe finden:** `gh issue list --label bereit`. Ohne ausdrücklichen Auftrag die niedrigste Etappe zuerst.

**Reservieren**
1. Nur Issues mit `bereit` und ohne `in-arbeit` nehmen.
2. `gh issue edit <nr> --add-label in-arbeit --remove-label bereit` und einen Kommentar schreiben: `Reserviert: <Agent/Thread>, Branch <branch>`.
3. Danach die Kommentare erneut lesen. Hat ein anderer Agent früher reserviert, gilt dessen Reservierung: eigenen Kommentar zurückziehen und ein anderes Issue nehmen.
4. Hinweise wie „nicht gleichzeitig mit …“ im Issue beachten: Ist die genannte Aufgabe `in-arbeit`, eine andere wählen.

**Arbeiten**
- Worktree unter `~/Leopardlife-worktrees/<kurzname>` mit einem Branch von `origin/main` anlegen. PRs nicht aufeinander stapeln.
- Die PR-Beschreibung beginnt mit `Closes #<nr>`.
- Was beim Arbeiten zusätzlich auffällt, als neues Issue anlegen statt nebenbei umzusetzen.
- Abbrechen: Label wieder auf `bereit` setzen und den Stand kommentieren.

**Versionskonflikte:** Parallele PRs ändern alle `sw.js` und `src/version.js`. Vor dem Merge auf `origin/main` rebasen, bei Konflikten in diesen beiden Dateien den Stand von `main` übernehmen und `tools/bump-sw.py` erneut ausführen.

**Nach dem Merge:** Worktree mit `git worktree remove` und den lokalen Branch entfernen.
