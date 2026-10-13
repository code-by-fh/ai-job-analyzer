"""User and AI supplied CV templates render in a Jinja2 sandbox and are checked when saved."""

import time
from pathlib import Path
from unittest.mock import patch

import pytest
from jinja2.exceptions import SecurityError, TemplateSyntaxError
from jinja2.sandbox import ImmutableSandboxedEnvironment

from services import safe_fetch
from tests.factories import make_job
from services.document_renderer import render_cv_html
from services.template_filler import (
    TEMPLATE_REJECTED_MESSAGE,
    TemplateRejected,
    check_jinja2_template,
    render_jinja2_in_process,
    render_jinja2_template,
    validate_template,
)

MEMORY_BOMB_SECONDS = 2
BUNDLED_CV_TEMPLATE = Path(safe_fetch.TEMPLATE_DIR, "cv", "classic.html")
CV_DATA = {
    "name": "Ada Lovelace",
    "role": "Backend Engineer",
    "summary": "Builds reliable APIs.",
    "skills": "Python, FastAPI",
    "experience": [
        {"role": "Dev", "company": "ACME", "duration": "2020-2024", "description": "Built APIs"},
    ],
    "projects": [{"name": "Crawler", "tech_stack": "Python", "description": "Scrapes jobs"}],
    "education": "B.Sc. Informatik",
}
FILLED_TEMPLATE = (
    "<h1>{{ name }}</h1>"
    "{% for exp in experience %}<p>{{ exp.role }} at {{ exp.company }} ({{ exp.duration }})</p>{% endfor %}"
    "{% if projects %}<ul>{% for proj in projects %}<li>{{ proj['name'] }}</li>{% endfor %}</ul>{% endif %}"
)
FILLED_TEMPLATE_OUTPUT = (
    "<h1>Ada Lovelace</h1>"
    "<p>Dev at ACME (2020-2024)</p>"
    "<ul><li>Crawler</li></ul>"
)
RCE_PAYLOAD = '<p>{{ cycler.__init__.__globals__.os.popen("echo PWNED_4711").read() }}</p>'
EXECUTION_MARKER = "PWNED_4711"


# --- J1: rendering inside the sandbox -------------------------------------------------------

def test_rce_payload_is_rejected_by_the_sandbox_without_executing():
    with pytest.raises(SecurityError) as rejected:
        render_jinja2_in_process(RCE_PAYLOAD, {})
    assert EXECUTION_MARKER not in str(rejected.value)


def test_rce_payload_is_rejected_with_the_fixed_message_by_the_isolated_render():
    with pytest.raises(TemplateRejected, match=f"^{TEMPLATE_REJECTED_MESSAGE}$"):
        render_jinja2_template(RCE_PAYLOAD, {})


@pytest.mark.parametrize("payload", [
    "{{ ''.__class__.__mro__ }}",
    "{{ ''.__class__.__mro__[1].__subclasses__() }}",
    "{{ (cycler|attr('__init__')).__globals__ }}",
    "{{ joiner.__init__.__globals__ }}",
    "{% set items = [] %}{{ items.append(1) }}",
])
def test_private_attribute_and_mutation_payloads_are_rejected(payload):
    with pytest.raises(SecurityError):
        render_jinja2_in_process(payload, {})


def test_rejection_carries_only_the_fixed_message():
    with pytest.raises(TemplateRejected, match=f"^{TEMPLATE_REJECTED_MESSAGE}$"):
        render_jinja2_template("{{ ''.__class__.__mro__ }}", {})


def test_rejection_is_logged_at_error_with_traceback():
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("services.template_filler.logger") as logger, pytest.raises(TemplateRejected):
        render_jinja2_template("{{ ''.__class__.__mro__ }}", {})
    logger.error.assert_called_once_with("CV template rejected while rendering", exc_info=True)


def test_broken_template_syntax_is_rejected_with_the_fixed_message():
    with pytest.raises(TemplateRejected, match=f"^{TEMPLATE_REJECTED_MESSAGE}$"):
        render_jinja2_template("{% for x in %}", {})
    with pytest.raises(TemplateSyntaxError):
        render_jinja2_in_process("{% for x in %}", {})


def test_filled_template_with_dict_attribute_access_renders():
    assert render_jinja2_template(FILLED_TEMPLATE, CV_DATA) == FILLED_TEMPLATE_OUTPUT


def test_bundled_cv_template_renders_like_the_bundled_renderer():
    template_html = BUNDLED_CV_TEMPLATE.read_text(encoding="utf-8")
    assert render_jinja2_template(template_html, CV_DATA) == render_cv_html(CV_DATA, "classic")


def test_cv_values_are_html_escaped():
    rendered = render_jinja2_template("<p>{{ name }}</p>", {"name": '<img src="x">R&D'})
    assert rendered == "<p>&lt;img src=&#34;x&#34;&gt;R&amp;D</p>"


