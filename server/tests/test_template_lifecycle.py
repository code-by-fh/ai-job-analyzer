"""The CV template fill always ends in a state the web can show; selection and delete keep the default sane."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.exc import OperationalError, StatementError

from database.core import DocumentTemplate, UserProfile
from intelligence.service import AI_REQUEST_TIMEOUT_SECONDS, OLLAMA_REQUEST_TIMEOUT_SECONDS
from services.template_access import TEMPLATE_STATUS_PROCESSING
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_profile, make_template, make_user
from workers.tasks.application import generate_application_task
from workers.tasks.fill_cv_template import TEMPLATE_STATUS_ANNOTATION_FAILED, fill_cv_template_task
from workers.tasks.package import generate_application_package_task

TEMPLATE_ID = 40
PLAIN_HTML = "<p>Jane Doe</p>"
ANNOTATED_HTML = "<p>{{ name }}</p>"
TEST_MODEL = "test-model"
MAX_NAME_LENGTH = 100


def _ai_client(answer=ANNOTATED_HTML, error=None):
    """Stand-in for the OpenAI-compatible client: the boundary the annotator calls."""
    client = MagicMock()
    message = SimpleNamespace(content=answer)
    client.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=message)])
    client.chat.completions.create.side_effect = error
    return client


def _failing_once(session_factory, method: str, error: Exception):
    """Session factory whose first call of *method*, on whichever session, raises *error*: a database fault."""
    raised = []

    def _factory():
        session = session_factory()
        real = getattr(session, method)

        def _fail_once(*args, **kwargs):
            if not raised:
                raised.append(error)
                raise error
            return real(*args, **kwargs)
        setattr(session, method, _fail_once)
        return session
    return _factory


@pytest.fixture()
def run_fill(session_factory, seed, fake_redis):
    """Run ai.fill_cv_template on a 'processing' template with the given AI client (and session factory)."""
    def _run(client, html=PLAIN_HTML, sessions=None):
        seed(make_user(), make_template(html=html, status=TEMPLATE_STATUS_PROCESSING))
        with patch("workers.tasks.fill_cv_template.SessionLocal", sessions or session_factory), \
             patch("workers.tasks.fill_cv_template.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.fill_cv_template.get_client_and_model", return_value=(client, TEST_MODEL)):
            fill_cv_template_task(TEMPLATE_ID, TEST_USER_ID)
        return fetch(session_factory, DocumentTemplate, TEMPLATE_ID)
    return _run


def test_ai_failure_marks_the_template_failed_and_tells_the_owner(run_fill, fake_redis):
    template = run_fill(_ai_client(error=RuntimeError("provider down")))
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_FAILED)
    assert events_of_type(fake_redis, "template_ready") == [
        {"type": "template_ready", "template_id": TEMPLATE_ID, "user_id": TEST_USER_ID},
    ]


def test_soft_time_limit_during_the_ai_call_marks_it_failed(run_fill, fake_redis):
    template = run_fill(_ai_client(error=SoftTimeLimitExceeded()))
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_FAILED)
    assert len(events_of_type(fake_redis, "template_ready")) == 1


def test_an_empty_ai_answer_marks_it_failed(run_fill):
    template = run_fill(_ai_client(answer=None))
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_FAILED)


def test_a_successful_fill_stores_the_annotation_as_ready(run_fill, fake_redis):
    with patch("intelligence.service.clear_ai_404_error"):
        template = run_fill(_ai_client())
    assert (template.html, template.status) == (ANNOTATED_HTML, None)
    assert len(events_of_type(fake_redis, "template_ready")) == 1


def test_store_failure_marks_it_failed(run_fill, fake_redis):
    with patch("workers.tasks.fill_cv_template._store_annotation", return_value=False):
        template = run_fill(_ai_client(), html=ANNOTATED_HTML)
    assert template.status == TEMPLATE_STATUS_ANNOTATION_FAILED
    assert len(events_of_type(fake_redis, "template_ready")) == 1


def test_a_database_error_before_the_ai_call_marks_it_failed(run_fill, session_factory, fake_redis):
    sessions = _failing_once(session_factory, "query", OperationalError("SELECT", {}, Exception("db down")))
    template = run_fill(_ai_client(), sessions=sessions)
    assert template.status == TEMPLATE_STATUS_ANNOTATION_FAILED
    assert len(events_of_type(fake_redis, "template_ready")) == 1


def test_a_failed_store_logs_no_template_html(run_fill, session_factory, fake_redis):
    error = StatementError("UPDATE failed", "UPDATE document_templates", {"html": ANNOTATED_HTML}, Exception("disk full"))
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("workers.tasks.fill_cv_template.logger") as logger:
        template = run_fill(_ai_client(), html=ANNOTATED_HTML, sessions=_failing_once(session_factory, "commit", error))
    assert template.status == TEMPLATE_STATUS_ANNOTATION_FAILED
    assert len(events_of_type(fake_redis, "template_ready")) == 1
    logger.error.assert_called_once_with(f"annotate_cv_template DB write failed for template {TEMPLATE_ID}: StatementError")
    assert ANNOTATED_HTML not in str(logger.mock_calls)


def test_a_template_with_jinja_is_kept_without_an_ai_call(run_fill):
    client = _ai_client()
    with patch("workers.tasks.fill_cv_template.logger") as logger:
        template = run_fill(client, html=ANNOTATED_HTML)
    assert (template.html, template.status) == (ANNOTATED_HTML, None)
    client.chat.completions.create.assert_not_called()
    logger.info.assert_any_call(f"Template {TEMPLATE_ID} already has Jinja2 syntax, skipping annotation")


def test_fill_task_limits_sit_above_the_ai_timeout():
    soft, hard = fill_cv_template_task.soft_time_limit, fill_cv_template_task.time_limit
    assert OLLAMA_REQUEST_TIMEOUT_SECONDS < soft < hard


@pytest.mark.parametrize("task", [fill_cv_template_task, generate_application_task, generate_application_package_task])
def test_hard_limit_leaves_room_for_the_sdk_retry_after_the_soft_limit(task):
    assert task.time_limit >= task.soft_time_limit + AI_REQUEST_TIMEOUT_SECONDS


@pytest.mark.parametrize("name", ["   ", "x" * (MAX_NAME_LENGTH + 1)])
def test_create_refuses_an_empty_or_overlong_name(api_client, name):
    response = api_client.post("/document-templates", json={"doc_type": "COVER_LETTER", "name": name, "html": "<p/>"})
    error = response.json()["detail"][0]
    assert (response.status_code, error["loc"], "input" in error) == (422, ["body", "name"], False)


def test_create_trims_the_name(api_client):
    response = api_client.post("/document-templates", json={"doc_type": "COVER_LETTER", "name": " Mein Brief ", "html": "<p/>"})
    assert response.json()["name"] == "Mein Brief"


def test_create_accepts_a_name_of_the_maximum_length(api_client):
    name = "x" * MAX_NAME_LENGTH
    response = api_client.post("/document-templates", json={"doc_type": "COVER_LETTER", "name": name, "html": "<p/>"})
    assert (response.status_code, response.json()["name"]) == (200, name)


def test_update_refuses_an_empty_name(api_client, seed):
    seed(make_template())
    response = api_client.put(f"/document-templates/{TEMPLATE_ID}", json={"name": "  "})
    error = response.json()["detail"][0]
    assert (response.status_code, error["loc"], "input" in error) == (422, ["body", "name"], False)


def test_deleting_the_selected_template_resets_the_default(api_client, seed, session_factory):
    seed(make_template(), make_profile(cv_template=str(TEMPLATE_ID), cover_letter_template="classic"))
    assert api_client.delete(f"/document-templates/{TEMPLATE_ID}").status_code == 200
    with session_factory() as db:
        profile = db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()
    assert (profile.cv_template, profile.cover_letter_template) == (None, "classic")


@pytest.mark.parametrize("path,method", [("/settings/template", "patch"), ("/settings", "post")])
def test_a_template_still_being_filled_cannot_become_the_default(api_client, seed, path, method):
    seed(make_template(status=TEMPLATE_STATUS_PROCESSING), make_profile())
    response = getattr(api_client, method)(path, json={"cv_template": str(TEMPLATE_ID)})
    assert (response.status_code, response.json()) == (409, {"detail": "template_processing"})


@pytest.mark.parametrize("status", ["annotation_rejected", TEMPLATE_STATUS_ANNOTATION_FAILED, None])
def test_a_finished_template_can_become_the_default_whatever_the_fill_did(api_client, seed, status):
    seed(make_template(status=status), make_profile())
    assert api_client.patch("/settings/template", json={"cv_template": str(TEMPLATE_ID)}).status_code == 200
