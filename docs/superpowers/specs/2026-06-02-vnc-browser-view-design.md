# VNC Browser View Design

**Date:** 2026-06-02

## Problem

Der Playwright-Browser läuft mit `headless=False` auf Xvfb-Display `:99` im Container. Von außen ist der Browser nicht sichtbar, weil Xvfb ein virtuelles Display ist. Zum Debuggen von Bot-Detection-Problemen muss man sehen können, was der Browser anzeigt.

## Solution

`x11vnc` liest das Xvfb-Display `:99` und stellt es als VNC-Stream bereit. `noVNC` (websockify) bridget diesen VNC-Stream auf Port 6080 als WebSocket, sodass man den Browser live via `http://localhost:6080/vnc.html` sehen kann.

## Scope

Vier Dateien. Immer aktiv (nicht nur dev). Optionales VNC-Passwort via `VNC_PASSWORD` env-var.

## Architecture

```
Chrome (headless=False)
    ↓ rendert auf
Xvfb :99
    ↓ liest Display
x11vnc → VNC-Protokoll auf localhost:5900
    ↓ bridget
websockify/noVNC → WebSocket + HTTP auf 0.0.0.0:6080
    ↓
Browser: http://<host>:6080/vnc.html
```

Startup-Reihenfolge via supervisord-Prioritäten:
- priority=1: Xvfb (bereits vorhanden)
- priority=2: x11vnc (braucht Xvfb)
- priority=3: noVNC/websockify (braucht x11vnc)
- priority=999 (default): uvicorn, celery, scraper_celery

## Changes

### 1. `server/Dockerfile`
`x11vnc` und `novnc` per apt installieren (novnc-Paket enthält websockify + Web-UI).

### 2. `server/supervisord.conf`

**x11vnc** (priority=2):
```ini
[program:x11vnc]
command=x11vnc -display :99 -nopw -listen localhost -xkb -forever -shared
priority=2
autorestart=true
```

Wenn `VNC_PASSWORD` gesetzt: `x11vnc -display :99 -passwd %(ENV_VNC_PASSWORD)s -listen localhost -xkb -forever -shared`

**noVNC** (priority=3):
```ini
[program:novnc]
command=/usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080
priority=3
autorestart=true
```

### 3. `docker-compose.yml`
Port `6080:6080` beim `server`-Service hinzufügen.

## Security

- Ohne `VNC_PASSWORD`: Port 6080 ist offen zugänglich. In Produktion hinter Reverse Proxy oder Firewall schützen.
- Mit `VNC_PASSWORD` (via `.env`): x11vnc fragt beim Verbinden nach Passwort.
- x11vnc lauscht nur auf `localhost` (nicht direkt exponiert) — websockify ist der einzige Einstiegspunkt.

## Testing

Manuell: Container starten, `http://localhost:6080/vnc.html` im Browser öffnen, Crawl triggern → Chrome-Fenster im Browser sehen.
