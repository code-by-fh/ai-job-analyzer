import hashlib
from typing import Literal

from fastapi import APIRouter, HTTPException, Depends, Request, status
from openai import APIError
from sqlalchemy.exc import IntegrityError

from database.core import (
    SessionLocal, User, CompanyProfile, CompanyAnalyzeRequest, CompanyDeepDive, DeepDiveRequest, as_utc, iso_utc,
)
from core.auth import get_current_user
from core.celery_config import celery_app
from core.deep_dive_state import DEEP_DIVE_ERROR, deep_dive_running, fail_deep_dive, finish_deep_dive, start_deep_dive
from core.logger import get_logger
from routers.deps import limiter, user_or_ip_key
from routers.sync_ai_runs import stale_before, sync_ai_slot
from services.company_directory import company_summaries
from services.company_domain import CompanyDomain
from intelligence.service import generate_deep_dive, get_client_and_model
from services.run_events import announce_end, publish_deep_dive_ended

router = APIRouter()
logger = get_logger(__name__)

DEEP_DIVE_FAILED = "Deep dive failed"
DEEP_DIVE_RUNNING = "deep_dive_running"
# A profile lists a handful of deep dives; older runs (of focus texts a refresh replaced) fall off the list.
MAX_LISTED_DEEP_DIVES = 50
ADMINS_ONLY = "Admins only"
# Each research start and each deep dive is a paid AI call.
COMPANY_RESEARCH_RATE = "10/minute"
SCOPE_OWN = "own"
SCOPE_ALL = "all"
CompanyScope = Literal["own", "all"]


@router.get("/companies")
def list_companies(
    scope: CompanyScope = SCOPE_OWN,
    current_user: User = Depends(get_current_user),
):
    """The user's companies (G6); with scope=all every profile of the installation, for admins only."""
    if scope == SCOPE_ALL and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ADMINS_ONLY)
    db = SessionLocal()
    try:
        return {"items": company_summaries(db, current_user.id, include_all=scope == SCOPE_ALL)}
    finally:
        db.close()


@router.get("/companies/{domain}")
def get_company_profile(domain: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if not company:
            raise HTTPException(status_code=404, detail="Company profile not found")
        return {
            "id": company.id,
            "domain": company.domain,
            "name": company.name,
            "description": company.description,
            "meta": (company.raw_data.get("meta") if company.raw_data else None),
            "executive_summary": (
                company.raw_data.get("executive_summary") if company.raw_data else None
            ),
            "analysis": (
                company.raw_data.get("analysis", []) if company.raw_data else []
            ),
            "key_insights": (
                company.raw_data.get("key_insights") if company.raw_data else None
            ),
            "risks": (
                company.raw_data.get("risks", []) if company.raw_data else []
            ),
            "market_comparison": (
                company.raw_data.get("market_comparison") if company.raw_data else None
            ),
            "deep_dive_buttons": (
                company.raw_data.get("deep_dive_buttons", []) if company.raw_data else []
            ),
            "online_resources": (
                company.raw_data.get("online_resources") if company.raw_data else None
            ),
            "analyzed_at": iso_utc(company.analyzed_at),
            "deep_dive_runs": _deep_dive_runs(db, current_user.id, domain),
        }
    finally:
        db.close()


@router.post("/companies/{domain}/analyze")
@limiter.limit(COMPANY_RESEARCH_RATE, key_func=user_or_ip_key)
def analyze_company(
    request: Request,
    domain: CompanyDomain,
    body: CompanyAnalyzeRequest = CompanyAnalyzeRequest(),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if company and not body.force_refresh:
            return {
                "status": "exists",
                "domain": domain,
                "message": "Profile already exists. Use force_refresh=true to regenerate.",
            }
        celery_app.send_task(
            "worker.generate_company_profile",
            args=[domain, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "domain": domain,
            "message": "Company profile analysis started",
        }
    finally:
        db.close()


def _deep_dive_runs(db, user_id: int, domain: str) -> list:
    """The user's deep dive runs of the company, newest first, so a reloaded page shows a running one and its result."""
    runs = (
        db.query(CompanyDeepDive)
        .filter(CompanyDeepDive.user_id == user_id, CompanyDeepDive.domain == domain)
        .order_by(CompanyDeepDive.id.desc())
        .limit(MAX_LISTED_DEEP_DIVES)
        .all()
    )
    return [
        {
            "focus": run.focus,
            "deep_dive_running": deep_dive_running(run),
            "deep_dive_started_at": iso_utc(run.started_at),
            "deep_dive_error": run.error,
            "deep_dive_result": run.result,
        }
        for run in runs
    ]


def _focus_hash(focus: str) -> str:
    return hashlib.sha256(focus.encode("utf-8")).hexdigest()


def _start_deep_dive_run(db, user_id: int, domain: str, focus: str) -> CompanyDeepDive:
    """Stamp and commit the start before the AI call; one run per user, company and focus at a time (409).

    A stamp older than the sweep's cutoff belongs to a run whose request died and is replaced.
    """
    focus_hash = _focus_hash(focus)
    run = db.query(CompanyDeepDive).filter_by(user_id=user_id, domain=domain, focus_hash=focus_hash).first()
    if run is None:
        run = CompanyDeepDive(user_id=user_id, domain=domain, focus=focus, focus_hash=focus_hash)
        db.add(run)
    elif deep_dive_running(run) and as_utc(run.started_at) >= stale_before():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DEEP_DIVE_RUNNING)
    start_deep_dive(run)
    try:
        db.commit()
    except IntegrityError:
        # A second start of the same deep dive inserted its row first.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DEEP_DIVE_RUNNING)
    return run


def _generate(db, domain: str, body: DeepDiveRequest) -> str:
    client, model = get_client_and_model("deep_dive", db)
    # Ends the read transaction, so no database connection is held during the AI call.
    db.commit()
    return generate_deep_dive(
        domain=domain,
        company_name=body.company_name,
        focus=body.focus,
        how_to_proceed=body.how_to_proceed,
        model=model,
        client=client,
        language=body.language,
    )


def _end_deep_dive(db, run: CompanyDeepDive) -> None:
    db.commit()
    announce_end(publish_deep_dive_ended, run.user_id, run.domain)


def _fail_deep_dive_run(db, run: CompanyDeepDive, http_status: int) -> HTTPException:
    """End the run with the fixed error; returns the answer the caller raises."""
    db.rollback()
    fail_deep_dive(run, DEEP_DIVE_ERROR)
    _end_deep_dive(db, run)
    return HTTPException(status_code=http_status, detail=DEEP_DIVE_FAILED)


@router.post("/companies/{domain}/deep-dive")
@limiter.limit(COMPANY_RESEARCH_RATE, key_func=user_or_ip_key)
def deep_dive(
    request: Request,
    domain: CompanyDomain,
    body: DeepDiveRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        with sync_ai_slot():
            return {"result": _run_deep_dive(db, current_user.id, domain, body)}
    finally:
        db.close()


def _run_deep_dive(db, user_id: int, domain: str, body: DeepDiveRequest) -> str:
    run = _start_deep_dive_run(db, user_id, domain, body.focus)
    try:
        result = _generate(db, domain, body)
    except APIError:
        logger.error("Deep dive upstream AI error for %s", domain, exc_info=True)
        raise _fail_deep_dive_run(db, run, status.HTTP_502_BAD_GATEWAY)
    except Exception:
        logger.error("Deep dive failed for %s", domain, exc_info=True)
        raise _fail_deep_dive_run(db, run, status.HTTP_500_INTERNAL_SERVER_ERROR)
    finish_deep_dive(run, result)
    _end_deep_dive(db, run)
    return result
