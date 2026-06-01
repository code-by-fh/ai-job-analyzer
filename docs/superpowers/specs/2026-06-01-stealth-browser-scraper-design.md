# Stealth Browser Scraper Design

**Date:** 2026-06-01

## Problem

Der Scraper wird auf einigen Job-Plattformen als Bot erkannt. Der aktuelle Playwright-Browser läuft mit `headless=True` und nur minimalem Anti-Detection (`--disable-blink-features=AutomationControlled`). Bot-Detection-Systeme können `navigator.webdriver`, Canvas-Fingerprints und andere Headless-Indikatoren erkennen.

## Solution

`playwright-stealth` + `headless=False` + Xvfb im Docker-Container.

## Scope

Vier Dateien. Kein Umbau der Scraper-Logik, kein neues Queue-Modell, kein neues Framework.

## Architecture

```
[HTTP-Fallback]  →  requests + Browser-Headers  (unverändert)
       ↓ (falls HTML unbrauchbar)
[Browser-Fetch]  →  Playwright headless=False + playwright-stealth
                     └─ DISPLAY=:99 (Xvfb virtual framebuffer)
```

Xvfb läuft als eigener supervisord-Prozess und startet vor allen anderen Diensten. Der Browser-Fetch-Pfad setzt `DISPLAY=:99`, Playwright öffnet ein sichtbares Chrome-Fenster im virtuellen Display.

## Changes

### 1. `Dockerfile`
- `xvfb` per apt installieren
- Basis-Image bleibt `mcr.microsoft.com/playwright/python:v1.41.0-jammy`

### 2. `requirements.txt`
- `playwright-stealth` hinzufügen

### 3. `supervisord.conf`
- Neuer Prozess `xvfb` mit `priority=1` (startet vor scraper/worker/api)
- Command: `Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp`

### 4. `server/workers/scraper_worker.py` — `get_html_with_browser()`
- `os.environ["DISPLAY"] = ":99"` vor dem Browser-Launch
- `headless=False`
- `from playwright_stealth import stealth_sync` importieren
- `stealth_sync(page)` nach `context.new_page()` aufrufen

## Error Handling

- Xvfb-Crash → supervisord restart policy `autorestart=true`
- Falls `DISPLAY` nicht gesetzt ist, schlägt `headless=False` mit einer klaren Exception fehl → loggt Fehler, Task schlägt fehl (bestehende Fehlerbehandlung greift)

## Testing

Manuell: Container starten, einen bekannt-blockierten URL crawlen, Scraper-Logs prüfen ob `get_html_with_browser` erfolgreiche Bytes zurückgibt.
