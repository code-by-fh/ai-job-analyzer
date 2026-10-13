"""The companies a user knows from their own jobs, joined with the shared profiles (G6).

Profiles are shared by design (phase 2); which domains a user sees, and the job count, come from that
user's own non-SEEN jobs only. The job count includes archived jobs, as does the company detail.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.job_status import STATUS_SEEN
from database.core import CompanyProfile, JobEntry, iso_utc

NO_OWN_JOBS = (0, None)
COMPANY_RESULTS = 5


def _own_domains(db: Session, user_id: int) -> dict:
    """domain -> (job count, a company name from the user's jobs); legacy empty domains are skipped."""
    rows = (
        db.query(JobEntry.company_domain, func.count(JobEntry.id), func.max(JobEntry.company))
        .filter(
            JobEntry.user_id == user_id,
            JobEntry.company_domain.isnot(None),
            JobEntry.company_domain != "",
            JobEntry.status != STATUS_SEEN,
        )
        .group_by(JobEntry.company_domain)
        .all()
    )
    return {domain: (count, name) for domain, count, name in rows}


def _profiles(db: Session, own_domains: list, include_all: bool) -> dict:
    """domain -> (name, analyzed_at); never loads raw_data, so scope "all" stays cheap."""
    if not include_all and not own_domains:
        return {}
    query = db.query(CompanyProfile.domain, CompanyProfile.name, CompanyProfile.analyzed_at)
    if not include_all:
        query = query.filter(CompanyProfile.domain.in_(own_domains))
    return {domain: (name, analyzed_at) for domain, name, analyzed_at in query.all()}


def _summary(domain: str, own: tuple, profile) -> dict:
    count, job_name = own
    profile_name, analyzed_at = profile or (None, None)
    return {
        "domain": domain,
        "name": profile_name or job_name or domain,
        "has_profile": profile is not None,
        "analyzed_at": iso_utc(analyzed_at),
        "job_count": count,
    }


def company_summaries(db: Session, user_id: int, include_all: bool) -> list:
    """The user's companies, plus every profiled company when *include_all*; sorted by name, case-insensitively.

    Each item is ``{domain, name, has_profile, analyzed_at, job_count}``; *include_all* is for admins only,
    the caller checks the role.
    """
    own = _own_domains(db, user_id)
    profiles = _profiles(db, list(own), include_all)
    domains = set(own) | set(profiles)
    items = [_summary(domain, own.get(domain, NO_OWN_JOBS), profiles.get(domain)) for domain in domains]
    return sorted(items, key=lambda item: (item["name"].casefold(), item["domain"]))


def search_companies(db: Session, user_id: int, text: str) -> list:
    """Up to COMPANY_RESULTS of the user's own companies whose name or domain contains *text* (``{domain, name}``).

    Filtered in Python: the user's own directory is small, and a plain substring test needs no escaping.
    """
    own = company_summaries(db, user_id, include_all=False)
    matches = [item for item in own if _matches(item, text)]
    return [{"domain": item["domain"], "name": item["name"]} for item in matches[:COMPANY_RESULTS]]


def _matches(item: dict, text: str) -> bool:
    """Case folding by lower(), not casefold(), like the database's ILIKE for the job hits of the same search.

    So "ß" stays "ß" ("STRASSE" finds no "Straße") in both halves of one answer.
    """
    needle = text.lower()
    return needle in item["name"].lower() or needle in item["domain"].lower()
