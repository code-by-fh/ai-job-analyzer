from unittest.mock import MagicMock, patch

import pytest
import requests

import services.page_rendering as page_rendering
from services.page_rendering import page_render_service
from services.page_rendering.page_render_service import PageRenderServiceRenderer

RENDER_KEY = "k" * 48
RENDER_URL = "http://render.test:8000/api/v1/render"
TARGET = "https://jobs.example.com/private/path?token=abc"
POST = "services.page_rendering.page_render_service.requests.post"


@pytest.fixture(autouse=True)
def fresh_renderer_cache():
    page_rendering.get_page_renderer.cache_clear()
    yield
    page_rendering.get_page_renderer.cache_clear()


@pytest.fixture
def renderer(monkeypatch):
    monkeypatch.setenv("RENDER_API_URL", RENDER_URL)
    monkeypatch.setenv("RENDER_API_KEY", RENDER_KEY)
    return PageRenderServiceRenderer()


def _response(status: int, text: str = "", json_body=None):
    resp = MagicMock()
    resp.status_code = status
    resp.text = text
    if json_body is None:
        resp.json.side_effect = ValueError("not json")
    else:
        resp.json.return_value = json_body
    return resp


def _error_envelope(code: str, message: str):
    return {"error": {"code": code, "message": message, "traceId": "trace-42"}}


def test_render_request_carries_url_timeout_bearer_key_and_http_timeout(renderer):
    with patch(POST, return_value=_response(200, "<html>ok</html>")) as post:
        assert renderer.fetch_html(TARGET) == "<html>ok</html>"

    assert post.call_args.args == (RENDER_URL,)
    assert post.call_args.kwargs["json"] == {"url": TARGET, "timeout": page_render_service.RENDER_PAGE_TIMEOUT_SECONDS}
    assert post.call_args.kwargs["headers"] == {"Authorization": f"Bearer {RENDER_KEY}"}
    assert post.call_args.kwargs["timeout"] == page_rendering.HTTP_TIMEOUT_SECONDS


def test_the_render_budget_leaves_room_for_queueing_within_the_http_timeout():
    # Two queue waits of up to 20 s each come on top of the render budget.
    assert page_render_service.RENDER_PAGE_TIMEOUT_SECONDS + 40 < page_rendering.HTTP_TIMEOUT_SECONDS


def test_no_auth_header_without_api_key(monkeypatch):
    monkeypatch.setenv("RENDER_API_KEY", "  ")
    with patch(POST, return_value=_response(200, "<html/>")) as post:
        PageRenderServiceRenderer().fetch_html(TARGET)
    assert post.call_args.kwargs["headers"] == {}


def test_url_defaults_to_the_local_render_endpoint(monkeypatch):
    monkeypatch.delenv("RENDER_API_URL", raising=False)
    with patch(POST, return_value=_response(200, "<html/>")) as post:
        PageRenderServiceRenderer().fetch_html(TARGET)
    assert post.call_args.args == ("http://localhost:18431/api/v1/render",)


def test_error_envelope_returns_none_and_logs_code_and_trace_id_only(renderer):
    body = _error_envelope("NAVIGATION_FAILED", f"secret detail about {TARGET}")
    with patch(POST, return_value=_response(502, json_body=body)), \
         patch.object(page_render_service, "logger") as logger:
        assert renderer.fetch_html(TARGET) is None

    logged = str(logger.warning.call_args_list)
    for expected in ("jobs.example.com", "502", "NAVIGATION_FAILED", "trace-42"):
        assert expected in logged
    for leaked in ("secret detail", "/private/path", "token=abc"):
        assert leaked not in logged


def test_non_json_error_body_returns_none_and_logs_the_status(renderer):
    with patch(POST, return_value=_response(503, text=f"<html>bad gateway {TARGET}</html>")), \
         patch.object(page_render_service, "logger") as logger:
        assert renderer.fetch_html(TARGET) is None

    logged = str(logger.warning.call_args_list)
    assert "503" in logged
    assert "jobs.example.com" in logged
    assert "bad gateway" not in logged
    assert "/private/path" not in logged


def test_transport_error_returns_none_and_logs_by_host_and_type_only(renderer):
    error = requests.ConnectionError(f"cannot reach {TARGET}")
    with patch(POST, side_effect=error), patch.object(page_render_service, "logger") as logger:
        assert renderer.fetch_html(TARGET) is None

    logged = str(logger.error.call_args_list)
    assert "jobs.example.com" in logged
    assert "ConnectionError" in logged
    assert "/private/path" not in logged
    assert "token=abc" not in logged


def test_the_default_renderer_is_the_page_render_service(monkeypatch):
    monkeypatch.delenv("RENDER_SERVICE", raising=False)
    assert isinstance(page_rendering.get_page_renderer(), PageRenderServiceRenderer)


def test_the_renderer_is_selected_by_name_and_cached(monkeypatch):
    monkeypatch.setenv("RENDER_SERVICE", "page-render-service")
    renderer = page_rendering.get_page_renderer()
    assert isinstance(renderer, PageRenderServiceRenderer)
    assert page_rendering.get_page_renderer() is renderer


def test_an_unknown_render_service_names_the_allowed_values(monkeypatch):
    monkeypatch.setenv("RENDER_SERVICE", "botasaurus")
    with pytest.raises(ValueError, match="page-render-service"):
        page_rendering.get_page_renderer()


def test_fetch_html_delegates_to_the_selected_renderer():
    selected = MagicMock()
    selected.fetch_html.return_value = "<html>delegated</html>"
    with patch.object(page_rendering, "get_page_renderer", return_value=selected):
        assert page_rendering.fetch_html(TARGET) == "<html>delegated</html>"
    selected.fetch_html.assert_called_once_with(TARGET)
