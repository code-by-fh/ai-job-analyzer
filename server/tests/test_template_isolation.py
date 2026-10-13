"""User templates render in a short-lived child process with memory, CPU and wall-clock limits."""

import time

import pytest

from services import template_filler
from services.template_filler import TEMPLATE_REJECTED_MESSAGE, TemplateRejected, render_jinja2_template

TEST_MEMORY_BYTES = 200 * 1024 * 1024
TEST_TIMEOUT_SECONDS = 4
TEST_CPU_SECONDS = 3
SLACK_SECONDS = 3
BIG = 200_000_000

# Payloads from the security review that slip past the `*` / `**` interception.
AMPLIFIERS = [
    f"{{{{ 'x'|center({BIG}) }}}}",
    f"{{{{ '%{BIG}s'|format('x') }}}}",
    f"{{{{ 'x'.ljust({BIG}) }}}}",
    f"{{{{ 'x'.zfill({BIG}) }}}}",
    f"{{{{ ('a' ~ '\\t').expandtabs({BIG}) }}}}",
    f"{{{{ 'x'|center({BIG})|length }}}}",
    "{% set a = 'x' * 99999 %}{{ ([a] * 2000)|join|length }}",
    "{% set a = 'x' * 99999 %}{{ a|replace('x', a)|length }}",
    "{% set ns = namespace(s='x') %}{% for i in range(28) %}{% set ns.s = ns.s ~ ns.s %}{% endfor %}{{ ns.s|length }}",
    "{% macro m(s, d) %}{% if d > 0 %}{{ m(s ~ s, d - 1) }}{% else %}{{ s|length }}{% endif %}{% endmacro %}{{ m('x', 27) }}",
    "{% set ns = namespace(n=10**25000) %}{% for i in range(10) %}{% set ns.n = ns.n * ns.n %}{% endfor %}{{ ns.n.bit_length() }}",
    "{% for i in range(99999) %}{% for j in range(99999) %}{% endfor %}{% endfor %}",
]


@pytest.fixture()
def small_limits(monkeypatch):
    monkeypatch.setattr(template_filler, "TEMPLATE_RENDER_MEMORY_BYTES", TEST_MEMORY_BYTES)
    monkeypatch.setattr(template_filler, "TEMPLATE_RENDER_TIMEOUT_SECONDS", TEST_TIMEOUT_SECONDS)
    monkeypatch.setattr(template_filler, "TEMPLATE_RENDER_CPU_SECONDS", TEST_CPU_SECONDS)


@pytest.mark.parametrize("template", AMPLIFIERS)
def test_resource_bombs_are_rejected_within_the_timeout(small_limits, template):
    started = time.monotonic()
    with pytest.raises(TemplateRejected) as rejected:
        render_jinja2_template(template, {})
    assert str(rejected.value) == TEMPLATE_REJECTED_MESSAGE
    assert time.monotonic() - started < TEST_TIMEOUT_SECONDS + SLACK_SECONDS


def test_render_runs_in_a_child_process_without_application_secrets(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "must-not-reach-the-child")
    monkeypatch.setenv("DATABASE_URL", "postgres://user:hunter2@db/x")
    environment = template_filler._child_environment()
    assert "must-not-reach-the-child" not in environment.values()
    assert "hunter2" not in " ".join(environment.values())


def test_render_returns_html_and_keeps_escaping():
    assert render_jinja2_template("<p>{{ name }}</p>", {"name": "<b>"}) == "<p>&lt;b&gt;</p>"


def test_child_that_exits_with_failure_is_rejected_with_fixed_message(monkeypatch):
    monkeypatch.setattr(template_filler, "_CHILD_MODULE", "services.no_such_render_child")
    with pytest.raises(TemplateRejected) as rejected:
        render_jinja2_template("<p>{{ 1 }}</p>", {})
    assert str(rejected.value) == TEMPLATE_REJECTED_MESSAGE
