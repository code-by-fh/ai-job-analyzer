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
