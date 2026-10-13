"""Digest rendering stays linear on hostile templates; senders never log recipients or provider text."""

import smtplib
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from workers.notifications.email import _send_via_resend_batch, _send_via_smtp_batch
from workers.notifications.push import _send_via_pushover, render_push_message
from workers.notifications.templates import render_email_html

SAMPLE_JOB = SimpleNamespace(
    id="job-1", title="Engineer", company="Acme", match_score=80.0, reasoning="Fits.", url="https://example.com/1",
)
RECIPIENT = "private.person@example.com"
PROVIDER_TEXT = "provider-said-something-about-private.person"
UNCLOSED_LOOPS = "{{#jobs}}" * 11_112
RENDER_BUDGET_SECONDS = 0.2
PROVIDER_REFUSED = 422
HOSTILE_TITLE = '<a href="https://phish.example">Bewerbung</a>'
ESCAPED_TITLE = "&lt;a href=&quot;https://phish.example&quot;&gt;Bewerbung&lt;/a&gt;"
SCRIPT_URL = "javascript:alert(1)"
QUOTING_URL = 'https://example.com/?a=1&b="2'
DETAILS_LINK_TEXT = "Details anzeigen"
UNQUOTED_LINK = "{{#jobs}}<a href=$url>x</a>{{/jobs}}"


def _render(template: str) -> str:
    return render_email_html([SAMPLE_JOB], template, userName="Ann", platform_name="Board")


def test_unclosed_job_loops_render_in_linear_time():
    started = time.perf_counter()
    html = _render(UNCLOSED_LOOPS)
    assert time.perf_counter() - started < RENDER_BUDGET_SECONDS
    assert html == UNCLOSED_LOOPS


def test_a_job_loop_is_rendered_per_job():
    assert _render("<p>$userName</p>{{#jobs}}<b>$title</b>{{/jobs}}<i>$count</i>") == "<p>Ann</p><b>Engineer</b><i>1</i>"


def test_every_job_loop_gets_the_first_loop_rendered():
    assert _render("{{#jobs}}$title{{/jobs}}|{{#jobs}}ignored{{/jobs}}") == "Engineer|Engineer"


def test_job_text_is_inserted_literally():
    job = SimpleNamespace(**{**vars(SAMPLE_JOB), "title": r"C\1 \g<0>"})
    html = render_email_html([job], "{{#jobs}}$title{{/jobs}}", userName="Ann", platform_name="Board")
    assert html == r"C\1 \g&lt;0&gt;"



def _job(**overrides) -> SimpleNamespace:
    return SimpleNamespace(**{**vars(SAMPLE_JOB), **overrides})


def _render_job(job: SimpleNamespace, template: str) -> str:
    return render_email_html([job], template, userName="Ann", platform_name="Board")


@pytest.mark.parametrize("template", ["{{#jobs}}$title{{/jobs}}", "$jobs_html", ""])
def test_job_text_is_escaped_in_every_template_kind(template):
    html = _render_job(_job(title=HOSTILE_TITLE), template)
    assert ESCAPED_TITLE in html
    assert HOSTILE_TITLE not in html


def test_user_and_source_names_are_escaped():
    html = render_email_html(
        [SAMPLE_JOB], "{{#jobs}}{{/jobs}}$userName|$platform_name", userName="<i>A</i>", platform_name='"B"'
    )
    assert html == "&lt;i&gt;A&lt;/i&gt;|&quot;B&quot;"


@pytest.mark.parametrize("url", [SCRIPT_URL, "data:text/html,x", "//evil.example/x", ""])
def test_a_loop_link_takes_web_addresses_only(url):
    assert _render_job(_job(url=url), '{{#jobs}}<a href="$url">x</a>{{/jobs}}') == '<a href="#">x</a>'


def test_the_default_row_drops_a_link_that_is_no_web_address():
    html = _render_job(_job(url=SCRIPT_URL), "")
    assert "javascript:" not in html
    assert DETAILS_LINK_TEXT not in html


