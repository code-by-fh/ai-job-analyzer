# Render API — Playwright Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Playwright usage with an external render API (for HTML scraping) and WeasyPrint (for HTML→PDF), removing the Playwright/Chromium dependency from the server container entirely.

**Architecture:** A new `services/render_client.py` wraps the HTTP render API and is called by the scraper worker instead of launching a local browser. `html_to_pdf_playwright` in `document_renderer.py` is replaced by WeasyPrint, which renders HTML to PDF natively in-process. The base Docker image switches from the Microsoft Playwright image to `python:3.11-slim-bookworm` with the WeasyPrint system dependencies installed.

**Tech Stack:** `requests` (already in requirements) for the render API client, `weasyprint` for PDF generation, `python:3.11-slim-bookworm` as new Docker base image.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/services/render_client.py` | **Create** | HTTP wrapper for the render API |
| `server/tests/test_render_client.py` | **Create** | Unit tests for render_client |
| `server/workers/scraper_worker.py` | **Modify** | Replace `get_html_with_browser` with render_client call |
| `server/tests/test_scraper_worker.py` | **Modify** | Remove Playwright stubs, mock render_client instead |
| `server/services/document_renderer.py` | **Modify** | Replace `html_to_pdf_playwright` with WeasyPrint |
| `server/workers/tasks/package.py` | **Modify** | Update import: `html_to_pdf_playwright` → `html_to_pdf` |
| `server/requirements.txt` | **Modify** | Remove playwright/playwright-stealth, add weasyprint |
| `server/Dockerfile` | **Modify** | New base image, weasyprint system deps, remove Playwright install |
| `docker-compose.yml` | **Modify** | Add `RENDER_API_URL` env var to server service |

---

## Task 1: Create `render_client.py`

**Files:**
- Create: `server/services/render_client.py`
- Create: `server/tests/test_render_client.py`

- [ ] **Step 1.1: Write the failing tests**

```python
# server/tests/test_render_client.py
from unittest.mock import MagicMock, patch

import pytest

from services import render_client


def test_fetch_html_returns_plain_text_body():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html; charset=utf-8"}
    mock_resp.text = "<html><body>hello</body></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        result = render_client.fetch_html("https://example.com")

    assert result == "<html><body>hello</body></html>"
    payload = mock_post.call_args[1]["json"]
    assert payload["url"] == "https://example.com"
    assert "wait_for" not in payload


def test_fetch_html_extracts_html_field_from_json():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"html": "<html>test</html>"}
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp):
        result = render_client.fetch_html("https://example.com")

    assert result == "<html>test</html>"


def test_fetch_html_returns_none_on_request_error():
    with patch("services.render_client.requests.post", side_effect=Exception("connection refused")):
        result = render_client.fetch_html("https://example.com")

    assert result is None


def test_fetch_html_includes_wait_for_in_payload():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html"}
    mock_resp.text = "<html></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        render_client.fetch_html("https://example.com", wait_for="#main")

    payload = mock_post.call_args[1]["json"]
    assert payload["wait_for"] == "#main"


def test_fetch_html_passes_custom_timeout():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html"}
    mock_resp.text = "<html></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        render_client.fetch_html("https://example.com", timeout=20)

    payload = mock_post.call_args[1]["json"]
    assert payload["timeout"] == 20
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```
cd server
pytest tests/test_render_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'services.render_client'`

- [ ] **Step 1.3: Implement `render_client.py`**

