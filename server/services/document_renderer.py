"""Render application documents (CV, cover letter) from HTML templates to PDF."""

import os
from io import BytesIO

import markdown as _markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape
from xhtml2pdf import pisa

from core.logger import get_logger

logger = get_logger(__name__)

_TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)


def list_templates() -> dict:
    """Return available template keys per category, e.g. {'cv': ['classic'], ...}."""
    result = {"cv": [], "cover_letter": []}
    for category in result:
        cat_dir = os.path.join(_TEMPLATE_DIR, category)
        if os.path.isdir(cat_dir):
            result[category] = sorted(
                f[:-5] for f in os.listdir(cat_dir) if f.endswith(".html")
            )
    return result


def _resolve(category: str, template_key: str) -> str:
    available = list_templates().get(category, [])
    key = template_key if template_key in available else "classic"
    return f"{category}/{key}.html"


def _html_to_pdf(html: str) -> bytes:
    buf = BytesIO()
    status = pisa.CreatePDF(html, dest=buf, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"PDF generation failed (xhtml2pdf err={status.err})")
    return buf.getvalue()


def render_cv_pdf(cv_data: dict, template_key: str = "classic") -> bytes:
    template = _env.get_template(_resolve("cv", template_key))
    html = template.render(**cv_data)
    return _html_to_pdf(html)


def render_cover_letter_pdf(
    letter_markdown: str,
    template_key: str = "classic",
    sender_name: str = "",
    company: str = "",
) -> bytes:
    body_html = _markdown.markdown(letter_markdown or "")
    template = _env.get_template(_resolve("cover_letter", template_key))
    html = template.render(body_html=body_html, sender_name=sender_name, company=company)
    return _html_to_pdf(html)
