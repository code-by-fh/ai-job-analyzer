import logging
import os

import requests

from core.url_safety import host_for_log

logger = logging.getLogger(__name__)

_RENDER_API_URL = os.getenv("RENDER_API_URL", "http://localhost:8000/render")
# The render service refuses requests without one of its API_KEYS (Bearer token).
_RENDER_API_KEY = os.getenv("RENDER_API_KEY", "").strip()
# Public: the API's preview proxy waits longer than this, or it gives up on a render the scraper still finishes.
HTTP_TIMEOUT_SECONDS = int(os.getenv("RENDER_API_HTTP_TIMEOUT", "90"))


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {_RENDER_API_KEY}"} if _RENDER_API_KEY else {}


def fetch_html(url: str, wait_for: str | None = None, timeout: int = 60) -> str | None:
    """Fetch rendered HTML for *url* from the render API.

    Returns the HTML string, or None if the request fails.
    *timeout* is the page-level timeout sent to the render API (browser stops waiting
    after *timeout* seconds). Keep *timeout* below RENDER_API_HTTP_TIMEOUT (default 90)
    or the HTTP connection will close before the browser finishes.
    """
    payload: dict = {"url": url, "timeout": timeout}
    if wait_for:
        payload["wait_for"] = wait_for
    try:
        resp = requests.post(
            _RENDER_API_URL,
            json=payload,
            headers=_auth_headers(),
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            return resp.json().get("html")
        return resp.text
    except Exception as e:
        logger.error(f"[RenderClient] Failed to fetch from host {host_for_log(url)}: {e}", exc_info=True)
        return None
