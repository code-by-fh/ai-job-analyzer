import sys
from unittest.mock import MagicMock, patch


# Stub out playwright and playwright_stealth before the module is imported,
# so tests can run without those packages installed locally.
def _stub_playwright_modules():
    if "playwright" not in sys.modules:
        playwright_stub = MagicMock()
        sys.modules["playwright"] = playwright_stub
        sys.modules["playwright.sync_api"] = MagicMock()
    if "playwright_stealth" not in sys.modules:
        sys.modules["playwright_stealth"] = MagicMock()


_stub_playwright_modules()

import workers.scraper_worker  # noqa: E402 — must come after stubs
from workers.scraper_worker import get_html_with_browser  # noqa: E402


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

        result = get_html_with_browser("https://example.com")

    mock_playwright.chromium.launch.assert_called_once()
    call_kwargs = mock_playwright.chromium.launch.call_args[1]
    assert call_kwargs.get("headless") is False
    mock_stealth.assert_called_once_with(mock_page)
    assert result == "<html><body>test</body></html>"