# --- J2: check at save time -----------------------------------------------------------------

@pytest.mark.parametrize("template_html", [
    "<p>plain html</p>",
    FILLED_TEMPLATE,
    "{{ items[0] }}{{ data['name'] }}{{ name|upper }}",
])
def test_check_accepts_valid_templates(template_html):
    assert check_jinja2_template(template_html) is None


@pytest.mark.parametrize("template_html", [
    "{{ cycler.__init__ }}",
    "{{ name._private }}",
    "{{ data['__class__'] }}",
    "{{ cycler|attr('__init__') }}",
])
def test_check_rejects_private_attribute_access(template_html):
    with pytest.raises(TemplateRejected, match="attributes starting with"):
        check_jinja2_template(template_html)


def test_check_rejects_unparsable_template_with_line_number():
    with pytest.raises(TemplateRejected, match="line 2"):
        check_jinja2_template("<p>ok</p>\n{% for x in %}")


def test_validate_template_checks_the_sanitised_html():
    # html.parser decodes the entity, so only the sanitised output shows the private access.
    with pytest.raises(TemplateRejected, match="attributes starting with"):
        validate_template("<p>{{ cycler['&#95;_init__'] }}</p>", "CV")



def test_cv_build_with_unsafe_stored_template_fails_with_the_fixed_message():
    from workers.tasks.package import _build_cv
    with patch("workers.tasks.package.generate_tailored_cv", return_value=CV_DATA), \
         pytest.raises(TemplateRejected, match=f"^{TEMPLATE_REJECTED_MESSAGE}$"):
        _build_cv(
            {}, RCE_PAYLOAD, None, "Ada", "Engineer", "", "", [], "Job", "Ad", "de", None, "model",
        )


def _unbounded_render(html: str) -> str:
    """Reference output from a plain sandbox, to prove the bounds do not change normal results."""
    return ImmutableSandboxedEnvironment(autoescape=True).from_string(html).render(**CV_DATA)


RECURSIVE_MACRO = "{% macro f() %}{{ f() }}{% endmacro %}{{ f() }}"
HUGE_STRING = "<p>{{ 'x' * 10**8 }}</p>"
HUGE_LIST = "<p>{{ ([1] * 10**8) | length }}</p>"
HUGE_POWER = "<p>{{ 9**(9**9) }}</p>"
HUGE_NESTED_POWER = "<p>{{ ((10**1000)**1000)**1000 }}</p>"
OUTPUT_FLOOD = "{% for i in range(2000) %}" + "y" * 1000 + "{% endfor %}"
LETTER_WITH_BRACES = "<p>Preis: {{ 5 }} Euro, siehe {{ Anhang</p>"


@pytest.mark.parametrize("template", [
    "{{ 1/0 }}", RECURSIVE_MACRO, "{% include 'x.html' %}", "{{ range(10**30) | list }}",
])
def test_any_render_failure_becomes_the_fixed_rejection(template):
    with patch("services.template_filler.logger") as logger, pytest.raises(TemplateRejected) as rejected:
        render_jinja2_template(template, CV_DATA)
    assert str(rejected.value) == TEMPLATE_REJECTED_MESSAGE
    assert logger.error.call_args.kwargs["exc_info"] is True


@pytest.mark.parametrize("template", [HUGE_STRING, HUGE_LIST, HUGE_POWER, HUGE_NESTED_POWER, OUTPUT_FLOOD])
def test_memory_bombs_are_rejected_quickly(template):
    started = time.monotonic()
    with pytest.raises(TemplateRejected) as rejected:
        render_jinja2_template(template, CV_DATA)
    assert str(rejected.value) == TEMPLATE_REJECTED_MESSAGE
    assert time.monotonic() - started < MEMORY_BOMB_SECONDS


def test_ordinary_arithmetic_and_repetition_still_render():
    assert render_jinja2_template("{{ 2**10 }} {{ '-' * 3 }} {{ [0] * 2 }}", {}) == "1024 --- [0, 0]"


def test_bundled_cv_template_renders_identically_through_the_bounded_renderer():
    html = BUNDLED_CV_TEMPLATE.read_text(encoding="utf-8")
    assert render_jinja2_template(html, CV_DATA) == _unbounded_render(html)


def test_cover_letter_template_may_contain_literal_braces():
    assert validate_template(LETTER_WITH_BRACES, "COVER_LETTER") == LETTER_WITH_BRACES


def test_cv_template_with_broken_jinja_is_still_rejected_on_save():
    with pytest.raises(TemplateRejected):
        validate_template(LETTER_WITH_BRACES, "CV")


def test_validation_error_response_drops_empty_ctx(api_client, seed):
    seed(make_job())
    todos = [{"id": "a", "text": "one"}, {"id": "a", "text": "two"}]
    errors = api_client.patch("/jobs/job-1", json={"todos": todos}).json()["detail"]
    assert errors and all("ctx" not in error and "input" not in error for error in errors)
