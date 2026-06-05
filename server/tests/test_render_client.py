from unittest.mock import MagicMock, patch

import pytest

from services import render_client


def test_fetch_html_returns_plain_text_body():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html; charset=utf-8"}
    mock_resp.text = "<html><body>hello</body></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        result = render_client.fetch_html("https://example.com")

    assert result == "<html><body>hello</body></html>"
    payload = mock_post.call_args[1]["json"]
    assert payload["url"] == "https://example.com"
    assert "wait_for" not in payload


def test_fetch_html_extracts_html_field_from_json():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"html": "<html>test</html>"}
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp):
        result = render_client.fetch_html("https://example.com")

    assert result == "<html>test</html>"


def test_fetch_html_returns_none_on_request_error():
    with patch("services.render_client.requests.post", side_effect=Exception("connection refused")):
        result = render_client.fetch_html("https://example.com")

    assert result is None


def test_fetch_html_includes_wait_for_in_payload():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html"}
    mock_resp.text = "<html></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        render_client.fetch_html("https://example.com", wait_for="#main")

    payload = mock_post.call_args[1]["json"]
    assert payload["wait_for"] == "#main"


def test_fetch_html_passes_custom_timeout():
    mock_resp = MagicMock()
    mock_resp.headers = {"content-type": "text/html"}
    mock_resp.text = "<html></html>"
    mock_resp.raise_for_status = MagicMock()

    with patch("services.render_client.requests.post", return_value=mock_resp) as mock_post:
        render_client.fetch_html("https://example.com", timeout=20)

    payload = mock_post.call_args[1]["json"]
    assert payload["timeout"] == 20
