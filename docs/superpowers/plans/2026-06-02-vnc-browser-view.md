# VNC Browser View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Playwright-Browser (headless=False auf Xvfb :99) live im Host-Browser unter `http://localhost:6080/vnc.html` sichtbar machen.

**Architecture:** `x11vnc` liest das Xvfb-Display `:99` und stellt es als VNC-Stream auf `localhost:5900` bereit. `noVNC` (websockify) bridget diesen Stream auf Port 6080 als WebSocket+HTTP. Beide laufen als supervisord-Prozesse nach Xvfb (priority 2 und 3).

**Tech Stack:** x11vnc (apt), novnc (apt, enthält websockify + Web-UI), supervisord, Docker

---

## File Map

| File | Change |
|------|--------|
| `server/Dockerfile` | `x11vnc` + `novnc` zum apt-Block hinzufügen |
| `server/supervisord.conf` | `[program:x11vnc]` (priority=2) + `[program:novnc]` (priority=3) |
| `docker-compose.yml` | Port `6080:6080` beim `server`-Service |

---

## Task 1: x11vnc + novnc im Dockerfile installieren

**Files:**
- Modify: `server/Dockerfile`

- [ ] **Step 1: apt-Block um x11vnc und novnc erweitern**

  Aktuelle apt-Zeile (`server/Dockerfile`, Zeilen 9–16):

  ```dockerfile
  RUN apt-get update && apt-get install -y \
      build-essential \
      pkg-config \
      python3-dev \
      libcairo2-dev \
      supervisor \
      xvfb \
      && rm -rf /var/lib/apt/lists/*
  ```

  Ersetzen durch:

  ```dockerfile
  RUN apt-get update && apt-get install -y \
      build-essential \
      pkg-config \
      python3-dev \
      libcairo2-dev \
      supervisor \
      xvfb \
      x11vnc \
      novnc \
      && rm -rf /var/lib/apt/lists/*
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add server/Dockerfile
  git commit -m "chore: install x11vnc and novnc in Dockerfile"
  ```

---

## Task 2: x11vnc und noVNC als supervisord-Prozesse

**Files:**
- Modify: `server/supervisord.conf`

- [ ] **Step 1: x11vnc-Block nach [program:xvfb] einfügen**

  Füge direkt nach dem `[program:xvfb]`-Block (vor `[program:uvicorn]`) zwei neue Blöcke ein:

  ```ini
  [program:x11vnc]
  command=x11vnc -display :99 -nopw -listen localhost -xkb -forever -shared
  priority=2
  startsecs=2
  autorestart=true
  stdout_logfile=/dev/stdout
  stdout_logfile_maxbytes=0
  stderr_logfile=/dev/stderr
  stderr_logfile_maxbytes=0

  [program:novnc]
  command=/usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080
  priority=3
  startsecs=2
  autorestart=true
  stdout_logfile=/dev/stdout
  stdout_logfile_maxbytes=0
  stderr_logfile=/dev/stderr
  stderr_logfile_maxbytes=0
  ```

  Die vollständige Reihenfolge der Blöcke nach der Änderung:
  1. `[supervisord]`
  2. `[program:xvfb]` — priority=1
  3. `[program:x11vnc]` — priority=2 (neu)
  4. `[program:novnc]` — priority=3 (neu)
  5. `[program:uvicorn]`
  6. `[program:scraper_api]`
  7. `[program:celery]`
  8. `[program:scraper_celery]`

- [ ] **Step 2: Commit**

  ```bash
  git add server/supervisord.conf
  git commit -m "chore: add x11vnc and novnc supervisord processes"
  ```

---

## Task 3: Port 6080 in docker-compose.yml exposen

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Port 6080 beim server-Service hinzufügen**

  Aktueller `ports`-Block des `server`-Service (`docker-compose.yml`, Zeile 38–39):

  ```yaml
      ports:
        - "8002:8080"
  ```

  Ersetzen durch:

  ```yaml
      ports:
        - "8002:8080"
        - "6080:6080"
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docker-compose.yml
  git commit -m "chore: expose VNC port 6080 in docker-compose"
  ```

---

## Task 4: Manueller Smoke-Test

- [ ] **Step 1: Container neu bauen und starten**

  ```bash
  docker compose build
  docker compose up
  ```

  Erwartetes Ergebnis: Build ohne Fehler; alle Prozesse (inkl. x11vnc, novnc) starten ohne Exit.

- [ ] **Step 2: noVNC im Browser öffnen**

  `http://localhost:6080/vnc.html` im Browser aufrufen.

  Erwartetes Ergebnis: noVNC-Seite erscheint, nach Klick auf "Connect" sieht man den (leeren) Desktop-Hintergrund von Xvfb.

- [ ] **Step 3: Crawl triggern und Browser beobachten**

  Einen Crawl über die App-UI starten. Im noVNC-Fenster muss ein Chrome-Browserfenster erscheinen, das die gescrapte URL lädt.

- [ ] **Step 4: progress-tracker.md updaten**

  In `context/progress-tracker.md`:
  - **Scraper Worker**-Zeile: `+ noVNC auf Port 6080 (http://localhost:6080/vnc.html)` vermerken
  - Letzte Änderung aktualisieren auf `2026-06-02`

  ```bash
  git add context/progress-tracker.md
  git commit -m "docs: update progress tracker after VNC browser view"
  ```
