from typing import Literal

from fastapi import APIRouter, HTTPException, Depends, Request, status
from openai import APIError

from database.core import SessionLocal, User, CompanyProfile, CompanyAnalyzeRequest, DeepDiveRequest, iso_utc
from core.auth import get_current_user
from core.celery_config import celery_app
from core.logger import get_logger
from routers.deps import limiter, user_or_ip_key
from services.company_directory import company_summaries
from services.company_domain import CompanyDomain
from intelligence.service import generate_deep_dive, get_client_and_model

router = APIRouter()
logger = get_logger(__name__)

DEEP_DIVE_FAILED = "Deep dive failed"
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
        client, model = get_client_and_model("deep_dive", db)
        result = generate_deep_dive(
            domain=domain,
            company_name=body.company_name,
            focus=body.focus,
            how_to_proceed=body.how_to_proceed,
            model=model,
            client=client,
            language=body.language,
        )
        return {"result": result}
    except APIError:
        logger.error("Deep dive upstream AI error for %s", domain, exc_info=True)
        raise HTTPException(status_code=502, detail=DEEP_DIVE_FAILED)
    except Exception:
        logger.error("Deep dive failed for %s", domain, exc_info=True)
        raise HTTPException(status_code=500, detail=DEEP_DIVE_FAILED)
    finally:
        db.close()
