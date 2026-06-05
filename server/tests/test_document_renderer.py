import pytest

from services.document_renderer import (
    list_templates,
    render_cv_pdf,
    render_cover_letter_pdf,
)


def test_list_templates_returns_classic():
    templates = list_templates()
    assert "classic" in templates["cv"]
    assert "classic" in templates["cover_letter"]


def test_render_cv_pdf_returns_pdf_bytes():
    cv = {
        "name": "Max Mustermann",
        "role": "Backend Engineer",
        "skills": "Python, FastAPI",
        "experience": [
            {"role": "Dev", "company": "ACME", "duration": "2020-2024", "description": "Built APIs"}
        ],
        "projects": [],
        "education": "B.Sc. Informatik",
    }
    pdf = render_cv_pdf(cv, template_key="classic")
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"


def test_render_cover_letter_pdf_returns_pdf_bytes():
    pdf = render_cover_letter_pdf(
        letter_markdown="Sehr geehrte Damen und Herren,\n\nich bewerbe mich.",
        template_key="classic",
        sender_name="Max Mustermann",
        company="ACME GmbH",
    )
    assert pdf[:4] == b"%PDF"


def test_render_cv_pdf_unknown_template_falls_back_to_classic():
    pdf = render_cv_pdf({"name": "X", "role": "Y"}, template_key="does-not-exist")
    assert pdf[:4] == b"%PDF"


def test_html_to_pdf_returns_pdf_bytes():
    try:
        pytest.importorskip("weasyprint", reason="WeasyPrint not available in this environment")
    except OSError as e:
        pytest.skip(f"WeasyPrint system libraries not available at import: {e}")
    from services.document_renderer import html_to_pdf
    html = "<html><body><h1>Test CV</h1></body></html>"
    try:
        pdf = html_to_pdf(html)
    except OSError as e:
        pytest.skip(f"WeasyPrint system libraries not available: {e}")
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
