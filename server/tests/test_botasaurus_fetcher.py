import sys
from unittest.mock import patch, MagicMock
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fetcher_module():
    """Import botasaurus_fetcher with botasaurus itself mocked out."""
    # Stub the botasaurus packages before they are imported by the module
    request_mod = MagicMock()
    browser_mod = MagicMock()

    # @request / @browser decorators must be transparent pass-throughs so the
    # decorated functions keep their original behaviour during testing.
    def passthrough_decorator(*args, **kwargs):
        def inner(fn):
            return fn
        # Support both @request and @request(...) usage
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return inner

    request_mod.request = passthrough_decorator
    browser_mod.browser = passthrough_decorator

    request_mod.AntiDetectRequests = MagicMock
    browser_mod.Driver = MagicMock

    sys.modules.setdefault("botasaurus", MagicMock())
    sys.modules["botasaurus.request"] = request_mod
    sys.modules["botasaurus.browser"] = browser_mod

    # Re-import fresh module
    if "workers.botasaurus_fetcher" in sys.modules:
        del sys.modules["workers.botasaurus_fetcher"]

    import workers.botasaurus_fetcher as m
    return m


@pytest.fixture(scope="module")
def fetcher():
    return _make_fetcher_module()


# ---------------------------------------------------------------------------
# get_html_without_browser
# ---------------------------------------------------------------------------

def test_http_fetch_returns_html_on_success(fetcher):
    mock_request = MagicMock()
    mock_request.get.return_value.text = "<html>Job listings</html>"

    result = fetcher._call_request_scraper(mock_request, {"url": "https://example.com"})

    mock_request.get.assert_called_once_with("https://example.com")
    assert result == "<html>Job listings</html>"


def test_http_fetch_returns_none_on_exception(fetcher):
    mock_request = MagicMock()
    mock_request.get.side_effect = Exception("connection refused")

    result = fetcher._call_request_scraper(mock_request, {"url": "https://example.com"})

    assert result is None


def test_get_html_without_browser_returns_html(fetcher):
    with patch.object(fetcher, "_http_scraper", return_value=["<html>ok</html>"]):
        html = fetcher.get_html_without_browser("https://jobs.example.com")
    assert html == "<html>ok</html>"


def test_get_html_without_browser_returns_none_when_empty_list(fetcher):
    with patch.object(fetcher, "_http_scraper", return_value=[]):
        html = fetcher.get_html_without_browser("https://jobs.example.com")
    assert html is None


def test_get_html_without_browser_returns_none_when_scraper_raises(fetcher):
    with patch.object(fetcher, "_http_scraper", side_effect=Exception("network error")):
        html = fetcher.get_html_without_browser("https://jobs.example.com")
    assert html is None


# ---------------------------------------------------------------------------
# get_html_with_browser
# ---------------------------------------------------------------------------

def test_browser_fetch_returns_page_html(fetcher):
    mock_driver = MagicMock()
    mock_driver.page_html = "<html>JS-rendered content</html>"

    result = fetcher._call_browser_scraper(mock_driver, {"url": "https://cloudflare-site.com"})

    mock_driver.get.assert_called_once_with("https://cloudflare-site.com")
    assert result == "<html>JS-rendered content</html>"


def test_browser_fetch_returns_none_on_exception(fetcher):
    mock_driver = MagicMock()
    mock_driver.get.side_effect = Exception("timeout")

    result = fetcher._call_browser_scraper(mock_driver, {"url": "https://cloudflare-site.com"})

    assert result is None


def test_get_html_with_browser_returns_html(fetcher):
    with patch.object(fetcher, "_browser_scraper", return_value=["<html>rendered</html>"]):
        html = fetcher.get_html_with_browser("https://protected.example.com")
    assert html == "<html>rendered</html>"


def test_get_html_with_browser_returns_none_on_failure(fetcher):
    with patch.object(fetcher, "_browser_scraper", side_effect=Exception("crash")):
        html = fetcher.get_html_with_browser("https://protected.example.com")
    assert html is None