```python
# server/services/render_client.py
import logging
import os

import requests

logger = logging.getLogger(__name__)

_RENDER_API_URL = os.getenv("RENDER_API_URL", "http://localhost:8000/render")
_HTTP_TIMEOUT = int(os.getenv("RENDER_API_HTTP_TIMEOUT", "90"))


def fetch_html(url: str, wait_for: str | None = None, timeout: int = 60) -> str | None:
    """Fetch rendered HTML for *url* from the render API.

    Returns the HTML string, or None if the request fails.
    The render API is called with a page-level timeout so the browser
    stops waiting after *timeout* seconds — the HTTP client waits up
    to _HTTP_TIMEOUT seconds for the whole request.
    """
    payload: dict = {"url": url, "timeout": timeout}
    if wait_for:
        payload["wait_for"] = wait_for
    try:
        resp = requests.post(
            _RENDER_API_URL,
            json=payload,
            timeout=_HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            return resp.json().get("html")
        return resp.text
    except Exception as e:
        logger.error(f"[RenderClient] Failed to fetch {url}: {e}", exc_info=True)
        return None
```

- [ ] **Step 1.4: Run tests — expect all 5 to pass**

```
cd server
pytest tests/test_render_client.py -v
```

Expected: 5 passed

- [ ] **Step 1.5: Commit**

```bash
git add server/services/render_client.py server/tests/test_render_client.py
git commit -m "feat(scraper): add render_client HTTP wrapper for render API"
```

---

## Task 2: Replace Playwright in `scraper_worker.py`

**Files:**
- Modify: `server/workers/scraper_worker.py`
- Modify: `server/tests/test_scraper_worker.py`

- [ ] **Step 2.1: Update `test_scraper_worker.py` — new test that mocks render_client**

Replace the entire file with:

```python
# server/tests/test_scraper_worker.py
from unittest.mock import patch

import workers.scraper_worker  # noqa: F401 — imported for side-effect checks
from workers.scraper_worker import get_html_with_browser


def test_get_html_with_browser_calls_render_client():
    with patch("workers.scraper_worker._is_safe_url", return_value=True), \
         patch("workers.scraper_worker.render_client.fetch_html", return_value="<html>ok</html>") as mock_fetch:
        result = get_html_with_browser("https://example.com")

    mock_fetch.assert_called_once_with("https://example.com")
    assert result == "<html>ok</html>"


def test_get_html_with_browser_blocks_ssrf():
    with patch("workers.scraper_worker._is_safe_url", return_value=False), \
         patch("workers.scraper_worker.render_client.fetch_html") as mock_fetch:
        result = get_html_with_browser("http://192.168.1.1")

    mock_fetch.assert_not_called()
    assert result is None


def test_get_html_with_browser_returns_none_on_render_failure():
    with patch("workers.scraper_worker._is_safe_url", return_value=True), \
         patch("workers.scraper_worker.render_client.fetch_html", return_value=None):
        result = get_html_with_browser("https://example.com")

    assert result is None
```

- [ ] **Step 2.2: Run tests — expect failures (old implementation still in place)**

```
cd server
pytest tests/test_scraper_worker.py -v
```

Expected: FAIL — tests reference `render_client` which isn't imported yet in `scraper_worker`

- [ ] **Step 2.3: Replace Playwright code in `scraper_worker.py`**

Remove the two Playwright imports at the top of the file:

```python
# REMOVE these two lines:
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
```

Add the render_client import after the existing imports block:

```python
from services import render_client
```

Replace the entire `get_html_with_browser` function (lines 90–140) with:

```python
def get_html_with_browser(url: str) -> str | None:
    if not _is_safe_url(url):
        logger.warning(f"Blocked SSRF attempt for URL: {url}")
        return None
    logger.info(f"[RenderClient] Fetching: {url}")
    html = render_client.fetch_html(url)
    if html:
        logger.info(f"[RenderClient] Fetched {len(html)} bytes from {url}")
    else:
        logger.error(f"[RenderClient] Empty response for {url}")
    return html
```

The `get_html` function above it calls `get_html_with_browser` and stays unchanged.

- [ ] **Step 2.4: Run the updated tests**

```
cd server
pytest tests/test_scraper_worker.py -v
```

Expected: 3 passed

- [ ] **Step 2.5: Commit**

