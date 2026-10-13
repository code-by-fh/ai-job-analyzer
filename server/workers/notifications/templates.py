"""Shared HTML rendering for batch e-mail digests (Resend / Mailjet / SMTP).

The rendering logic (default templates, per-job rows and the custom-template
substitution rules) used to be copy-pasted across all three e-mail adapters.
It lives here once and is consumed by ``notifications.email``.
"""

import re
from html import escape
from typing import Optional, Tuple
from urllib.parse import quote

JOBS_LOOP_OPEN = "{{#jobs}}"
JOBS_LOOP_CLOSE = "{{/jobs}}"
REASONING_PREVIEW_LENGTH = 300
NO_LINK_TARGET = "#"
_TEMPLATE_VARIABLE = re.compile(
    r"\$(jobs_html|jobCount|count|userName|platform_name|title|company|match_score|reasoning|url)"
)
_WEB_ADDRESS = re.compile(r"https?://", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s")

_RESEND_DEFAULT_JOB_ROW = """
<div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
  <h3 style="margin:0 0 4px">{title} &ndash; {company}</h3>
  <p style="margin:0;color:#64748b">Match Score: <strong>{match_score}%</strong></p>
  <p style="margin:8px 0;font-size:14px;color:#334155">{reasoning}</p>
  {url_link}
</div>
"""

_RESEND_DEFAULT_HTML = """<html><body>
<p>Hi {userName},</p>
<h2>{count} new job match{plural} from {platform_name}</h2>
{job_rows}
<p style="color:#94a3b8;font-size:12px;">Sent by Job Agent</p>
</body></html>"""


def _escaped(text: Optional[str]) -> str:
    return escape(text or "", quote=True)


def _web_address(url: Optional[str]) -> Optional[str]:
    """The escaped url when it is an http(s) address, else None, so a scraped javascript: link never goes live.

    Whitespace is percent-encoded, so the url stays one value even in an unquoted attribute.
    """
    if not url or not _WEB_ADDRESS.match(url):
        return None
    return _escaped(_WHITESPACE.sub(lambda match: quote(match.group(0)), url))


def _job_values(job) -> dict:
    """The job's template variables, escaped: scraped and AI-written text lands in real mailboxes as HTML."""
    return {
        "title": _escaped(job.title),
        "company": _escaped(job.company),
        "match_score": str(int(job.match_score)) if job.match_score else "0",
        "reasoning": _escaped((job.reasoning or "")[:REASONING_PREVIEW_LENGTH]),
        "url": _web_address(job.url) or NO_LINK_TARGET,
    }


def substitute_variables(template: str, values: dict) -> str:
    """One pass: inserted text is never searched again, and a name without a value stays literal."""
    return _TEMPLATE_VARIABLE.sub(lambda match: values.get(match.group(1), match.group(0)), template)


def render_job_rows(jobs) -> str:
    """Render the default per-job HTML rows for a digest; a job without a web address gets no link."""
    job_rows_html = ""
    for j in jobs:
        url = _web_address(j.url)
        url_link = f'<a href="{url}">Details anzeigen</a>' if url else ""
        job_rows_html += _RESEND_DEFAULT_JOB_ROW.format(**_job_values(j), url_link=url_link)
    return job_rows_html


def _job_loop_span(template: str, start: int) -> Optional[Tuple[int, int]]:
    """Start and end of the first complete ``{{#jobs}}...{{/jobs}}`` at or after *start*, else None.

    Two ``str.find`` calls keep this linear: a regex with a lazy ``.*?`` turns quadratic on a
    template full of unclosed opening tags.
    """
    opening = template.find(JOBS_LOOP_OPEN, start)
    if opening < 0:
        return None
    closing = template.find(JOBS_LOOP_CLOSE, opening + len(JOBS_LOOP_OPEN))
    return None if closing < 0 else (opening, closing + len(JOBS_LOOP_CLOSE))


def _render_loop_block(block: str, jobs, shared: dict) -> str:
    """The loop body once per job, with the shared and that job's variables filled in."""
    return "".join(substitute_variables(block, {**shared, **_job_values(job)}) for job in jobs)


def _replace_job_loops(template: str, jobs, shared: dict) -> str:
    """Every complete loop is replaced by the first loop's body rendered per job; job text is inserted literally."""
    span = _job_loop_span(template, 0)
    if span is None:
        return substitute_variables(template, shared)
    block = template[span[0] + len(JOBS_LOOP_OPEN):span[1] - len(JOBS_LOOP_CLOSE)]
    rendered = _render_loop_block(block, jobs, shared)
    pieces, cursor = [], 0
    while span is not None:
        pieces += [substitute_variables(template[cursor:span[0]], shared), rendered]
        cursor = span[1]
        span = _job_loop_span(template, cursor)
    pieces.append(substitute_variables(template[cursor:], shared))
    return "".join(pieces)


def _shared_values(count: int, userName: str, platform_name: str) -> dict:
    """The digest-wide variables; the source name can be AI-generated from a scraped page title, so it is escaped."""
    return {
        "userName": _escaped(userName),
        "platform_name": _escaped(platform_name),
        "jobCount": str(count),
        "count": str(count),
    }


def _render_custom(raw_template: str, jobs, shared: dict) -> str:
    """A ``{{#jobs}}`` loop wins over a ``$jobs_html`` block; a template with neither is sent as written."""
    if JOBS_LOOP_OPEN in raw_template:
        return _replace_job_loops(raw_template, jobs, shared)
    if "$jobs_html" in raw_template:
        return substitute_variables(raw_template, {**shared, "jobs_html": render_job_rows(jobs)})
    return raw_template


def render_email_html(jobs, raw_template: str, *, userName: str, platform_name: str) -> str:
    """Build the digest HTML body.

    Every variable is substituted in one pass with escaped values. Variables belong only in text
    or quoted attribute values. The template kinds:
    - ``{{#jobs}}...{{/jobs}}`` mustache-style loop, or
    - ``$jobs_html`` block replacement, or
    - a fully custom template, or
    - the built-in default template.
    """
    count = len(jobs)
    shared = _shared_values(count, userName, platform_name)
    if raw_template:
        return _render_custom(raw_template, jobs, shared)
    return _RESEND_DEFAULT_HTML.format(
        userName=shared["userName"],
        count=count,
        plural="es" if count != 1 else "",
        platform_name=shared["platform_name"],
        job_rows=render_job_rows(jobs),
    )


def digest_subject(count: int, platform_name: str) -> str:
    """Subject line shared by all batch e-mail channels."""
    return (
        f"[Job Agent] {count} neue{'r' if count == 1 else ''} "
        f"Job-Match{'es' if count != 1 else ''} von {platform_name}"
    )
