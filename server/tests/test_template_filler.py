import pytest
from services.template_filler import (
    fill_template, validate_template,
    has_jinja2_syntax, render_jinja2_template,
)


# ── fill_template ──────────────────────────────────────────────────────────────

def test_fill_simple_slot():
    html = '<h1 data-slot="name">Placeholder</h1>'
    result = fill_template(html, {"name": "Ada Lovelace"})
    assert "Ada Lovelace" in result
    assert 'data-slot' not in result


def test_fill_slot_html_escaping():
    html = '<div data-slot="name">x</div>'
    result = fill_template(html, {"name": "<script>alert(1)</script>"})
    assert "<script>" not in result
    assert "&lt;script&gt;" in result


def test_fill_missing_slot_leaves_empty():
    html = '<div data-slot="role">Rolle</div>'
    result = fill_template(html, {})
    assert 'data-slot' not in result
    # content replaced with empty string
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(result, "html.parser")
    assert soup.find("div").get_text() == ""


def test_fill_repeat_one_item():
    html = (
        '<section data-block="experience" data-block-label="Erfahrung">'
        '<div data-repeat="experience">'
        '<strong data-slot="role"></strong>'
        '</div>'
        '</section>'
    )
    result = fill_template(html, {"experience": [{"role": "Engineer"}]})
    assert "Engineer" in result
    assert 'data-repeat' not in result


def test_fill_repeat_multiple_items():
    html = '<div data-repeat="experience"><span data-slot="role"></span></div>'
    data = {"experience": [{"role": "A"}, {"role": "B"}, {"role": "C"}]}
    result = fill_template(html, data)
    assert result.count("A") == 1
    assert result.count("B") == 1
    assert result.count("C") == 1


def test_fill_repeat_zero_items_removes_prototype():
    html = '<div data-repeat="experience"><span data-slot="role"></span></div>'
    result = fill_template(html, {"experience": []})
    assert 'data-repeat' not in result
    assert 'data-slot' not in result


def test_fill_repeat_missing_key_clears_prototype():
    html = '<div data-repeat="projects"><span data-slot="name"></span></div>'
    result = fill_template(html, {})
    assert 'data-repeat' not in result


# ── validate_template ──────────────────────────────────────────────────────────

def test_validate_cv_sanitises_and_returns_html():
    html = '<h1 data-slot="name">N</h1>'
    result = validate_template(html, "CV")
    assert "N" in result


def test_validate_cover_letter_sanitises_and_returns_html():
    html = '<div data-slot="sender_name">S</div>'
    result = validate_template(html, "COVER_LETTER")
    assert "S" in result


def test_validate_removes_script_tags():
    html = (
        '<h1 data-slot="name">N</h1>'
        '<div data-slot="role">R</div>'
        '<script>alert(1)</script>'
    )
    result = validate_template(html, "CV")
    assert "<script>" not in result


def test_validate_removes_on_handlers():
    html = (
        '<h1 data-slot="name" onclick="evil()">N</h1>'
        '<div data-slot="role">R</div>'
    )
    result = validate_template(html, "CV")
    assert "onclick" not in result


def test_validate_valid_cv_passes():
    html = '<h1 data-slot="name">N</h1><div data-slot="role">R</div>'
    result = validate_template(html, "CV")
    assert 'data-slot="name"' in result


# ── has_jinja2_syntax ─────────────────────────────────────────────────────────

def test_has_jinja2_syntax_variable():
    assert has_jinja2_syntax("Hello {{ name }}") is True

def test_has_jinja2_syntax_block():
    assert has_jinja2_syntax("{% for x in items %}{{ x }}{% endfor %}") is True

def test_has_jinja2_syntax_plain_html():
    assert has_jinja2_syntax("<h1>Hello</h1>") is False

def test_has_jinja2_syntax_data_slot():
    assert has_jinja2_syntax('<h1 data-slot="name">Name</h1>') is False


# ── render_jinja2_template ────────────────────────────────────────────────────

def test_render_jinja2_simple_variable():
    html = "<h1>{{ name }}</h1>"
    result = render_jinja2_template(html, {"name": "Ada Lovelace"})
    assert result == "<h1>Ada Lovelace</h1>"

def test_render_jinja2_loop():
    html = "{% for exp in experience %}<div>{{ exp.role }}</div>{% endfor %}"
    data = {"experience": [{"role": "Engineer"}, {"role": "Lead"}]}
    result = render_jinja2_template(html, data)
    assert "Engineer" in result
    assert "Lead" in result

def test_render_jinja2_conditional_present():
    html = "{% if skills %}<p>{{ skills }}</p>{% endif %}"
    result = render_jinja2_template(html, {"skills": "Python, Go"})
    assert "<p>Python, Go</p>" in result

def test_render_jinja2_conditional_absent():
    html = "{% if skills %}<p>{{ skills }}</p>{% endif %}"
    result = render_jinja2_template(html, {})
    assert "<p>" not in result

def test_render_jinja2_missing_var_renders_empty():
    html = "<span>{{ location }}</span>"
    result = render_jinja2_template(html, {})
    assert result == "<span></span>"

def test_render_jinja2_empty_loop():
    html = "{% for exp in experience %}<div>{{ exp.role }}</div>{% endfor %}"
    result = render_jinja2_template(html, {"experience": []})
    assert "<div>" not in result
