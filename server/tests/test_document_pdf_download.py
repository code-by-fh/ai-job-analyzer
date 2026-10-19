"""CV and letter are stored as HTML; GET /jobs/{id}/documents/pdf renders the PDF on demand, bounded."""

import time
from unittest.mock import patch

import pytest

from database.core import JobDocument
from routers import jobs as jobs_router
from routers.jobs import DOCUMENT_PDF_RATE, MAX_PARALLEL_PDF_RENDERS
from services import document_renderer
from services.document_renderer import PdfRenderFailed, render_pdf_isolated
from tests.factories import OTHER_USER_ID, make_job, make_user

CV_HTML = "<html><body><h1>Jane Doe</h1><p>Backend Engineer</p></body></html>"
EDITED_HTML = "<html><body><p>Edited CV</p></body></html>"
FAKE_PDF = b"%PDF-fake"
RENDER_TARGET = "routers.jobs.render_pdf_isolated"
SECRET_MARKER = "SECRET_MARKER_0815"
TEST_TIMEOUT_SECONDS = 4
SLACK_SECONDS = 3
RATE_LIMIT_COUNT = int(DOCUMENT_PDF_RATE.split("/")[0])
TOO_LARGE_TO_RENDER = "<p>" + "Erfahrung in vielen Bereichen. " * 40_000 + "</p>"


def _pdf_url(kind: str) -> str:
    return f"/jobs/job-1/documents/pdf?kind={kind}"


@pytest.fixture()
def fake_render():
    with patch(RENDER_TARGET, return_value=FAKE_PDF) as render:
        yield render


# --- the endpoint -------------------------------------------------------------------------

def test_cv_download_renders_the_stored_html_with_the_old_file_name(api_client, seed, fake_render):
    seed(make_job(company="ACME GmbH", cv_html=CV_HTML))
    response = api_client.get(_pdf_url("cv"))
    assert response.status_code == 200
    assert (response.content, response.headers["content-type"]) == (FAKE_PDF, "application/pdf")
    assert response.headers["content-disposition"].startswith('attachment; filename="Lebenslauf_ACME_GmbH.pdf"')
    fake_render.assert_called_once_with(CV_HTML)


def test_letter_download_uses_the_letter_html_and_name(api_client, seed, fake_render):
    seed(make_job(company="ACME GmbH", cv_html=CV_HTML, cover_letter_html="<p>Dear team</p>"))
    response = api_client.get(_pdf_url("cover_letter"))
    assert response.headers["content-disposition"].startswith('attachment; filename="Anschreiben_ACME_GmbH.pdf"')
    fake_render.assert_called_once_with("<p>Dear team</p>")


def test_letter_with_only_its_text_is_rendered_from_the_draft(api_client, seed, fake_render):
    seed(make_job(application_draft="Sehr geehrte Damen und Herren"))
    response = api_client.get(_pdf_url("cover_letter"))
    assert response.status_code == 200
    assert "Sehr geehrte Damen und Herren" in fake_render.call_args.args[0]


def test_download_renders_the_latest_saved_edit(api_client, seed, fake_render):
    seed(make_job(cv_html=CV_HTML))
    api_client.put("/jobs/job-1/documents/html?kind=cv", json={"html": EDITED_HTML})
    api_client.get(_pdf_url("cv"))
    fake_render.assert_called_once_with(EDITED_HTML)


def test_download_stores_no_pdf(api_client, seed, session_factory, fake_render):
    seed(make_job(cv_html=CV_HTML))
    api_client.get(_pdf_url("cv"))
    with session_factory() as db:
        assert db.query(JobDocument).count() == 0


def test_download_without_html_is_not_found(api_client, seed, fake_render):
    seed(make_job(cv_html=None))
    assert api_client.get(_pdf_url("cv")).status_code == 404
    fake_render.assert_not_called()


def test_download_of_another_users_job_is_not_found(api_client, seed, fake_render):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID, cv_html=CV_HTML))
    assert api_client.get(_pdf_url("cv")).status_code == 404
    fake_render.assert_not_called()


def test_download_refuses_an_unknown_kind(api_client, seed, fake_render):
    seed(make_job(cv_html=CV_HTML))
    assert api_client.get(_pdf_url("photo")).status_code == 422
    fake_render.assert_not_called()


