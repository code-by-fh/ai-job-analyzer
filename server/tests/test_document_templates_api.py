"""POST/PUT /document-templates reject unsafe or oversized templates with field details."""

from unittest.mock import patch

import pytest

from database.core import DocumentTemplate, MAX_TEMPLATE_HTML_LENGTH
from tests.factories import make_template

TEMPLATE_ID = 40
SAFE_HTML = "<p>{{ name }}</p>"
PRIVATE_ACCESS_HTML = '<p>{{ cycler.__init__.__globals__.os.popen("id").read() }}</p>'
UNPARSABLE_HTML = "<p>{% for x in %}</p>"
HTML_FIELD_LOCATION = ["body", "html"]


@pytest.fixture()
def no_annotation():
    with patch("workers.tasks.fill_cv_template.fill_cv_template_task") as task:
        yield task


def _create(api_client, html: str, doc_type: str = "CV"):
    return api_client.post("/document-templates", json={"doc_type": doc_type, "name": "Mine", "html": html})


def _stored_templates(session_factory) -> list:
    with session_factory() as db:
        return db.query(DocumentTemplate).all()


@pytest.mark.parametrize("html, message", [
    (PRIVATE_ACCESS_HTML, "attributes starting with"),
    (UNPARSABLE_HTML, "line 1"),
])
def test_create_rejects_unsafe_template_with_field_details(api_client, session_factory, no_annotation, html, message):
    response = _create(api_client, html)
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"] == HTML_FIELD_LOCATION
    assert message in error["msg"]
    assert _stored_templates(session_factory) == []
    no_annotation.apply_async.assert_not_called()


def test_create_does_not_jinja_check_cover_letter_templates(api_client, session_factory):
    # Letters are filled by data-slot annotations and never Jinja-rendered, so the text is inert.
    response = _create(api_client, PRIVATE_ACCESS_HTML, doc_type="COVER_LETTER")
    assert response.status_code == 200
    assert [t.html for t in _stored_templates(session_factory)] == [PRIVATE_ACCESS_HTML]


def test_create_accepts_safe_template(api_client, session_factory, no_annotation):
    response = _create(api_client, SAFE_HTML)
    assert response.status_code == 200
    assert [t.html for t in _stored_templates(session_factory)] == [SAFE_HTML]


def test_update_rejects_unsafe_template_and_keeps_stored_html(api_client, session_factory, seed):
    seed(make_template(id=TEMPLATE_ID, html=SAFE_HTML))
    response = api_client.put(f"/document-templates/{TEMPLATE_ID}", json={"html": PRIVATE_ACCESS_HTML})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == HTML_FIELD_LOCATION
    assert [t.html for t in _stored_templates(session_factory)] == [SAFE_HTML]


def test_update_accepts_safe_template(api_client, session_factory, seed):
    seed(make_template(id=TEMPLATE_ID, html="<p>old</p>"))
    response = api_client.put(f"/document-templates/{TEMPLATE_ID}", json={"html": SAFE_HTML})
    assert response.status_code == 200
    assert [t.html for t in _stored_templates(session_factory)] == [SAFE_HTML]


# --- J5: size bound and a 422 body that does not echo the input ----------------------------

OVERSIZED_HTML = "x" * (MAX_TEMPLATE_HTML_LENGTH + 1)


def test_create_rejects_oversized_html(api_client, session_factory):
    response = _create(api_client, OVERSIZED_HTML)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == HTML_FIELD_LOCATION
    assert _stored_templates(session_factory) == []


def test_update_rejects_oversized_html(api_client, seed):
    seed(make_template(id=TEMPLATE_ID))
    response = api_client.put(f"/document-templates/{TEMPLATE_ID}", json={"html": OVERSIZED_HTML})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == HTML_FIELD_LOCATION


def test_validation_error_does_not_echo_the_rejected_input(api_client):
    response = _create(api_client, OVERSIZED_HTML)
    error = response.json()["detail"][0]
    assert "input" not in error
    assert len(response.content) < MAX_TEMPLATE_HTML_LENGTH // 1000
    assert error == {
        "type": "string_too_long",
        "loc": HTML_FIELD_LOCATION,
        "msg": f"String should have at most {MAX_TEMPLATE_HTML_LENGTH} characters",
        "ctx": {"max_length": MAX_TEMPLATE_HTML_LENGTH},
    }


def test_validation_error_drops_context_that_echoes_the_input():
    from main import _without_input_echo
    error = {
        "type": "value_error",
        "loc": ["body", "html"],
        "msg": "Value error, bad",
        "input": "SECRET_INPUT_4711",
        "ctx": {"error": "bad value 'SECRET_INPUT_4711'", "max_length": MAX_TEMPLATE_HTML_LENGTH},
    }
    assert _without_input_echo(error) == {
        "type": "value_error",
        "loc": ["body", "html"],
        "msg": "Value error, bad",
        "ctx": {"max_length": MAX_TEMPLATE_HTML_LENGTH},
    }


def test_create_jinja_checks_a_lowercase_cv_template(api_client, session_factory, no_annotation):
    response = _create(api_client, PRIVATE_ACCESS_HTML, doc_type="cv")
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, HTML_FIELD_LOCATION)
    assert _stored_templates(session_factory) == []
    no_annotation.apply_async.assert_not_called()
