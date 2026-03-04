---
date: 2026-03-04T12:00:00+01:00
researcher: Claude
git_commit: e893edf9f0bf029f0fa506383e5d49b38b799ead
branch: main
repository: job-agent-mvp
topic: "Wie funktioniert das Suchen von Jobs auf einer Platform?"
tags: [research, codebase, scraping, platforms, celery, playwright]
status: complete
last_updated: 2026-03-04
last_updated_by: Claude
---

# Research: Wie funktioniert das Suchen von Jobs auf einer Platform?

**Date**: 2026-03-04
**Git Commit**: e893edf
**Branch**: main

## Research Question
Wie funktioniert das Suchen von Jobs auf einer Platform? (End-to-End Flow)

## Summary

Das System crawlt Job-Plattformen über eine mehrstufige Celery-Task-Chain: Celery Beat prüft alle 5 Minuten welche Plattformen fällig sind → Playwright holt die Index-Seite → KI erkennt URL-Muster für Stellenanzeigen → Detailseiten werden parallel gescrapt → KI bewertet den Match-Score → Ergebnisse landen in PostgreSQL. Der gesamte Fortschritt wird in Echtzeit über Redis/WebSocket ans Frontend gemeldet.

## Detailed Findings

### 1. Platform-Konfiguration (Datenmodell)

**`server/database.py:76-91`** — SQLAlchemy Model `JobPlatform`:

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `url` | String | Die zu crawlende Plattform-URL |
| `name` | String | Aus Domain abgeleitet |
| `crawl_interval_minutes` | Integer (default: 1440) | Crawl-Intervall (24h default) |
| `last_crawl_at` | DateTime | Letzter erfolgreicher Crawl |
| `is_active` | Boolean | Aktiviert/deaktiviert periodisches Crawling |
| `is_notification_enabled` | Boolean | Benachrichtigungen bei neuen Jobs |
| `notification_adapters` | JSON | Liste: GMAIL, PUSHOVER |

Jede Platform gehört zu einem User (`user_id` FK) und hat eine 1:n Beziehung zu `JobEntry`.

### 2. Auslöser: Celery Beat (alle 5 Minuten)

**`server/celery_config.py:10-16`** — Beat Schedule:
```python
"check-crawls-every-5-min": {
    "task": "ai.check_platforms_for_crawl",
    "schedule": 300.0,
    "options": {"queue": "ai_queue"},
}
```

**`server/worker.py:785-849`** — `check_platforms_for_crawl()`:
1. Holt alle aktiven Plattformen (`is_active == True`)
2. Prüft ob Crawl fällig: `last_crawl_at` ist NULL oder Intervall überschritten
3. Für jede fällige Platform: POST an `SCRAPER_SERVICE_URL/search` mit:
   ```json
   { "query": "<platform-url>", "location": "Remote",
     "user_id": <id>, "platform_id": <id>, "is_initial_run": true/false }
   ```
4. Setzt `last_crawl_at` auf aktuelle Zeit

### 3. Scraper API: Crawl starten

**`server/scraper_api.py:143-177`** — `POST /search`:
1. Erstellt eine eindeutige `job_id` (UUID4)
2. Initialisiert Redis-Hash `crawl_job:{job_id}` mit Status "starting"
3. Startet **Celery Task-Chain**:
   ```
   scraper.fetch_links → ai.filter_urls → scraper.schedule_crawls
   ```

### 4. Schritt 1: Links sammeln (fetch_links)

**`server/scraper_worker.py:112-181`** — `scraper.fetch_links`:
1. **Playwright** (Chromium, headless) öffnet die Platform-URL
   - Anti-Detection: `--disable-blink-features=AutomationControlled`
   - User-Agent: Chrome 120 auf Windows 10
   - Timeout: 60s, wartet auf `domcontentloaded`
   - Random Sleep 2-4s für dynamischen Content
2. **BeautifulSoup** extrahiert alle `<a href>` Tags
3. Filter: Nur gleiche Domain, keine Datei-Downloads (.pdf, .jpg etc.)
4. Redis: Status → "fetching_links", publiziert `crawl_job_started`

**Output**: `[start_url, alle_links, user_id, job_id, platform_id]`

### 5. Schritt 2: URLs filtern (filter_urls)

**`server/worker.py:225-342`** — `ai.filter_urls`:
1. **Bekannte Muster prüfen**: Schaut in `DomainUrlPattern`-Tabelle
   - Falls Pattern existiert: filtert URLs wo `pattern in url.path`
2. **KI-Erkennung** (falls unbekannte Domain oder 0 Treffer):
   - Sendet 150 Sample-URLs an OpenRouter LLM
   - LLM identifiziert das URL-Pattern für Stellendetailseiten (z.B. `/jobs/`, `/stellenangebote/`)
   - Speichert Pattern in `DomainUrlPattern` für künftige Crawls
3. **Deduplizierung**: Vergleicht mit bereits vorhandenen URLs in `JobEntry`-Tabelle

**Output**: `[gefilterte_urls, user_id, job_id, platform_id]`

### 6. Schritt 3: Detail-Crawls planen (schedule_crawls)

**`server/scraper_worker.py:183-272`** — `scraper.schedule_crawls`:
- Setzt Redis: `total` = Anzahl URLs, `status` = "crawling"
- Dispatcht für jede URL einen `scraper.scrape_detail` Task auf `scraper_queue`

### 7. Schritt 4: Detailseiten scrapen (scrape_detail)

