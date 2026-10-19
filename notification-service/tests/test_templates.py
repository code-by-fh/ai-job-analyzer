"""Digest rendering (ported from server/workers/notifications): linear, escaped, http(s)-only links, one pass."""

import time

import pytest

from app.schemas import JobItem
from app.templates import digest_subject, render_email_html, render_push_message

SAMPLE_JOB = JobItem(title="Engineer", company="Acme", match_score=80.0, reasoning="Fits.", url="https://example.com/1")
UNCLOSED_LOOPS = "{{#jobs}}" * 11_112
RENDER_BUDGET_SECONDS = 0.2
HOSTILE_TITLE = '<a href="https://phish.example">Bewerbung</a>'
ESCAPED_TITLE = "&lt;a href=&quot;https://phish.example&quot;&gt;Bewerbung&lt;/a&gt;"
SCRIPT_URL = "javascript:alert(1)"
QUOTING_URL = 'https://example.com/?a=1&b="2'
DETAILS_LINK_TEXT = "Details anzeigen"
UNQUOTED_LINK = "{{#jobs}}<a href=$url>x</a>{{/jobs}}"


def _job(**overrides) -> JobItem:
    return SAMPLE_JOB.model_copy(update=overrides)


def _render(template: str, job: JobItem = SAMPLE_JOB) -> str:
    return render_email_html([job], template, user_name="Ann", platform_name="Board")


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
    assert _render("{{#jobs}}$title{{/jobs}}", _job(title=r"C\1 \g<0>")) == r"C\1 \g&lt;0&gt;"


@pytest.mark.parametrize("template", ["{{#jobs}}$title{{/jobs}}", "$jobs_html", ""])
def test_job_text_is_escaped_in_every_template_kind(template):
    html = _render(template, _job(title=HOSTILE_TITLE))
    assert ESCAPED_TITLE in html
    assert HOSTILE_TITLE not in html


def test_user_and_source_names_are_escaped():
    html = render_email_html([SAMPLE_JOB], "{{#jobs}}{{/jobs}}$userName|$platform_name", user_name="<i>A</i>", platform_name='"B"')
    assert html == "&lt;i&gt;A&lt;/i&gt;|&quot;B&quot;"


@pytest.mark.parametrize("url", [SCRIPT_URL, "data:text/html,x", "//evil.example/x", ""])
def test_a_loop_link_takes_web_addresses_only(url):
    assert _render('{{#jobs}}<a href="$url">x</a>{{/jobs}}', _job(url=url)) == '<a href="#">x</a>'


def test_the_default_row_drops_a_link_that_is_no_web_address():
    html = _render("", _job(url=SCRIPT_URL))
    assert "javascript:" not in html
    assert DETAILS_LINK_TEXT not in html


def test_a_web_address_is_escaped_inside_the_href():
    assert _render('{{#jobs}}<a href="$url">x</a>{{/jobs}}', _job(url=QUOTING_URL)) == '<a href="https://example.com/?a=1&amp;b=&quot;2">x</a>'


@pytest.mark.parametrize("separator, encoded", [(" ", "%20"), ("\t", "%09"), ("\n", "%0A")])
def test_whitespace_in_a_web_address_cannot_add_attributes_to_an_unquoted_href(separator, encoded):
    html = _render(UNQUOTED_LINK, _job(url=f"https://example.com/{separator}onmouseover=alert(1)"))
    assert html == f"<a href=https://example.com/{encoded}onmouseover=alert(1)>x</a>"


def test_the_default_row_keeps_an_address_with_whitespace_as_one_attribute_value():
    assert '<a href="https://example.com/a%20b">' in _render("", _job(url="https://example.com/a b"))


def test_a_variable_name_inside_job_text_stays_literal_in_a_loop():
    assert _render("{{#jobs}}$title{{/jobs}}", _job(title="$userName $company")) == "$userName $company"


def test_a_variable_name_inside_job_text_stays_literal_in_the_rows_block():
    html = _render("$jobs_html", _job(title="$userName"))
    assert "$userName" in html
    assert "Ann" not in html


def test_push_job_text_naming_a_variable_stays_literal():
    assert render_push_message(_job(title="$company", company="Acme"), "$title @ $company") == "$company @ Acme"


def test_a_push_link_variable_takes_web_addresses_only():
    assert render_push_message(_job(url=SCRIPT_URL), "[$url]") == "[]"


def test_the_default_push_text_names_company_score_and_reasoning():
    assert render_push_message(SAMPLE_JOB, None) == "Acme - Score: 80%\n\nFits...."


@pytest.mark.parametrize(
    "count, subject", [(1, "[Job Agent] 1 neuer Job-Match von Board"), (2, "[Job Agent] 2 neue Job-Matches von Board")]
)
def test_the_digest_subject_counts_the_matches(count, subject):
    assert digest_subject(count, "Board") == subject


def test_the_digest_subject_stays_on_one_line():
    assert digest_subject(1, "Board\r\nBcc: x@example.com") == "[Job Agent] 1 neuer Job-Match von Board Bcc: x@example.com"
