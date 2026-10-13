"""Profile documents: bounded typed uploads, fixed refusals, safe download names, owner scoping."""

from unittest.mock import Mock, patch

import pytest
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session

from database.core import ProfileDocument
from tests.factories import (
    OTHER_USER_ID, PDF_BYTES, TEST_PROFILE_DOCUMENT_ID, fetch, make_profile_document, make_user,
)

HTML = b"<html><script>alert(1)</script></html>"
DOC_ID = TEST_PROFILE_DOCUMENT_ID


def _upload(api_client, content=PDF_BYTES, mime="application/pdf", name="Zeugnis.pdf", **form):
    data = {"doc_type": "CERTIFICATE", **form}
    return api_client.post("/profile/documents", files={"file": (name, content, mime)}, data=data)


def test_upload_stores_a_pdf_and_lists_it_as_downloadable(api_client):
    assert _upload(api_client).status_code == 200
    [item] = api_client.get("/profile/documents").json()
    assert (item["original_filename"], item["mime_type"], item["file_size"], item["downloadable"]) == (
        "Zeugnis.pdf", "application/pdf", len(PDF_BYTES), True,
    )


def test_upload_refuses_a_file_over_the_limit_without_echo(api_client, monkeypatch):
    monkeypatch.setattr("routers.profile_documents.MAX_FILE_SIZE", len(PDF_BYTES) - 1)
    response = _upload(api_client)
    assert (response.status_code, response.json()) == (413, {"detail": "file_too_large"})


def test_upload_refuses_bytes_that_do_not_match_the_declared_type(api_client, session_factory):
    response = _upload(api_client, content=HTML, mime="image/png", name="bild.png")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})
    with session_factory() as db:
        assert db.query(ProfileDocument).count() == 0


def test_upload_refuses_an_unlisted_type_without_echoing_it(api_client):
    response = _upload(api_client, content=HTML, mime="text/html", name="x.html")
    assert response.status_code == 415
    assert "text/html" not in response.text


def test_upload_refuses_an_unknown_doc_type_on_the_field(api_client):
    response = _upload(api_client, doc_type="PASSWORD_SECRET_4711")
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "doc_type"]
    assert "PASSWORD_SECRET_4711" not in response.text


def test_upload_refuses_an_overlong_label(api_client):
    response = _upload(api_client, label="x" * 201)
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, ["body", "label"])


def test_download_name_with_quotes_and_non_latin_characters(api_client, seed):
    seed(make_profile_document(original_filename='Zeugnis "Łódź".pdf'))
    response = api_client.get(f"/profile/documents/{DOC_ID}/download")
    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith(
        "filename*=UTF-8''Zeugnis%20%22%C5%81%C3%B3d%C5%BA%22.pdf"
    )
    assert response.content == PDF_BYTES


@pytest.mark.parametrize("method,suffix", [("get", "/view"), ("get", "/download"), ("delete", "")])
def test_foreign_document_is_not_found_for_view_download_and_delete(api_client, seed, session_factory, method, suffix):
    seed(make_user(OTHER_USER_ID), make_profile_document(user_id=OTHER_USER_ID))
    response = getattr(api_client, method)(f"/profile/documents/{DOC_ID}{suffix}")
    assert response.status_code == 404
    assert fetch(session_factory, ProfileDocument, DOC_ID) is not None


def test_drive_document_is_listed_as_not_downloadable(api_client, seed):
    seed(make_profile_document(filename="gdrive://Zeugnis.pdf", content=None))
    [item] = api_client.get("/profile/documents").json()
    assert item["downloadable"] is False
    assert api_client.get(f"/profile/documents/{DOC_ID}/view").status_code == 400


def test_database_document_without_content_is_listed_as_not_downloadable(api_client, seed):
    seed(make_profile_document(content=None))
    [item] = api_client.get("/profile/documents").json()
    assert item["downloadable"] is False
    assert api_client.get(f"/profile/documents/{DOC_ID}/download").status_code == 400


def test_upload_failure_logs_no_file_name(api_client, monkeypatch):
    secret_name = "Geheim-Zeugnis.pdf"
    error = StatementError("INSERT failed", "INSERT INTO profile_documents", {"name": secret_name}, Exception())
    monkeypatch.setattr(Session, "commit", Mock(side_effect=error))
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("routers.profile_documents.logger") as logger:
        response = _upload(api_client, name=secret_name)
    assert response.status_code == 500
    logger.error.assert_called_once_with("Profile document upload failed: %s", "StatementError")
    assert secret_name not in str(logger.mock_calls)
