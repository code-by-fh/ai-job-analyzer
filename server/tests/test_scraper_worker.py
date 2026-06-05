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
