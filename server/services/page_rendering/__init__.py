"""Page rendering behind one interface; callers import only from here, never a concrete service."""

import os
from functools import cache

from services.page_rendering.base import HTTP_TIMEOUT_SECONDS, PageRenderer
from services.page_rendering.page_render_service import PageRenderServiceRenderer

__all__ = ["HTTP_TIMEOUT_SECONDS", "PageRenderer", "fetch_html", "get_page_renderer"]

_RENDERERS = {
    "page-render-service": PageRenderServiceRenderer,
}


@cache
def get_page_renderer() -> PageRenderer:
    """The renderer named by RENDER_SERVICE (default page-render-service), one per process."""
    name = os.getenv("RENDER_SERVICE", "page-render-service")
    if name not in _RENDERERS:
        raise ValueError(f"Unknown RENDER_SERVICE {name!r}; allowed: {', '.join(sorted(_RENDERERS))}")
    return _RENDERERS[name]()


def fetch_html(url: str) -> str | None:
    """Rendered HTML of *url*, or None on any failure."""
    return get_page_renderer().fetch_html(url)