```bash
git add server/workers/scraper_worker.py server/tests/test_scraper_worker.py
git commit -m "feat(scraper): replace Playwright browser with render API via render_client"
```

---

## Task 3: Replace `html_to_pdf_playwright` with WeasyPrint

**Files:**
- Modify: `server/services/document_renderer.py`
- Modify: `server/workers/tasks/package.py`
- Modify: `server/tests/test_document_renderer.py`

- [ ] **Step 3.1: Add WeasyPrint test to `test_document_renderer.py`**

Append this test to the existing file:

```python
def test_html_to_pdf_returns_pdf_bytes():
    from services.document_renderer import html_to_pdf
    html = "<html><body><h1>Test CV</h1></body></html>"
    pdf = html_to_pdf(html)
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
```

- [ ] **Step 3.2: Run test to confirm it fails**

```
cd server
pytest tests/test_document_renderer.py::test_html_to_pdf_returns_pdf_bytes -v
```

Expected: FAIL — `ImportError: cannot import name 'html_to_pdf'`

- [ ] **Step 3.3: Replace `html_to_pdf_playwright` in `document_renderer.py`**

Remove the `_block_external` function and the entire `html_to_pdf_playwright` function. Add the new function in their place:

```python
def html_to_pdf(html: str) -> bytes:
    """Render HTML string to PDF bytes using WeasyPrint."""
    import weasyprint
    return weasyprint.HTML(string=html).write_pdf()
```

The file section between `_html_to_pdf` and `render_cv_pdf` should now look like:

```python
def _html_to_pdf(html: str) -> bytes:
    buf = BytesIO()
    status = pisa.CreatePDF(html, dest=buf, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"PDF generation failed (xhtml2pdf err={status.err})")
    return buf.getvalue()


def html_to_pdf(html: str) -> bytes:
    """Render HTML string to PDF bytes using WeasyPrint."""
    import weasyprint
    return weasyprint.HTML(string=html).write_pdf()


def render_cv_pdf(cv_data: dict, template_key: str = "classic") -> bytes:
    ...
```

- [ ] **Step 3.4: Update the import in `package.py`**

In `server/workers/tasks/package.py` line 19, change:

```python
# Before
from services.document_renderer import render_cv_pdf, render_cover_letter_pdf, html_to_pdf_playwright
```

```python
# After
from services.document_renderer import render_cv_pdf, render_cover_letter_pdf, html_to_pdf
```

Then update the three call sites in the same file:
- Line 100: `cv_pdf = html_to_pdf_playwright(job.cv_html)` → `cv_pdf = html_to_pdf(job.cv_html)`
- Line 129: `letter_pdf = html_to_pdf_playwright(job.cover_letter_html)` → `letter_pdf = html_to_pdf(job.cover_letter_html)`
- Line 246: `pdf = html_to_pdf_playwright(html)` → `pdf = html_to_pdf(html)`

- [ ] **Step 3.5: Run all document renderer tests**

```
cd server
pytest tests/test_document_renderer.py -v
```

Expected: 4 passed (3 existing + 1 new `test_html_to_pdf_returns_pdf_bytes`)

- [ ] **Step 3.6: Commit**

```bash
git add server/services/document_renderer.py server/workers/tasks/package.py server/tests/test_document_renderer.py
git commit -m "feat(pdf): replace html_to_pdf_playwright with WeasyPrint"
```

---

## Task 4: Update dependencies

**Files:**
- Modify: `server/requirements.txt`
- Modify: `server/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 4.1: Update `requirements.txt`**

Remove these two lines:
```
playwright==1.58.0
playwright-stealth==1.0.6
```

Add after `xhtml2pdf==0.2.17`:
```
weasyprint
```

Pin weasyprint after confirming the installed version:
```
pip show weasyprint | grep Version
```
Then pin: `weasyprint==XX.Y`

- [ ] **Step 4.2: Replace the Dockerfile base image and install WeasyPrint system deps**

Replace the entire Dockerfile with:

```dockerfile
FROM python:3.11-slim-bookworm

