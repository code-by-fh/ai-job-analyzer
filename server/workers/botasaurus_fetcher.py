import logging

from botasaurus.request import request, AntiDetectRequests
from botasaurus.browser import browser, Driver

logger = logging.getLogger(__name__)


def _call_request_scraper(req: AntiDetectRequests, data: dict) -> str | None:
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


@request(cache=False, parallel=1)
def _http_scraper(req: AntiDetectRequests, data: dict):
    return _call_request_scraper(req, data)


@browser(headless=True, cache=False, parallel=1)
def _browser_scraper(driver: Driver, data: dict):
    return _call_browser_scraper(driver, data)


def get_html_without_browser(url: str) -> str | None:
    """Fetch URL with lightweight anti-detect HTTP request. Returns HTML or None."""
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
