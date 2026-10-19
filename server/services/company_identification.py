"""Find the employer's own website domain of a job when the user left the company domain empty."""

from typing import Optional

from database.core import JobEntry
from intelligence.service import identify_company_domain
from services.company_domain import is_job_board_or_redirect, normalised_host

URL_SCHEME_SEPARATOR = "://"


def _as_host(answer: Optional[str]) -> Optional[str]:
    """The AI may answer a bare domain or a full URL; both go through the shared validator."""
    if not answer:
        return None
    url = answer.strip() if URL_SCHEME_SEPARATOR in answer else f"https://{answer.strip()}"
    return normalised_host(url)


def identify_job_company_domain(job: JobEntry, ai: tuple) -> Optional[str]:
    """The validated employer domain the AI names for *job*, or None when it names none usable.

    *ai* is the (client, model) pair of the company research this identification prepares. The posting
    or source host is accepted (an employer may post on its own site); only known job boards and
    redirectors are refused.
    """
    client, model = ai
    host = _as_host(identify_company_domain(job.company or "", job.title or "", job.url or "", model, client))
    if host is None or is_job_board_or_redirect(host):
        return None
    return host
