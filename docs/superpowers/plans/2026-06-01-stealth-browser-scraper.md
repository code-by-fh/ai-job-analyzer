# Stealth Browser Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright-Browser mit `playwright-stealth` und `headless=False` + Xvfb im Container betreiben, um Bot-Erkennung zu umgehen und den Browser im virtuellen Display sichtbar zu machen.

**Architecture:** Xvfb läuft als eigener supervisord-Prozess (priority=1, startet zuerst). `get_html_with_browser()` in `scraper_worker.py` setzt `DISPLAY=:99`, öffnet Playwright mit `headless=False` und patcht die Page mit `stealth_sync()`.

**Tech Stack:** Playwright 1.58, playwright-stealth, Xvfb (apt), supervisord

---

## File Map

| File | Change |
|------|--------|
| `server/requirements.txt` | `playwright-stealth` hinzufügen |
| `server/Dockerfile` | `xvfb` apt-Paket installieren |
| `server/supervisord.conf` | Xvfb-Prozess mit `priority=1` |
| `server/workers/scraper_worker.py` | `get_html_with_browser()` updaten |
| `server/tests/test_scraper_worker.py` | Test: stealth_sync wird aufgerufen |

---

## Task 1: playwright-stealth zu requirements.txt hinzufügen

**Files:**
- Modify: `server/requirements.txt`

- [ ] **Step 1: Zeile hinzufügen**

  Füge nach `playwright==1.58.0` ein:

  ```
  playwright-stealth==1.0.6
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add server/requirements.txt
  git commit -m "chore: add playwright-stealth to requirements"
  ```

---

## Task 2: Xvfb im Dockerfile installieren

**Files:**
- Modify: `server/Dockerfile`

- [ ] **Step 1: `xvfb` zum apt-install-Block hinzufügen**

  Aktuelle apt-Zeile:

  ```dockerfile
  RUN apt-get update && apt-get install -y \
      build-essential \
      pkg-config \
      python3-dev \
      libcairo2-dev \
      supervisor \
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
      && rm -rf /var/lib/apt/lists/*
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add server/Dockerfile
  git commit -m "chore: install xvfb in Dockerfile for headed browser support"
  ```

---

## Task 3: Xvfb-Prozess in supervisord.conf hinzufügen

**Files:**
- Modify: `server/supervisord.conf`

- [ ] **Step 1: Xvfb-Block am Anfang der Programm-Sektionen einfügen**

  Füge direkt nach dem `[supervisord]`-Block (vor `[program:uvicorn]`) ein:

  ```ini
  [program:xvfb]
  command=Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp
  priority=1
  autorestart=true
  stdout_logfile=/dev/stdout
  stdout_logfile_maxbytes=0
  stderr_logfile=/dev/stderr
  stderr_logfile_maxbytes=0
  ```

  `priority=1` stellt sicher, dass Xvfb vor allen anderen Prozessen startet.

- [ ] **Step 2: Commit**

  ```bash
  git add server/supervisord.conf
  git commit -m "chore: add xvfb supervisord process for headed browser"
  ```

---

## Task 4: scraper_worker.py — stealth_sync + headless=False

**Files:**
- Modify: `server/workers/scraper_worker.py`
- Test: `server/tests/test_scraper_worker.py`

- [ ] **Step 1: Failing test schreiben**

  Datei `server/tests/test_scraper_worker.py` — prüft ob `stealth_sync` auf der Page aufgerufen wird:

  ```python
  from unittest.mock import MagicMock, patch, call

  def test_get_html_with_browser_applies_stealth():
      mock_page = MagicMock()
      mock_page.content.return_value = "<html><body>test</body></html>"
      mock_context = MagicMock()
      mock_context.new_page.return_value = mock_page
      mock_browser = MagicMock()
      mock_browser.new_context.return_value = mock_context
      mock_playwright = MagicMock()
      mock_playwright.chromium.launch.return_value = mock_browser

      with patch("workers.scraper_worker._is_safe_url", return_value=True), \
           patch("workers.scraper_worker.sync_playwright") as mock_sync_pw, \
           patch("workers.scraper_worker.stealth_sync") as mock_stealth:
          mock_sync_pw.return_value.__enter__ = MagicMock(return_value=mock_playwright)
          mock_sync_pw.return_value.__exit__ = MagicMock(return_value=False)

          from workers.scraper_worker import get_html_with_browser
          result = get_html_with_browser("https://example.com")

      mock_stealth.assert_called_once_with(mock_page)
      assert result == "<html><body>test</body></html>"
  ```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

  ```bash
  cd server && pytest tests/test_scraper_worker.py::test_get_html_with_browser_applies_stealth -v
  ```

  Erwartetes Ergebnis: `FAILED` mit `ImportError: cannot import name 'stealth_sync'` oder `AssertionError`.

