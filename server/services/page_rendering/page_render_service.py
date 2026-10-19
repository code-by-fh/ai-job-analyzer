import logging
import os

import requests

from core.url_safety import host_for_log
from services.page_rendering.base import HTTP_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

# Render budget sent to the service; its queue waits (up to 2 x 20 s) come on top, so 45 s stays inside
# HTTP_TIMEOUT_SECONDS (90).
RENDER_PAGE_TIMEOUT_SECONDS = 45


class PageRenderServiceRenderer:
    """Client for code-by-fh/page-render-service (POST /api/v1/render, 200 = HTML body)."""

    def __init__(self):
        self._url = os.getenv("RENDER_API_URL", "http://localhost:18431/api/v1/render")
        # The service refuses requests without one of its API_KEYS (Bearer token).
        api_key = os.getenv("RENDER_API_KEY", "").strip()
        self._headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    def fetch_html(self, url: str) -> str | None:
        host = host_for_log(url)
        try:
            resp = requests.post(
                self._url,
                json={"url": url, "timeout": RENDER_PAGE_TIMEOUT_SECONDS},
                headers=self._headers,
                timeout=HTTP_TIMEOUT_SECONDS,
            )
        except Exception as e:
            # The exception text may carry the target URL: log its type only.
            logger.error(f"[PageRender] Request failed for host {host}: {type(e).__name__}")
            return None
        if resp.status_code == 200:
            return resp.text
        # The error message may echo the target URL: log only the code and trace id.
        code, trace_id = _error_code_and_trace_id(resp)
        logger.warning(f"[PageRender] Render failed for host {host}: HTTP {resp.status_code}, code={code}, traceId={trace_id}")
        return None


def _error_code_and_trace_id(resp) -> tuple[str | None, str | None]:
    try:
        error = resp.json()["error"]
        return error.get("code"), error.get("traceId")
    except Exception:
        return None, None
