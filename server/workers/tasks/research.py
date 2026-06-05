"""Celery tasks: interview preparation and company profile research."""

import os
import json

import redis
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile
from intelligence.service import get_model, get_api_key, format_cv_for_prompt

logger = get_logger(__name__)


@celery_app.task(name="worker.generate_interview_prep_task", bind=True, max_retries=2)
def generate_interview_prep_task(self, job_id: str, user_id: int):
    """Generiert Interview-Vorbereitung für einen Job via AI."""
    from intelligence.service import generate_interview_prep

    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found for interview prep")
            return

        user_profile = (
            db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        )
        cv_summary = ""
        user_language = "de"
        if user_profile:
            if user_profile.cv_data:
                cv_summary = format_cv_for_prompt(user_profile.cv_data)
            user_language = getattr(user_profile, "language", "de") or "de"

        model = get_model(db)
        api_key = get_api_key(db)

        prep_data = generate_interview_prep(
            job_title=job.title,
            company_name=job.company,
            job_description=job.description or "",
            cv_summary=cv_summary,
            model=model,
            api_key=api_key,
            language=user_language,
        )

        logger.debug(f"Interview prep data generated: {len(str(prep_data))} chars")

        job.interview_prep_material = json.dumps(prep_data, ensure_ascii=False)
        db.commit()

        # Notify via Redis pub/sub
        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        r.publish(
            "job_updates",
            json.dumps({"type": "interview_prep_ready", "job_id": job_id}),
        )

        logger.info(f"Interview prep generated for job {job_id}")
        return {"status": "success", "job_id": job_id}

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ):
        # store_ai_404_error already called inside intelligence_service
        logger.error(
            f"OpenRouter API error in generate_interview_prep_task for {job_id}, not retrying."
        )
        db.rollback()
        return {"status": "failed", "reason": "api_error"}
    except Exception as e:
        logger.error(f"Interview prep generation failed for {job_id}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


@celery_app.task(name="worker.generate_company_profile", bind=True, max_retries=2)
def generate_company_profile(self, domain: str, user_id: int):
    """Generiert ein vollständiges Firmenprofil via generate_company_profile_summary."""
    from intelligence.service import generate_company_profile_summary
    from database.core import CompanyProfile
    from datetime import datetime, timezone as tz

    db = SessionLocal()
    try:
        jobs = db.query(JobEntry).filter(JobEntry.company_domain == domain).limit(3).all()
        company_name = jobs[0].company or domain if jobs else domain
        job_title = jobs[0].title or "" if jobs else ""
        key_requirements = (jobs[0].description or "")[:3000] if jobs else ""

        model = get_model(db)
        api_key = get_api_key(db)
        user_profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        user_language = getattr(user_profile, "language", "de") if user_profile else "de"

        user_profile_str = ""
        if user_profile:
            parts = []
            if user_profile.role:
                parts.append(f"Aktuelle Rolle: {user_profile.role}")
            if user_profile.skills:
                parts.append(f"Skills: {user_profile.skills}")
            spoken = getattr(user_profile, "spoken_languages", None) or []
            if spoken:
                parts.append(f"Spoken Languages: {', '.join(spoken)}")
            if user_profile.cv_data:
                parts.append(format_cv_for_prompt(user_profile.cv_data))
            user_profile_str = "\n".join(parts)

        profile_data = generate_company_profile_summary(
            company_name=company_name,
            job_title=job_title,
            industry="",
            key_requirements=key_requirements,
            user_profile=user_profile_str,
            model=model,
            api_key=api_key,
        )

        company = db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        if not company:
            company = CompanyProfile(domain=domain)
            db.add(company)

        company.name = company_name
        company.description = profile_data.get("executive_summary", "")[:500] if isinstance(profile_data.get("executive_summary"), str) else ""
        company.culture_summary = ""
        company.tech_stack = []
        company.raw_data = profile_data
        company.analyzed_at = datetime.now(tz.utc)
        db.commit()

        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        redis.from_url(redis_url).publish(
            "job_updates",
            json.dumps({"type": "company_profile_ready", "domain": domain}),
        )

        logger.info(f"Company profile generated for {domain}")
        return profile_data

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ):
        logger.error(f"OpenRouter API error in generate_company_profile for {domain}, not retrying.")
        db.rollback()
        return {"status": "failed", "reason": "api_error"}
    except Exception as e:
        logger.error(f"Company profile generation failed for {domain}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()