- [ ] **Step 3: `get_html_with_browser()` updaten**

  In `server/workers/scraper_worker.py` den Import-Block am Anfang der Datei ergänzen:

  ```python
  from playwright_stealth import stealth_sync
  ```

  Dann `get_html_with_browser()` ersetzen:

  ```python
  def get_html_with_browser(url):
      if not _is_safe_url(url):
          logger.warning(f"Blocked SSRF attempt for URL: {url}")
          return None
      os.environ["DISPLAY"] = ":99"
      logger.info(f"Launching browser for URL: {url}")
      start_time = time.time()
      with sync_playwright() as p:
          browser = p.chromium.launch(
              headless=False,
              args=[
                  "--disable-blink-features=AutomationControlled",
                  "--no-sandbox",
                  "--disable-setuid-sandbox",
              ],
          )
          context = browser.new_context(
              user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              viewport={"width": 1920, "height": 1080},
          )
          page = context.new_page()
          stealth_sync(page)
          try:
              logger.info(f"Navigating to {url}...")
              page.goto(url, timeout=60000, wait_until="domcontentloaded")

              sleep_time = random.uniform(2, 4)
              logger.info(f"Waiting {sleep_time:.2f}s for dynamic content...")
              time.sleep(sleep_time)

              content = page.content()
              duration = time.time() - start_time
              logger.info(
                  f"Successfully fetched {len(content)} bytes from {url} in {duration:.2f}s"
              )
              return content
          except Exception as e:
              logger.error(f"Playwright Error fetching {url}: {e}", exc_info=True)
              return None
          finally:
              browser.close()
              logger.info("Browser closed.")
  ```

- [ ] **Step 4: Test ausführen — muss grün sein**

  ```bash
  cd server && pytest tests/test_scraper_worker.py::test_get_html_with_browser_applies_stealth -v
  ```

  Erwartetes Ergebnis: `PASSED`

- [ ] **Step 5: Alle bestehenden Tests prüfen**

  ```bash
  cd server && pytest --tb=short -q
  ```

  Erwartetes Ergebnis: Alle Tests grün (oder gleiche Anzahl Fehler wie vor der Änderung).

- [ ] **Step 6: Commit**

  ```bash
  git add server/workers/scraper_worker.py server/tests/test_scraper_worker.py
  git commit -m "feat: add playwright-stealth and headed browser via Xvfb"
  ```

---

## Task 5: Manueller Smoke-Test im Container

- [ ] **Step 1: Container bauen**

  ```bash
  docker compose build
  ```

  Erwartetes Ergebnis: Build ohne Fehler.

- [ ] **Step 2: Container starten**

  ```bash
  docker compose up
  ```

- [ ] **Step 3: Scraper-Logs beobachten**

  In einem zweiten Terminal:

  ```bash
  docker compose logs -f scraper_celery
  ```

  Beim nächsten Crawl-Aufruf über die UI: Log muss `Launching browser for URL:` und `Successfully fetched N bytes` zeigen — **kein** `Playwright Error`.

- [ ] **Step 4: progress-tracker.md updaten**

  In `context/progress-tracker.md`:
  - **Scraper Worker**-Zeile: `playwright-stealth + headless=False + Xvfb` vermerken
  - Letzte Änderung aktualisieren auf `2026-06-01`

  ```bash
  git add context/progress-tracker.md
  git commit -m "docs: update progress tracker after stealth browser integration"
  ```
