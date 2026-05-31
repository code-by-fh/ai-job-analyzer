"""Shared HTML rendering for batch e-mail digests (Resend / Mailjet / SMTP).

The rendering logic (default templates, per-job rows and the custom-template
substitution rules) used to be copy-pasted across all three e-mail adapters.
It lives here once and is consumed by ``notifications.email``.
"""

import re

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


def render_job_rows(jobs) -> str:
    """Render the default per-job HTML rows for a digest."""
    job_rows_html = ""
    for j in jobs:
        score = str(int(j.match_score)) if j.match_score else "0"
        url_link = f'<a href="{j.url}">Details anzeigen</a>' if j.url else ""
        job_rows_html += _RESEND_DEFAULT_JOB_ROW.format(
            title=j.title or "",
            company=j.company or "",
            match_score=score,
            reasoning=(j.reasoning or "")[:300],
            url_link=url_link,
        )
    return job_rows_html


def render_email_html(jobs, raw_template: str, *, userName: str, platform_name: str) -> str:
    """Build the digest HTML body.

    Mirrors the exact substitution rules previously duplicated in every adapter:
    - ``{{#jobs}}...{{/jobs}}`` mustache-style loop, or
    - ``$jobs_html`` block replacement, or
    - a fully custom template, or
    - the built-in default template.
    """
    count = len(jobs)
    job_rows_html = render_job_rows(jobs)

    if raw_template:
        if "{{#jobs}}" in raw_template:
            loop_match = re.search(
                r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", raw_template, re.DOTALL
            )
            if loop_match:
                loop_block = loop_match.group(1)
                rendered_jobs = ""
                for j in jobs:
                    score = str(int(j.match_score)) if j.match_score else "0"
                    rendered_jobs += (
                        loop_block.replace("$title", j.title or "")
                        .replace("$company", j.company or "")
                        .replace("$match_score", score)
                        .replace("$reasoning", (j.reasoning or "")[:300])
                        .replace("$url", j.url or "#")
                    )
                html = re.sub(
                    r"\{\{#jobs\}\}.*?\{\{/jobs\}\}",
                    rendered_jobs,
                    raw_template,
                    flags=re.DOTALL,
                )
            else:
                html = raw_template
            html = (
                html.replace("$userName", userName)
                .replace("$jobCount", str(count))
                .replace("$count", str(count))
                .replace("$platform_name", platform_name)
            )
        elif "$jobs_html" in raw_template:
            html = (
                raw_template.replace("$jobs_html", job_rows_html)
                .replace("$jobCount", str(count))
                .replace("$count", str(count))
                .replace("$platform_name", platform_name)
                .replace("$userName", userName)
            )
        else:
            html = raw_template  # treat as fully custom HTML
    else:
        html = _RESEND_DEFAULT_HTML.format(
            userName=userName,
            count=count,
            plural="es" if count != 1 else "",
            platform_name=platform_name,
            job_rows=job_rows_html,
        )

    return html


def digest_subject(count: int, platform_name: str) -> str:
    """Subject line shared by all batch e-mail channels."""
    return (
        f"[Job Agent] {count} neue{'r' if count == 1 else ''} "
        f"Job-Match{'es' if count != 1 else ''} von {platform_name}"
    )
