"""Render application documents (CV, cover letter) from HTML templates to PDF."""

import json
import os
from io import BytesIO

import markdown as _markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape
from xhtml2pdf import pisa

from core.logger import get_logger
from services.bounded_child import ChildFailed, ChildLimits, run_child
from services.safe_fetch import TEMPLATE_DIR, safe_url_fetcher, strip_attachment_links, xhtml2pdf_link_callback

logger = get_logger(__name__)

# On-demand PDF render limits (the download renders the current HTML each time). Memory and CPU are
# enforced by the OS inside the child, the wall clock by the parent. A CV of a few pages needs about
# 1 s and 120 MB; a document near the 1,000,000-char HTML bound exceeds the memory limit and fails.
PDF_RENDER_MEMORY_BYTES = 512 * 1024 * 1024
PDF_RENDER_CPU_SECONDS = 20
PDF_RENDER_TIMEOUT_SECONDS = 30
MAX_PDF_BYTES = 20 * 1024 * 1024
_PDF_CHILD_MODULE = "services.pdf_render_child"


class PdfRenderFailed(RuntimeError):
    """The PDF could not be rendered within the limits; the cause is logged, never shown."""

_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)


def list_templates() -> dict:
    """Return available template keys per category, e.g. {'cv': ['classic'], ...}."""
    result = {"cv": [], "cover_letter": []}
    for category in result:
        cat_dir = os.path.join(TEMPLATE_DIR, category)
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
    status = pisa.CreatePDF(html, dest=buf, encoding="utf-8", link_callback=xhtml2pdf_link_callback)
    if status.err:
        raise RuntimeError(f"PDF generation failed (xhtml2pdf err={status.err})")
    return buf.getvalue()


def html_to_pdf(html: str) -> bytes:
    """Render HTML string to PDF bytes using WeasyPrint.

    The HTML is user-edited or AI-generated, so resources are restricted by `safe_url_fetcher`
    and attachment links are removed before rendering.
    """
    import weasyprint  # Deferred: WeasyPrint requires GTK libs not available on all hosts
    document = weasyprint.HTML(string=html, url_fetcher=safe_url_fetcher)
    strip_attachment_links(document.etree_element)
    return document.write_pdf()


def render_pdf_isolated(html: str) -> bytes:
    """Render *html* with `html_to_pdf` in a child process bounded in memory, CPU, wall clock and output.

    Raises PdfRenderFailed for any failure, so a hostile or huge document can neither pin nor
    crash the API process.
    """
    request = json.dumps({
        "html": html,
        "memory_bytes": PDF_RENDER_MEMORY_BYTES,
        "cpu_seconds": PDF_RENDER_CPU_SECONDS,
    }).encode("utf-8")
    try:
        return run_child(_PDF_CHILD_MODULE, request, ChildLimits(PDF_RENDER_TIMEOUT_SECONDS, MAX_PDF_BYTES))
    except (ChildFailed, OSError) as error:
        logger.error("On-demand PDF render failed", exc_info=True)
        raise PdfRenderFailed(str(error)) from error


def render_cv_html(cv_data: dict, template_key: str = "classic") -> str:
    template = _env.get_template(_resolve("cv", template_key))
    return template.render(**cv_data)


def render_cover_letter_html(
    letter_markdown: str,
    template_key: str = "classic",
    sender_name: str = "",
    company: str = "",
) -> str:
    body_html = _markdown.markdown(letter_markdown or "")
    template = _env.get_template(_resolve("cover_letter", template_key))
    return template.render(body_html=body_html, sender_name=sender_name, company=company)


def render_cv_pdf(cv_data: dict, template_key: str = "classic") -> bytes:
    return _html_to_pdf(render_cv_html(cv_data, template_key))


def render_cover_letter_pdf(
    letter_markdown: str,
    template_key: str = "classic",
    sender_name: str = "",
    company: str = "",
) -> bytes:
    return _html_to_pdf(render_cover_letter_html(letter_markdown, template_key, sender_name, company))