**`server/scraper_worker.py:274-350`** — `scraper.scrape_detail`:
1. **Playwright** holt die Detailseite (gleiche Browser-Konfiguration)
2. **HTML-Bereinigung** mit BeautifulSoup:
   - Entfernt: `script`, `style`, `nav`, `footer`, `header`, `iframe`, `noscript`, `button`, `form`
   - Entfernt Textblöcke mit: "Cookies", "Privatsphäre", "Datenschutz", "consent", "Partner"
3. **Konvertierung** HTML → Markdown via `markdownify`
4. **Job-Daten** erstellen:
   ```python
   { "id": uuid5(user_id:url), "title": <h1>, "company": domain,
     "description": content[:4000], "url": url, ... }
   ```
5. Queued `ai.analyze_job` auf `ai_queue`

### 8. Schritt 5: KI-Analyse (analyze_job)

**`server/worker.py:345-641`** — `ai.analyze_job`:
1. **Duplikat-Check**: Überspringt wenn Job-ID schon in DB
2. **Initial Run**: Bei `is_initial_run == True` → Score 0, keine LLM-Analyse (Kostenersparnis)
3. **Profil laden**: User-Profil mit CV-Daten (`format_cv_for_prompt()`)
4. **LLM-Bewertung** via OpenRouter:
   - Prompt: Job-Titel + Beschreibung (3000 Zeichen) + User-Profil
   - Output: `{ "score": 0-100, "reason_de": "..." }`
   - Temperature: 0.0
5. **Speichern**: `JobEntry` mit `match_score`, `reasoning`, Status "OPEN"
6. **Benachrichtigung**: Falls Platform `is_notification_enabled` → Gmail/Pushover

### 9. Echtzeit-Fortschritt (Redis + WebSocket)

**Redis State** (`crawl_job:{job_id}` Hash):
- `status`: "starting" → "fetching_links" → "crawling" → "completed"/"failed"
- `total`, `scraping_completed`, `analysis_completed`, `jobs_saved`
- TTL: 1 Stunde

**WebSocket Events** (Pub/Sub Channel `job_updates`):
- `crawl_job_started`, `crawl_job_progress`, `crawl_job_completed`, `crawl_job_failed`
- `job_analysis_started`, `job_analysis_finished`, `job_skipped`, `new_job`

### 10. Frontend: Platform-Verwaltung

**`frontend/app/components/JobPlatformsManager.tsx`** — Auf dem Dashboard:
- Zeigt alle Plattformen mit Favicon, Name, Status, Job-Anzahl
- Einstellbar: Crawl-Intervall (1h, 6h, 12h, 24h, 1 Woche), Aktiv-Toggle, Notification-Adapter
- "Sync"-Button löst manuellen Crawl aus: `POST /platforms/{id}/crawl`
- Polling alle 5 Sekunden für aktive Crawl-Status

**`frontend/app/hooks/useCrawl.ts`** — WebSocket-Verbindung:
- Empfängt alle Crawl-Events in Echtzeit
- Aktualisiert `activeCrawls` Map im State
- Auto-Reconnect bei Verbindungsabbruch

**`frontend/app/components/CrawlStatus.tsx`** — 4-Stufen-Pipeline-Anzeige:
1. Search → 2. Found (X jobs) → 3. Process Details → 4. Analysis

## Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────┐
│ Celery Beat (alle 5 min)                                │
│   → check_platforms_for_crawl()                         │
│   → Findet fällige Plattformen (is_active, Intervall)   │
│   → POST /scraper/search                                │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Task-Chain (Celery)                                      │
│                                                          │
│  1. scraper.fetch_links (scraper_queue)                  │
│     Playwright → Index-Seite → BeautifulSoup → Links     │
│                     ▼                                    │
│  2. ai.filter_urls (ai_queue)                            │
│     URL-Pattern erkennen (DB oder LLM) → Deduplizieren   │
│                     ▼                                    │
│  3. scraper.schedule_crawls (scraper_queue)               │
│     Für jede URL → scraper.scrape_detail dispatchen      │
│                     ▼                                    │
│  4. scraper.scrape_detail (scraper_queue, parallel)       │
│     Playwright → Detailseite → Clean HTML → Markdown     │
│     → Queued ai.analyze_job                              │
│                     ▼                                    │
│  5. ai.analyze_job (ai_queue, parallel)                   │
│     Duplikat-Check → LLM Score → DB speichern            │
│     → Notification senden (optional)                     │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Echtzeit-Updates                                         │
│  Redis Pub/Sub → WebSocket → Frontend                    │
│  CrawlStatus-Component zeigt 4-Stufen-Pipeline           │
└─────────────────────────────────────────────────────────┘
```

## Code References

- `server/database.py:76-91` — JobPlatform Model
- `server/celery_config.py:10-16` — Beat Schedule (5 min)
- `server/worker.py:785-849` — check_platforms_for_crawl Task
- `server/scraper_api.py:143-177` — POST /search Endpoint + Task-Chain
- `server/scraper_worker.py:112-181` — fetch_links (Playwright + BeautifulSoup)
- `server/worker.py:225-342` — filter_urls (KI Pattern-Erkennung)
- `server/scraper_worker.py:183-272` — schedule_crawls
- `server/scraper_worker.py:274-350` — scrape_detail (Detailseite → Markdown)
- `server/worker.py:345-641` — analyze_job (LLM-Bewertung + DB-Speicherung)
- `frontend/app/components/JobPlatformsManager.tsx` — Platform-UI
- `frontend/app/hooks/useCrawl.ts` — WebSocket + Crawl-Status
- `frontend/app/components/CrawlStatus.tsx` — 4-Stufen-Pipeline-Anzeige
