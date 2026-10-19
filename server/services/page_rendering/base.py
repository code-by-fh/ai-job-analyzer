import os
from typing import Protocol

# The longest one render call may block; the API's preview proxy waits longer than this, or it gives up on
# a render the scraper still finishes.
HTTP_TIMEOUT_SECONDS = int(os.getenv("RENDER_API_HTTP_TIMEOUT", "90"))


class PageRenderer(Protocol):
    def fetch_html(self, url: str) -> str | None:
        """Rendered HTML of *url*, or None on any failure; never raises."""
        ...
