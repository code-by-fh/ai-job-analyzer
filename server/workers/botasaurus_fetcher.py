import logging
import requests as _requests

from botasaurus.browser import browser, Driver

logger = logging.getLogger(__name__)

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}
_HTTP_TIMEOUT = (10, 20)


class _RequestsAdapter:
    """Wraps `requests` with the same .get(url) interface as the botasaurus AntiDetectRequests,
    keeping _call_request_scraper testable via dependency injection."""

    def get(self, url: str):
        resp = _requests.get(url, headers=_HTTP_HEADERS, timeout=_HTTP_TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        return resp


def _call_request_scraper(req, data: dict) -> str | None:
    url = data["url"]
    try:
        response = req.get(url)
        return response.text
    except Exception as e:
        logger.warning(f"[botasaurus/request] Failed to fetch {url}: {e}")
        return None


def _call_browser_scraper(driver: Driver, data: dict) -> str | None:
    url = data["url"]
    try:
        driver.get(url)
        return driver.page_html
    except Exception as e:
        logger.warning(f"[botasaurus/browser] Failed to fetch {url}: {e}")
        return None


def _http_scraper(data: dict) -> list:
    """Plain requests-based HTTP fetch. Avoids botasaurus_requests CFFI dependency."""
    result = _call_request_scraper(_RequestsAdapter(), data)
    return [result]


@browser(headless=True, cache=False, parallel=1, output=None)
def _browser_scraper(driver: Driver, data: dict):
    return _call_browser_scraper(driver, data)


def get_html_without_browser(url: str) -> str | None:
    """Fetch URL with plain HTTP (browser-like headers). Returns HTML or None."""
    try:
        results = _http_scraper({"url": url})
        return results[0] if results else None
    except Exception as e:
        logger.error(f"[botasaurus/request] Unhandled error for {url}: {e}")
        return None


def get_html_with_browser(url: str) -> str | None:
    """Fetch URL with anti-detect Chromium browser. Returns HTML or None."""
    try:
        results = _browser_scraper({"url": url})
        return results[0] if results else None
    except Exception as e:
        logger.error(f"[botasaurus/browser] Unhandled error for {url}: {e}")
        return None
