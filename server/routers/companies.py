from fastapi import APIRouter, HTTPException, Depends

from database.core import SessionLocal, User, CompanyProfile, CompanyAnalyzeRequest, DeepDiveRequest
from auth import get_current_user
from celery_config import celery_app
from intelligence.service import generate_deep_dive, get_model, get_api_key

router = APIRouter()


@router.get("/companies")
def list_companies(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        companies = db.query(CompanyProfile).order_by(CompanyProfile.name).all()
        return [
            {
                "id": c.id,
                "domain": c.domain,
                "name": c.name,
                "description": c.description,
                "executive_summary": (c.raw_data.get("executive_summary") if c.raw_data else None),
                "social_intelligence": (c.raw_data.get("social_intelligence") if c.raw_data else None),
                "structured_prep": (c.raw_data.get("structured_prep") if c.raw_data else None),
                "deep_dive_buttons": (c.raw_data.get("deep_dive_buttons", []) if c.raw_data else []),
                "deep_dive_analysis": (c.raw_data.get("deep_dive_analysis") if c.raw_data else None),
                "online_resources": (c.raw_data.get("online_resources", []) if c.raw_data else []),
                "analyzed_at": (c.analyzed_at.isoformat() if c.analyzed_at else None),
            }
            for c in companies
        ]
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
            "executive_summary": (
                company.raw_data.get("executive_summary") if company.raw_data else None
            ),
            "social_intelligence": (
                company.raw_data.get("social_intelligence") if company.raw_data else None
            ),
            "structured_prep": (
                company.raw_data.get("structured_prep") if company.raw_data else None
            ),
            "deep_dive_buttons": (
                company.raw_data.get("deep_dive_buttons", []) if company.raw_data else []
            ),
            "deep_dive_analysis": (
                company.raw_data.get("deep_dive_analysis") if company.raw_data else None
            ),
            "online_resources": (
                company.raw_data.get("online_resources", []) if company.raw_data else []
            ),
            "analyzed_at": (
                company.analyzed_at.isoformat() if company.analyzed_at else None
            ),
        }
    finally:
        db.close()


@router.post("/companies/{domain}/analyze")
def analyze_company(
    domain: str,
    request: CompanyAnalyzeRequest = CompanyAnalyzeRequest(),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if company and not request.force_refresh:
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
def deep_dive(
    domain: str,
    request: DeepDiveRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        model = get_model(db)
        api_key = get_api_key(db)
        result = generate_deep_dive(
            domain=domain,
            company_name=request.company_name,
            focus=request.focus,
            how_to_proceed=request.how_to_proceed,
            model=model,
            api_key=api_key,
            language=request.language,
        )
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
