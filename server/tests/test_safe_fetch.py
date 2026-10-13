"""PDF renderers may only load data: URLs and bundled template files (no local file read, no SSRF)."""

import http.server
import re
import threading
import zlib
from pathlib import Path
from xml.etree import ElementTree

import pytest

from database.core import JobEntry
from services import safe_fetch
from services.safe_fetch import (
    DENIED_RESOURCE_URI,
    ResourceDenied,
    safe_url_fetcher,
    strip_attachment_links,
    xhtml2pdf_link_callback,
)
from tests.factories import make_job

SECRET_MARKER = "SECRET_MARKER_4711"
TEMPLATE_FILE = Path(safe_fetch.TEMPLATE_DIR, "cv", "classic.html")
# 1x1 transparent PNG.
PNG_DATA_URI = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
PDF_STREAM = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.S)


@pytest.fixture()
def html_to_pdf():
    """The WeasyPrint renderer; skipped where the GTK/Pango system libraries are missing."""
    try:
        pytest.importorskip("weasyprint", reason="WeasyPrint not available in this environment")
    except OSError as error:
        pytest.skip(f"WeasyPrint system libraries not available: {error}")
    from services.document_renderer import html_to_pdf as render
    return render


@pytest.fixture()
def secret_file(tmp_path) -> Path:
    path = tmp_path / "secret.txt"
    path.write_text(SECRET_MARKER)
    return path


@pytest.fixture()
def http_hits():
    """A loopback HTTP server that records every request path; yields (base_url, hits)."""
    hits = []

    class RecordingHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(404)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), RecordingHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", hits
    server.shutdown()
    server.server_close()


def _pdf_payload(pdf: bytes) -> bytes:
    """The raw PDF plus every decompressible stream, so embedded file contents become searchable."""
    streams = []
    for match in PDF_STREAM.finditer(pdf):
        try:
            streams.append(zlib.decompress(match.group(1)))
        except zlib.error:
            streams.append(match.group(1))
    return pdf + b"".join(streams)


def test_link_rel_attachment_does_not_embed_local_file(html_to_pdf, secret_file):
    html = f'<p>CV</p><link rel="attachment" href="{secret_file.as_uri()}">'
    payload = _pdf_payload(html_to_pdf(html))
    assert SECRET_MARKER.encode() not in payload
    assert b"/EmbeddedFile" not in payload


def test_anchor_rel_attachment_does_not_embed_local_file(html_to_pdf, secret_file):
    html = f'<p><a rel="nofollow attachment" href="{secret_file.as_uri()}">CV</a></p>'
    payload = _pdf_payload(html_to_pdf(html))
    assert SECRET_MARKER.encode() not in payload
    assert b"/EmbeddedFile" not in payload


def test_weasyprint_does_not_request_remote_resources(html_to_pdf, http_hits):
    base_url, hits = http_hits
    html = (
        f'<link rel="stylesheet" href="{base_url}/css"><img src="{base_url}/img">'
        f'<style>@font-face {{ font-family: remote; src: url({base_url}/font) }} p {{ font-family: remote }}</style>'
        '<p>CV</p>'
    )
    pdf = html_to_pdf(html)
    assert pdf[:4] == b"%PDF"
    assert hits == []


def test_weasyprint_still_renders_data_uri_image(html_to_pdf):
    pdf = html_to_pdf(f'<img src="{PNG_DATA_URI}">')
    assert b"/Subtype /Image" in _pdf_payload(pdf)


def test_fetcher_loads_file_inside_template_dir():
    response = safe_url_fetcher(TEMPLATE_FILE.as_uri())
    assert response.read() == TEMPLATE_FILE.read_bytes()


def test_fetcher_loads_data_uri():
    assert safe_url_fetcher("data:text/plain,hello").read() == b"hello"


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "file:///proc/self/environ",
    f"file://{safe_fetch.TEMPLATE_DIR}/../../etc/passwd",
    f"file://{safe_fetch.TEMPLATE_DIR}/%2e%2e/%2e%2e/etc/passwd",
    f"file://{safe_fetch.TEMPLATE_DIR}-evil/x.css",
    "file://remote-host/share/x.css",
    f"file://{safe_fetch.TEMPLATE_DIR}/cv/classic.html%00.png",
    "http://127.0.0.1/admin",
    "https://example.com/x.png",
    "ftp://example.com/x.png",
])
def test_fetcher_denies_urls_outside_policy(url):
    with pytest.raises(ResourceDenied, match="not allowed"):
        safe_url_fetcher(url)


