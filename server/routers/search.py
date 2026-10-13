"""GET /search: the user's own jobs and companies for the global search dialog (spec 4.1)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, StringConstraints
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from core.job_status import STATUS_SEEN
from core.like_pattern import LIKE_ESCAPE, contains_pattern
from database.core import JobEntry, User
from routers.deps import limiter, user_or_ip_key
from services.company_directory import search_companies

router = APIRouter()
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 200
JOB_RESULTS = 8
# The dialog debounces typing; this caps a client that does not.
SEARCH_RATE = "60/minute"


class SearchQuery(BaseModel):
    """The bounds apply after the trim, so " k " is too short."""

    q: Annotated[str, StringConstraints(strip_whitespace=True, min_length=MIN_QUERY_LENGTH, max_length=MAX_QUERY_LENGTH)]


def _job_hit(job: JobEntry) -> dict:
    return {
        "id": job.id,
        "title": job.title,
        "company": job.company,
        "company_domain": job.company_domain,
        "status": job.status,
        "is_archived": bool(job.is_archived),
    }


def _job_hits(db: Session, user_id: int, text: str) -> list:
    """The user's non-SEEN jobs whose title or company contains *text*: active first, then newest first."""
    pattern = contains_pattern(text)
    jobs = (
        db.query(JobEntry)
        .filter(JobEntry.user_id == user_id, JobEntry.status != STATUS_SEEN)
        .filter(or_(
            JobEntry.title.ilike(pattern, escape=LIKE_ESCAPE),
            JobEntry.company.ilike(pattern, escape=LIKE_ESCAPE),
        ))
        .order_by(JobEntry.is_archived, JobEntry.created_at.desc(), JobEntry.id)
        .limit(JOB_RESULTS)
        .all()
    )
    return [_job_hit(job) for job in jobs]


@router.get("/search")
@limiter.limit(SEARCH_RATE, key_func=user_or_ip_key)
def search(
    request: Request,
    filters: Annotated[SearchQuery, Query()],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Owner-scoped for every role: ``{jobs: [<= 8 hits], companies: [<= 5 {domain, name}]}``."""
    return {
        "jobs": _job_hits(db, current_user.id, filters.q),
        "companies": search_companies(db, current_user.id, filters.q),
    }