def test_a_web_address_is_escaped_inside_the_href():
    html = _render_job(_job(url=QUOTING_URL), '{{#jobs}}<a href="$url">x</a>{{/jobs}}')
    assert html == '<a href="https://example.com/?a=1&amp;b=&quot;2">x</a>'


@pytest.mark.parametrize("separator, encoded", [(" ", "%20"), ("\t", "%09"), ("\n", "%0A")])
def test_whitespace_in_a_web_address_cannot_add_attributes_to_an_unquoted_href(separator, encoded):
    html = _render_job(_job(url=f"https://example.com/{separator}onmouseover=alert(1)"), UNQUOTED_LINK)
    assert html == f"<a href=https://example.com/{encoded}onmouseover=alert(1)>x</a>"


def test_the_default_row_keeps_an_address_with_whitespace_as_one_attribute_value():
    html = _render_job(_job(url="https://example.com/a b"), "")
    assert '<a href="https://example.com/a%20b">' in html


def test_push_job_text_naming_a_variable_stays_literal():
    job = _job(title="$company", company="Acme")
    assert render_push_message(job, "$title @ $company") == "$company @ Acme"


def test_a_variable_name_inside_job_text_stays_literal_in_a_loop():
    assert _render_job(_job(title="$userName $company"), "{{#jobs}}$title{{/jobs}}") == "$userName $company"


def test_a_variable_name_inside_job_text_stays_literal_in_the_rows_block():
    html = _render_job(_job(title="$userName"), "$jobs_html")
    assert "$userName" in html
    assert "Ann" not in html

def _logged_text(logger: MagicMock) -> str:
    return " ".join(str(call) for call in logger.mock_calls)


@pytest.fixture()
def logger(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr("workers.notifications.email.logger", mock)
    monkeypatch.setattr("workers.notifications.push.logger", mock)
    return mock


def _profile() -> SimpleNamespace:
    return SimpleNamespace(
        resend_api_key="key", resend_from_email="from@example.com", pushover_user_key="user",
        pushover_api_token="token", smtp_host="smtp.example.com", smtp_port=587, smtp_user="user",
        smtp_password="secret", smtp_from_email="from@example.com",
    )


def _platform() -> SimpleNamespace:
    return SimpleNamespace(name="Board", resend_recipients=[RECIPIENT], resend_template=None,
                           smtp_recipients=[RECIPIENT], smtp_template=None, pushover_template=None)


@pytest.mark.parametrize("answer", [200, PROVIDER_REFUSED])
def test_resend_logs_neither_recipients_nor_provider_text(logger, monkeypatch, answer):
    monkeypatch.setattr("requests.post", lambda *args, **kwargs: SimpleNamespace(status_code=answer, text=PROVIDER_TEXT))
    _send_via_resend_batch([SAMPLE_JOB], _profile(), platform=_platform(), userName="Ann")
    assert logger.mock_calls
    assert RECIPIENT not in _logged_text(logger) and PROVIDER_TEXT not in _logged_text(logger)


def test_pushover_logs_no_provider_text(logger, monkeypatch):
    monkeypatch.setattr("requests.post", lambda *args, **kwargs: SimpleNamespace(status_code=PROVIDER_REFUSED, text=PROVIDER_TEXT))
    assert _send_via_pushover(SAMPLE_JOB, _profile(), platform=_platform()) is False
    assert str(PROVIDER_REFUSED) in _logged_text(logger) and PROVIDER_TEXT not in _logged_text(logger)


def test_smtp_logs_the_error_type_only(logger, monkeypatch):
    def _refuse(*_args, **_kwargs):
        raise smtplib.SMTPRecipientsRefused({RECIPIENT: (550, PROVIDER_TEXT.encode())})

    monkeypatch.setattr("smtplib.SMTP", _refuse)
    assert _send_via_smtp_batch([SAMPLE_JOB], _profile(), platform=_platform(), userName="Ann") is False
    assert "SMTPRecipientsRefused" in _logged_text(logger)
    assert RECIPIENT not in _logged_text(logger) and PROVIDER_TEXT not in _logged_text(logger)
