from unittest.mock import patch

import pytest

from database.core import DocumentTemplate
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_user
from workers.scraper_worker import schedule_crawls_task
from workers.tasks.application import generate_application_task
from workers.tasks.crawl_status import maybe_complete_crawl
from workers.tasks.fill_cv_template import TEMPLATE_STATUS_ANNOTATION_FAILED, fill_cv_template_task
from workers.tasks.research import generate_company_profile, generate_interview_prep_task

CRAWL_ID = "crawl-1"
TEMPLATE_ID = 3
COMPANY_DOMAIN = "acme.example"
NO_AI = (None, "test-model")


def test_interview_prep_ready_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user(), make_job())
    with patch("workers.tasks.research.SessionLocal", session_factory), \
         patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.research.get_client_and_model", return_value=NO_AI), \
         patch("intelligence.service.generate_interview_prep", return_value={"report_output": {}}):
        generate_interview_prep_task("job-1", TEST_USER_ID)
    assert events_of_type(fake_redis, "interview_prep_ready")[0]["user_id"] == TEST_USER_ID


def test_company_profile_ready_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user())
    with patch("workers.tasks.research.SessionLocal", session_factory), \
         patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.research.get_client_and_model", return_value=NO_AI), \
         patch("intelligence.service.generate_company_profile_summary", return_value={"executive_summary": "Stable"}):
        generate_company_profile(COMPANY_DOMAIN, TEST_USER_ID)
    assert events_of_type(fake_redis, "company_profile_ready")[0]["user_id"] == TEST_USER_ID


def test_global_error_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING"))
    with patch("workers.tasks.application.SessionLocal", session_factory), \
         patch("workers.tasks.application.redis.from_url", return_value=fake_redis):
        generate_application_task("job-1", TEST_USER_ID)
    assert events_of_type(fake_redis, "global_error")[0]["user_id"] == TEST_USER_ID


def test_crawl_completed_carries_user_id(fake_redis):
    fake_redis.hgetall.return_value = {b"total": b"2", b"jobs_saved": b"1", b"jobs_skipped": b"1"}
    with patch("workers.tasks.crawl_status.flush_all_digests"):
        maybe_complete_crawl(CRAWL_ID, TEST_USER_ID, None, fake_redis)
    assert events_of_type(fake_redis, "crawl_completed") == [{"type": "crawl_completed", "user_id": TEST_USER_ID}]


def test_scraper_crawl_completed_carries_user_id(fake_redis):
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis):
        schedule_crawls_task([[], TEST_USER_ID, CRAWL_ID, None])
    assert events_of_type(fake_redis, "crawl_completed")[0]["user_id"] == TEST_USER_ID


@pytest.fixture()
def run_template_fill(session_factory, seed, fake_redis):
    """Run ai.fill_cv_template on a 'processing' template; the AI annotator is the patched boundary."""
    def _run(html: str, annotate_error=None):
        seed(make_user(), DocumentTemplate(
            id=TEMPLATE_ID, user_id=TEST_USER_ID, doc_type="CV", name="Mine", html=html, status="processing",
        ))
        with patch("workers.tasks.fill_cv_template.SessionLocal", session_factory), \
             patch("workers.tasks.fill_cv_template.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.fill_cv_template.get_client_and_model", return_value=NO_AI), \
             patch("workers.tasks.fill_cv_template.annotate_cv_template_with_jinja2", side_effect=annotate_error):
            fill_cv_template_task(TEMPLATE_ID, TEST_USER_ID)
    return _run


def test_template_ready_published_after_annotation(run_template_fill, fake_redis, session_factory):
    run_template_fill("<p>{{ name }}</p>")
    expected = [{"type": "template_ready", "template_id": TEMPLATE_ID, "user_id": TEST_USER_ID}]
    assert events_of_type(fake_redis, "template_ready") == expected
    assert fetch(session_factory, DocumentTemplate, TEMPLATE_ID).status is None


def test_template_ready_published_when_annotation_fails(run_template_fill, fake_redis, session_factory):
    run_template_fill("<p>Jane Doe</p>", annotate_error=RuntimeError("model down"))
    assert len(events_of_type(fake_redis, "template_ready")) == 1
    assert fetch(session_factory, DocumentTemplate, TEMPLATE_ID).status == TEMPLATE_STATUS_ANNOTATION_FAILED
