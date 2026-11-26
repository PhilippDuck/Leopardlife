# LeoLife-Relay (Online-Spiel)

Kleiner WebSocket-Server, über den mehrere Geräte gemeinsam LeoLife spielen. Er rechnet nichts vom Spiel, sondern verwaltet nur Räume und leitet Nachrichten weiter. Das Spiel selbst bleibt auf GitHub Pages.

## Auf dem NAS starten (Docker)

1. Den Ordner `server/` auf das NAS kopieren (oder das Repo dort klonen).
2. `.env.example` nach `.env` kopieren. Wichtig ist nur die Herkunft des Spiels:
   ```
   ALLOWED_ORIGINS=https://philippduck.github.io
   ```
   Einen Schlüssel braucht es nicht: Das Spiel ist öffentlicher Code, ein Schlüssel darin wäre für jeden lesbar. Den Server schützen die erlaubte Herkunft, die Raumcodes und die Grenzen unten.
3. Starten:
   ```
   docker compose up -d --build
   ```
4. Prüfen: `http://<NAS-IP>:8090/` zeigt „LeoLife-Relay läuft“.

Der Container hört intern auf Port 8080; `docker-compose.yml` gibt ihn auf dem NAS als Port **8090** frei. Ist 8090 schon belegt („port is already allocated“), in `.env` einen freien Port setzen, z. B. `RELAY_PORT=8091`, und diesen auch im Proxy Manager eintragen. Läuft Nginx Proxy Manager im selben Docker-Netz, kann der Port-Eintrag entfallen (siehe Kommentar in `docker-compose.yml`).

## Nginx Proxy Manager

Unter **Hosts → Proxy Hosts → Add Proxy Host**:

| Feld | Wert |
|---|---|
| Domain Names | z. B. `leolife.deinedomain.de` |
| Scheme | `http` |
| Forward Hostname / IP | IP des NAS (oder `leolife-relay`, wenn im selben Docker-Netz) |
| Forward Port | `8090` (bzw. `8080` im selben Docker-Netz) |
| **Websockets Support** | **an** (ohne geht die Verbindung nicht) |
| Block Common Exploits | an |

Im Reiter **SSL**: „Request a new SSL Certificate“ (Let's Encrypt), **Force SSL** und **HTTP/2 Support** an.

Voraussetzungen: Die Domain (oder DynDNS-Adresse) zeigt auf deinen Anschluss, und der Router leitet Port 443 (und für das Zertifikat Port 80) an Nginx Proxy Manager weiter.

## Im Spiel

Startbildschirm oder Pause-Menü → **Online spielen**:

- Das Spiel verbindet sich von selbst mit `wss://leolife.duck-box.de`. Einen anderen Server (und ggf. Schlüssel) trägt man unter **Eigener Server** ein.
- **Raum öffnen** zeigt einen Code aus 4 Buchstaben. Die anderen tragen ihn ein und tippen auf **Beitreten**.

Wer beitritt, spielt in der Welt des Gastgebers: Das Spiel lädt einmal neu und verbindet sich von selbst wieder. Der eigene Spielstand bleibt auf dem eigenen Gerät. Beim Verlassen des Raums lädt das Spiel wieder die eigene Welt.

## Einstellungen (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `ALLOWED_ORIGINS` | – (Pflicht ohne Schlüssel) | erlaubte Webseiten, Komma-getrennt (z. B. `https://philippduck.github.io`) |
| `RELAY_KEY` | – | freiwilliger Schlüssel; alle Spieler müssen ihn dann eintragen |
| `MAX_PEERS` | 8 | Geräte je Raum |
| `MAX_ROOMS` | 50 | gleichzeitige Räume |
| `MAX_MSG_BYTES` | 32768 | größte Nachricht |
| `MAX_MSG_PER_SEC` | 60 | Nachrichten je Sekunde und Gerät |
| `RELAY_PORT` | 8090 | Port auf dem NAS (nur `docker-compose.yml`) |
| `PORT` | 8080 | Port im Container |
| `RELAY_OPEN` | – | `1` erlaubt den Start ohne Schlüssel und ohne `ALLOWED_ORIGINS` (nur zum Ausprobieren im Heimnetz) |

## Entwickeln und testen

```
cd server && npm install
node test.js                      # Relay-Test
RELAY_OPEN=1 node relay.js       # lokal starten (ws://localhost:8080)
```

Zum Ausprobieren ohne HTTPS das Spiel lokal ausliefern (z. B. `python3 -m http.server 8000` im Repo) und unter **Eigener Server** `ws://localhost:8080` eintragen. Für den Test mit zwei Browsern: `node tests/online-browser.cjs` (braucht Playwright).
