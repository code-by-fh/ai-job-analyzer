import pytest
from services.template_filler import fill_template, validate_template


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

def test_validate_cv_requires_name_and_role():
    html = '<h1 data-slot="name">N</h1>'
    with pytest.raises(ValueError, match="role"):
        validate_template(html, "CV")


def test_validate_cover_letter_requires_body():
    html = '<div data-slot="sender_name">S</div>'
    with pytest.raises(ValueError, match="body"):
        validate_template(html, "COVER_LETTER")


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
