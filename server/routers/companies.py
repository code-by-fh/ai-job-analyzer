from fastapi import APIRouter, HTTPException, Depends

from database.core import SessionLocal, User, CompanyProfile, CompanyAnalyzeRequest
from auth import get_current_user
from celery_config import celery_app

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
                "culture_summary": c.culture_summary,
                "review_score": c.review_score,
                "review_source": c.review_source,
                "salary_benchmark": c.salary_benchmark,
                "tech_stack": c.tech_stack,
                "key_artifacts": (c.raw_data.get("key_artifacts", []) if c.raw_data else []),
                "swot_analysis": (c.raw_data.get("swot_analysis") if c.raw_data else None),
                "comprehensive_report": (c.raw_data.get("comprehensive_report") if c.raw_data else None),
                "key_benefits": (c.raw_data.get("key_benefits", []) if c.raw_data else []),
                "red_flags": (c.raw_data.get("red_flags", []) if c.raw_data else []),
                "company_intelligence": (c.raw_data.get("company_intelligence") if c.raw_data else None),
                "executive_summary": (c.raw_data.get("executive_summary") if c.raw_data else None),
                "structured_analysis": (c.raw_data.get("structured_analysis") if c.raw_data else None),
                "key_insights": (c.raw_data.get("key_insights", []) if c.raw_data else []),
                "market_comparison": (c.raw_data.get("market_comparison") if c.raw_data else None),
                "deep_dive_buttons": (c.raw_data.get("deep_dive_buttons", []) if c.raw_data else []),
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
            "culture_summary": company.culture_summary,
            "review_score": company.review_score,
            "review_source": company.review_source,
            "salary_benchmark": company.salary_benchmark,
            "tech_stack": company.tech_stack,
            "key_artifacts": (
                company.raw_data.get("key_artifacts", []) if company.raw_data else []
            ),
            "swot_analysis": (
                company.raw_data.get("swot_analysis") if company.raw_data else None
            ),
            "comprehensive_report": (
                company.raw_data.get("comprehensive_report")
                if company.raw_data
                else None
            ),
            "key_benefits": (
                company.raw_data.get("key_benefits", []) if company.raw_data else []
            ),
            "red_flags": (
                company.raw_data.get("red_flags", []) if company.raw_data else []
            ),
            "company_intelligence": (
                company.raw_data.get("company_intelligence")
                if company.raw_data
                else None
            ),
            "executive_summary": (
                company.raw_data.get("executive_summary") if company.raw_data else None
            ),
            "structured_analysis": (
                company.raw_data.get("structured_analysis") if company.raw_data else None
            ),
            "key_insights": (
                company.raw_data.get("key_insights", []) if company.raw_data else []
            ),
            "market_comparison": (
                company.raw_data.get("market_comparison") if company.raw_data else None
            ),
            "deep_dive_buttons": (
                company.raw_data.get("deep_dive_buttons", []) if company.raw_data else []
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
