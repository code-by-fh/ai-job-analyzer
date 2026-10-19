import os
import signal
import threading
import time
from unittest.mock import patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from database.core import DocumentTemplate, JobEntry
from tests.factories import TEST_USER_ID, fetch, make_job, make_profile, make_user
from workers.tasks.application import generate_application_task
from workers.tasks.fill_cv_template import (
    TEMPLATE_STATUS_ANNOTATION_REJECTED,
    fill_cv_template_task,
)
from workers.tasks.package import generate_application_package_task
from workers.tasks.time_limits import (
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SOFT_TIME_LIMIT_SECONDS,
    GENERATION_TIMEOUT_ERROR,
)

TEMPLATE_ID = 77
PLAIN_HTML = "<p>Jane Doe</p>"
PRIVATE_ACCESS_HTML = "<p>{{ name.__class__ }}</p>"
NO_AI = (None, "test-model")
SOFT_SIGNAL_SECONDS = 0.5
STUCK_BUILD_SECONDS = 6


@pytest.fixture()
def run_fill(session_factory, seed, fake_redis):
    def _run(annotated_html: str):
        seed(make_user(), DocumentTemplate(
            id=TEMPLATE_ID, user_id=TEST_USER_ID, doc_type="CV", name="Mine", html=PLAIN_HTML, status="processing",
        ))
        with patch("workers.tasks.fill_cv_template.SessionLocal", session_factory), \
             patch("workers.tasks.fill_cv_template.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.fill_cv_template.get_client_and_model", return_value=NO_AI), \
             patch("workers.tasks.fill_cv_template.annotate_cv_template_with_jinja2", return_value=annotated_html):
            fill_cv_template_task(TEMPLATE_ID, TEST_USER_ID)
        return fetch(session_factory, DocumentTemplate, TEMPLATE_ID)
    return _run


def test_rejected_annotation_keeps_unannotated_template_and_sets_fixed_status(run_fill):
    template = run_fill(PRIVATE_ACCESS_HTML)
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_REJECTED)


def test_unparsable_annotation_is_rejected_too(run_fill):
    template = run_fill("<p>{% for x in %}</p>")
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_REJECTED)


def test_valid_annotation_is_stored(run_fill):
    template = run_fill("<p>{{ name }}</p>")
    assert (template.html, template.status) == ("<p>{{ name }}</p>", None)


@pytest.mark.parametrize("task,soft,hard", [
    (generate_application_package_task, GENERATION_SOFT_TIME_LIMIT_SECONDS, GENERATION_HARD_TIME_LIMIT_SECONDS),
    (generate_application_task, GENERATION_SOFT_TIME_LIMIT_SECONDS, GENERATION_HARD_TIME_LIMIT_SECONDS),
])
def test_template_rendering_tasks_have_time_limits(task, soft, hard):
    assert (task.soft_time_limit, task.time_limit) == (soft, hard)
    assert soft < hard


def test_soft_time_limit_while_a_build_is_stuck_returns_promptly_with_the_timeout_error(session_factory, seed, fake_redis):
    seed(make_user(), make_profile(), make_job(status="GENERATING"))
    release = threading.Event()
    previous = signal.signal(signal.SIGUSR1, _raise_soft_limit)
    signal.setitimer(signal.ITIMER_REAL, SOFT_SIGNAL_SECONDS)
    previous_alarm = signal.signal(signal.SIGALRM, lambda *_: os.kill(os.getpid(), signal.SIGUSR1))
    started = time.monotonic()
    try:
        with patch("workers.tasks.package.SessionLocal", session_factory), \
             patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.package.get_client_and_model", return_value=NO_AI), \
             patch("workers.tasks.package._build_cv", side_effect=lambda *_: release.wait(STUCK_BUILD_SECONDS)), \
             patch("workers.tasks.package._build_letter", return_value=("t", "<p>t</p>")):
            generate_application_package_task("job-1", TEST_USER_ID, False)
    finally:
        elapsed = time.monotonic() - started
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_alarm)
        signal.signal(signal.SIGUSR1, previous)
        release.set()
    assert elapsed < STUCK_BUILD_SECONDS / 2
    assert fetch(session_factory, JobEntry, "job-1").generation_error == GENERATION_TIMEOUT_ERROR


def _raise_soft_limit(*_args):
    raise SoftTimeLimitExceeded()


def test_annotation_is_sanitised_before_it_is_stored(run_fill):
    template = run_fill('<p onclick="x()">{{ name }}</p><script>alert(1)</script>')
    assert template.html == "<p>{{ name }}</p>"