def test_fetcher_denies_symlink_escaping_template_dir(tmp_path, monkeypatch, secret_file):
    template_dir = tmp_path / "templates"
    template_dir.mkdir()
    (template_dir / "logo.png").symlink_to(secret_file)
    monkeypatch.setattr(safe_fetch, "TEMPLATE_DIR", str(template_dir))
    with pytest.raises(ResourceDenied, match="not allowed"):
        safe_url_fetcher((template_dir / "logo.png").as_uri())


def test_strip_attachment_links_drops_every_rel_containing_attachment():
    root = ElementTree.fromstring(
        '<html><link rel="Attachment" href="file:///x"/><a rel="nofollow\tATTACHMENT" href="file:///y">CV</a></html>'
    )
    strip_attachment_links(root)
    assert [element.get("rel") for element in root] == [None, None]


def test_strip_attachment_links_keeps_other_rel_values():
    root = ElementTree.fromstring('<html><link rel="stylesheet" href="data:text/css,p{}"/></html>')
    strip_attachment_links(root)
    assert root[0].get("rel") == "stylesheet"


@pytest.mark.parametrize("uri", [
    "/etc/passwd",
    "file:///etc/passwd",
    "http://127.0.0.1/admin",
    f"{safe_fetch.TEMPLATE_DIR}/../../etc/passwd",
    f"file://{safe_fetch.TEMPLATE_DIR}/cv/classic.html%00.png",
])
def test_xhtml2pdf_link_callback_denies_outside_policy(uri):
    assert xhtml2pdf_link_callback(uri, None) == DENIED_RESOURCE_URI


def test_xhtml2pdf_link_callback_keeps_data_uri():
    assert xhtml2pdf_link_callback(PNG_DATA_URI, None) == PNG_DATA_URI


def test_xhtml2pdf_link_callback_resolves_template_file():
    assert xhtml2pdf_link_callback(TEMPLATE_FILE.as_uri(), None) == str(TEMPLATE_FILE)


def test_xhtml2pdf_cover_letter_does_not_request_remote_resources(http_hits):
    from services.document_renderer import render_cover_letter_pdf
    base_url, hits = http_hits
    pdf = render_cover_letter_pdf(letter_markdown=f'Hallo\n\n<img src="{base_url}/img">')
    assert pdf[:4] == b"%PDF"
    assert hits == []


def test_application_download_does_not_request_remote_resources(api_client, seed, http_hits):
    base_url, hits = http_hits
    seed(make_job(application_draft=f'Hallo\n\n<img src="{base_url}/img">'))
    response = api_client.get("/jobs/job-1/download")
    assert response.status_code == 200
    assert hits == []


# xhtml2pdf treats only a case-sensitive "data:" prefix as inline data; anything else is opened
# as a file path, so the callback must not normalise the scheme before letting it through.
@pytest.mark.parametrize("uri", ["DATA:/x", " data:x", "Data:text/plain,x"])
def test_xhtml2pdf_link_callback_denies_data_uri_variants_xhtml2pdf_reads_as_files(uri):
    assert xhtml2pdf_link_callback(uri, None) == DENIED_RESOURCE_URI


def test_denied_resource_uri_is_a_png_image():
    assert DENIED_RESOURCE_URI.startswith("data:image/png;base64,")


@pytest.mark.parametrize("html", [
    '<ul style="list-style-image: url(http://127.0.0.1:9/x.png)"><li>CV</li></ul>',
    '<style>@page { background-image: url(http://127.0.0.1:9/x.png); }</style><p>CV</p>',
    '<style>@page { background-image: url(file:///etc/passwd); }</style><p>CV</p>',
])
def test_xhtml2pdf_renders_when_an_image_resource_is_denied(html):
    from services.document_renderer import _html_to_pdf
    assert _html_to_pdf(f"<html><body>{html}</body></html>")[:4] == b"%PDF"