def test_failed_render_answers_a_fixed_refusal_without_internals(api_client, seed):
    seed(make_job(cv_html=CV_HTML))
    with patch(RENDER_TARGET, side_effect=PdfRenderFailed("child exited with -9")):
        response = api_client.get(_pdf_url("cv"))
    assert (response.status_code, response.json()["detail"]) == (422, "pdf_render_failed")


def test_download_is_rate_limited_per_user(api_client, seed, fake_render, fresh_rate_limits):
    seed(make_job(cv_html=CV_HTML))
    statuses = [api_client.get(_pdf_url("cv")).status_code for _ in range(RATE_LIMIT_COUNT + 1)]
    assert statuses == [200] * RATE_LIMIT_COUNT + [429]


@pytest.fixture()
def all_render_slots_taken():
    for _ in range(MAX_PARALLEL_PDF_RENDERS):
        assert jobs_router._pdf_render_slots.acquire(blocking=False)
    yield
    for _ in range(MAX_PARALLEL_PDF_RENDERS):
        jobs_router._pdf_render_slots.release()


def test_download_answers_busy_when_every_render_slot_is_taken(api_client, seed, fake_render, all_render_slots_taken):
    seed(make_job(cv_html=CV_HTML))
    response = api_client.get(_pdf_url("cv"))
    assert (response.status_code, response.json()["detail"]) == (503, "pdf_render_busy")
    fake_render.assert_not_called()


def test_a_failed_render_frees_its_slot(api_client, seed):
    seed(make_job(cv_html=CV_HTML))
    with patch(RENDER_TARGET, side_effect=PdfRenderFailed("boom")):
        statuses = [api_client.get(_pdf_url("cv")).status_code for _ in range(MAX_PARALLEL_PDF_RENDERS + 1)]
    assert statuses == [422] * (MAX_PARALLEL_PDF_RENDERS + 1)


def test_stored_pdf_render_endpoint_is_gone(api_client, seed):
    seed(make_job(cv_html=CV_HTML))
    assert api_client.post("/jobs/job-1/documents/render?kind=cv").status_code in (404, 405)


# --- the bounded renderer -----------------------------------------------------------------

@pytest.fixture()
def weasyprint_available():
    try:
        pytest.importorskip("weasyprint", reason="WeasyPrint not available in this environment")
    except OSError as error:
        pytest.skip(f"WeasyPrint system libraries not available: {error}")


def test_isolated_render_returns_pdf_bytes(weasyprint_available):
    assert render_pdf_isolated(CV_HTML).startswith(b"%PDF")


def test_isolated_render_keeps_the_fetch_policy(weasyprint_available, tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text(SECRET_MARKER)
    pdf = render_pdf_isolated(f'<p>CV</p><link rel="attachment" href="{secret.as_uri()}"><img src="{secret.as_uri()}">')
    assert SECRET_MARKER.encode() not in pdf
    assert b"/EmbeddedFile" not in pdf


def test_isolated_render_of_an_oversized_document_fails_within_the_timeout(weasyprint_available, monkeypatch):
    monkeypatch.setattr(document_renderer, "PDF_RENDER_TIMEOUT_SECONDS", TEST_TIMEOUT_SECONDS)
    started = time.monotonic()
    with pytest.raises(PdfRenderFailed):
        render_pdf_isolated(TOO_LARGE_TO_RENDER)
    assert time.monotonic() - started < TEST_TIMEOUT_SECONDS + SLACK_SECONDS


def test_isolated_render_refuses_output_above_the_cap(weasyprint_available, monkeypatch):
    monkeypatch.setattr(document_renderer, "MAX_PDF_BYTES", len(FAKE_PDF))
    with pytest.raises(PdfRenderFailed):
        render_pdf_isolated(CV_HTML)


def test_isolated_render_reports_a_crashed_child_as_failed(monkeypatch):
    monkeypatch.setattr(document_renderer, "_PDF_CHILD_MODULE", "services.no_such_pdf_child")
    with pytest.raises(PdfRenderFailed):
        render_pdf_isolated(CV_HTML)
