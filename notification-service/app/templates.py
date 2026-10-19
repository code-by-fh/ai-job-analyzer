"""Job digest rendering, ported from the job agent's ``server/workers/notifications/templates.py``.

Hardening kept as it was there:
- ``{{#jobs}} ... {{/jobs}}`` is replaced in linear time (two ``str.find`` calls, no lazy regex); every
  complete loop becomes the first loop's body rendered once per job.
- All ``$`` variables are substituted in one ``re.sub`` pass, so job text containing ``$userName``
  stays literal.
- Every inserted job field, the user name and the source name is ``html.escape``d (``quote=True``);
  the template author's own HTML is trusted and sent as written.
- Links take only ``http://`` / ``https://`` addresses (else ``#``, or no link in the default row), and
  whitespace in them is percent-encoded so even an unquoted ``href=$url`` gets one value.
Push messages are plain text: the same one-pass substitution, unescaped, with the same link rule.
"""

import re
from html import escape
from typing import Optional, Sequence, Tuple
from urllib.parse import quote

from app.schemas import JobItem

JOBS_LOOP_OPEN = "{{#jobs}}"
JOBS_LOOP_CLOSE = "{{/jobs}}"
REASONING_PREVIEW_LENGTH = 300
PUSH_DEFAULT_REASONING_LENGTH = 100
NO_LINK_TARGET = "#"
_TEMPLATE_VARIABLE = re.compile(
    r"\$(jobs_html|jobCount|count|userName|platform_name|title|company|match_score|reasoning|url)"
)
_WEB_ADDRESS = re.compile(r"https?://", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s")
_LINE_BREAKS = re.compile(r"[\x00-\x1f\x7f]+")

_DEFAULT_JOB_ROW = """
<div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
  <h3 style="margin:0 0 4px">{title} &ndash; {company}</h3>
  <p style="margin:0;color:#64748b">Match Score: <strong>{match_score}%</strong></p>
  <p style="margin:8px 0;font-size:14px;color:#334155">{reasoning}</p>
  {url_link}
</div>
"""

_DEFAULT_HTML = """<html><body>
<p>Hi {userName},</p>
<h2>{count} new job match{plural} from {platform_name}</h2>
{job_rows}
<p style="color:#94a3b8;font-size:12px;">Sent by Job Agent</p>
</body></html>"""


def _escaped(text: Optional[str]) -> str:
    return escape(text or "", quote=True)


def web_link(url: Optional[str]) -> Optional[str]:
    """The url when it is an http(s) address (whitespace percent-encoded), else None: no javascript: link goes live."""
    if not url or not _WEB_ADDRESS.match(url):
        return None
    return _WHITESPACE.sub(lambda match: quote(match.group(0)), url)


def _web_address(url: Optional[str]) -> Optional[str]:
    link = web_link(url)
    return None if link is None else _escaped(link)


def single_line(text: str) -> str:
    """Control characters (CR/LF included) become one space: for subjects and push titles."""
    return _LINE_BREAKS.sub(" ", text)


def _score(job: JobItem) -> str:
    return str(int(job.match_score)) if job.match_score else "0"


def _job_values(job: JobItem) -> dict:
    """The job's template variables, escaped: scraped and AI-written text lands in real mailboxes as HTML."""
    return {
        "title": _escaped(job.title),
        "company": _escaped(job.company),
        "match_score": _score(job),
        "reasoning": _escaped(job.reasoning[:REASONING_PREVIEW_LENGTH]),
        "url": _web_address(job.url) or NO_LINK_TARGET,
    }


def substitute_variables(template: str, values: dict) -> str:
    """One pass: inserted text is never searched again, and a name without a value stays literal."""
    return _TEMPLATE_VARIABLE.sub(lambda match: values.get(match.group(1), match.group(0)), template)


def render_job_rows(jobs: Sequence[JobItem]) -> str:
    """The default per-job HTML rows; a job without a web address gets no link."""
    rows = []
    for job in jobs:
        url = _web_address(job.url)
        url_link = f'<a href="{url}">Details anzeigen</a>' if url else ""
        rows.append(_DEFAULT_JOB_ROW.format(**_job_values(job), url_link=url_link))
    return "".join(rows)


def _job_loop_span(template: str, start: int) -> Optional[Tuple[int, int]]:
    """Start and end of the first complete loop at or after *start*, else None (linear: two finds)."""
    opening = template.find(JOBS_LOOP_OPEN, start)
    if opening < 0:
        return None
    closing = template.find(JOBS_LOOP_CLOSE, opening + len(JOBS_LOOP_OPEN))
    return None if closing < 0 else (opening, closing + len(JOBS_LOOP_CLOSE))


def _render_loop_block(block: str, jobs: Sequence[JobItem], shared: dict) -> str:
    return "".join(substitute_variables(block, {**shared, **_job_values(job)}) for job in jobs)


def _replace_job_loops(template: str, jobs: Sequence[JobItem], shared: dict) -> str:
    """Every complete loop is replaced by the first loop's body rendered per job."""
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


def _shared_values(count: int, user_name: str, platform_name: str) -> dict:
    """The digest-wide variables; the source name can be AI-generated from a scraped title, so it is escaped."""
    return {
        "userName": _escaped(user_name),
        "platform_name": _escaped(platform_name),
        "jobCount": str(count),
        "count": str(count),
    }


def _render_custom(raw_template: str, jobs: Sequence[JobItem], shared: dict) -> str:
    """A ``{{#jobs}}`` loop wins over a ``$jobs_html`` block; a template with neither is sent as written."""
    if JOBS_LOOP_OPEN in raw_template:
        return _replace_job_loops(raw_template, jobs, shared)
    if "$jobs_html" in raw_template:
        return substitute_variables(raw_template, {**shared, "jobs_html": render_job_rows(jobs)})
    return raw_template


def render_email_html(jobs: Sequence[JobItem], raw_template: str, *, user_name: str, platform_name: str) -> str:
    """The digest HTML: the custom template (loop, ``$jobs_html`` or as written) or the built-in one.

    Variables belong only in text or quoted attribute values.
    """
    count = len(jobs)
    shared = _shared_values(count, user_name, platform_name)
    if raw_template:
        return _render_custom(raw_template, jobs, shared)
    return _DEFAULT_HTML.format(
        userName=shared["userName"],
        count=count,
        plural="es" if count != 1 else "",
        platform_name=shared["platform_name"],
        job_rows=render_job_rows(jobs),
    )


def digest_subject(count: int, platform_name: str) -> str:
    """The digest subject line; always one line, so a source name cannot add mail headers."""
    return single_line(
        f"[Job Agent] {count} neue{'r' if count == 1 else ''} "
        f"Job-Match{'es' if count != 1 else ''} von {platform_name}"
    )


def render_push_message(job: JobItem, template: Optional[str]) -> str:
    """The push text for *job*: the template with its variables filled, or the built-in line."""
    if not template:
        return f"{job.company} - Score: {_score(job)}%\n\n{job.reasoning[:PUSH_DEFAULT_REASONING_LENGTH]}..."
    values = {
        "title": job.title,
        "company": job.company,
        "match_score": _score(job),
        "reasoning": job.reasoning,
        "url": web_link(job.url) or "",
    }
    return substitute_variables(template, values)