WORKDIR /app

# WeasyPrint needs Pango/Cairo/GDK-PixBuf for PDF rendering
RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    python3-dev \
    libcairo2-dev \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user and set up permissions
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
RUN mkdir -p /app/uploads /var/log/supervisor && \
    chown -R appuser:appgroup /app /var/log/supervisor && \
    chmod -R 755 /var/log/supervisor

COPY . .
RUN chown -R appuser:appgroup /app
RUN chmod +x entrypoint.sh

USER appuser

ENTRYPOINT ["./entrypoint.sh"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Note: `xvfb`, `x11vnc`, `novnc` are removed — they were only needed for the Playwright headless display. Port 6080 (noVNC) can also be removed from `docker-compose.yml`.

- [ ] **Step 4.3: Add `RENDER_API_URL` to `docker-compose.yml`**

In the `server` service `environment` block, add after `PYTHONUNBUFFERED`:

```yaml
- RENDER_API_URL=${RENDER_API_URL:-http://host.docker.internal:8000/render}
```

This default uses `host.docker.internal` so the render API running on the host machine is accessible from inside the container. Override `RENDER_API_URL` in `.env` if the render API runs as its own container.

Also remove the now-unused port mapping `- "6080:6080"` from the server service.

- [ ] **Step 4.4: Verify the full test suite still passes**

```
cd server
pytest tests/ -v
```

Expected: all existing tests pass (WeasyPrint is installed, render_client mocked in tests)

- [ ] **Step 4.5: Commit**

```bash
git add server/requirements.txt server/Dockerfile docker-compose.yml
git commit -m "chore: remove Playwright dependency, add WeasyPrint + render API env config"
```

---

## Task 5: Integration smoke test

**Goal:** Verify the scraper calls the render API over the wire, and PDF generation works.

- [ ] **Step 5.1: Start the render API locally**

```bash
# In a separate terminal, ensure the render API is running:
curl -X POST http://localhost:8000/render \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Expected: Response contains `<html>` content (not an error).

- [ ] **Step 5.2: Run a manual scrape via the Celery task**

```python
# From server/ with the app running:
from workers.scraper_worker import get_html
html = get_html("https://example.com")
assert html and len(html) > 100
print(f"OK — got {len(html)} bytes")
```

- [ ] **Step 5.3: Verify PDF generation works in-process**

```python
from services.document_renderer import html_to_pdf
pdf = html_to_pdf("<html><body><h1>Test</h1></body></html>")
assert pdf[:4] == b"%PDF"
print("PDF OK")
```

- [ ] **Step 5.4: Run the full test suite one final time**

```
cd server
pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 5.5: Final commit**

```bash
git add -p  # stage any leftover changes
git commit -m "chore: finalize render API migration, all tests green"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| Replace scraper Playwright with render API | Task 2 — `get_html_with_browser` replaced |
| Configure render API URL | Task 4 — `RENDER_API_URL` env var |
| Replace PDF Playwright | Task 3 — WeasyPrint |
| Remove Playwright from container | Task 4 — Dockerfile + requirements |
| SSRF protection preserved | Task 2 — `_is_safe_url` check kept |
| Tests updated | Tasks 1, 2, 3 |

### Notes

- **Render API response format:** The client handles both `application/json` (extracts `.html` field) and plain text/HTML responses. If the actual API uses a different envelope, adjust `render_client.fetch_html` accordingly.
- **WeasyPrint system deps:** The Dockerfile installs `libpango-1.0-0`, `libgdk-pixbuf-2.0-0` etc. If the Docker build fails on a missing lib, run `weasyprint --info` inside the container to see what's missing.
- **noVNC removed:** Port 6080 and `xvfb`/`x11vnc`/`novnc` are removed because they only served the Playwright headless display. If you want to keep a debug VNC for other purposes, add them back manually.
