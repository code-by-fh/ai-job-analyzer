import os
from datetime import datetime
from io import BytesIO
from typing import Annotated, List, Optional

import markdown
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from xhtml2pdf import pisa

from database.core import (
    SessionLocal,
    iso_utc,
    User,
    JobEntry,
    JobStatusHistory,
    JobDocument,
    UserProfile,
    JobPatchRequest,
    MAX_DRAFT_LENGTH,
)
from core.auth import get_current_user
from core.celery_config import celery_app
from core.job_status import (
    ARCHIVE_BY_USER_VALUES,
    RESTORE_BY_USER_VALUES,
    STATUS_FAILED,
    STATUS_GENERATING,
    STATUS_OPEN,
    STATUS_SEEN,
    ArchiveReason,
    GenerationOutcome,
    StatusNotSettable,
    TransitionNotAllowed,
    archive_job,
    check_transition,
    finish_generation,
    restore_job,
    start_generation,
)
from routers.deps import limiter, UPLOAD_DIR, APPLICATION_STATUSES
from core.like_pattern import LIKE_ESCAPE, contains_pattern
from core.logger import get_logger
from core.uploads import (
    MAX_UPLOAD_BYTES, UNSUPPORTED_TYPE, content_disposition, read_upload, require_type,
)
from services.company_domain import CompanyDomain
from services.document_renderer import render_cover_letter_html
from services.user_data import delete_job_rows
from services.safe_fetch import xhtml2pdf_link_callback

logger = get_logger(__name__)

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
}
# Plain text has no magic bytes to check, so it is accepted by its declared type.
_UNSIGNED_TYPES = {"text/plain"}
MAX_FILE_SIZE = MAX_UPLOAD_BYTES


class BulkDeleteRequest(BaseModel):
    job_ids: List[str]


class GenerateRequest(BaseModel):
    improvement_notes: Optional[str] = Field(None, max_length=MAX_DRAFT_LENGTH)


class GeneratePackageRequest(BaseModel):
    include_profile_documents: bool = True
    generate_cv: bool = True
    generate_letter: bool = True


# Matches MAX_HTML_LENGTH in the web client.
MAX_DOCUMENT_HTML_LENGTH = 1_000_000


class SaveHtmlRequest(BaseModel):
    html: str = Field(max_length=MAX_DOCUMENT_HTML_LENGTH)


MAX_STATUS_NOTE_LENGTH = 2000
CLEARABLE_DATE_FIELDS = frozenset({"next_follow_up_at", "interview_at"})


class StatusChangeRequest(BaseModel):
    to: str
    note: Optional[str] = Field(None, max_length=MAX_STATUS_NOTE_LENGTH)


_JOB_DETAIL_COLUMNS = (
    "id", "title", "company", "company_domain", "description", "match_score",
    "reasoning", "application_draft", "cv_draft", "interview_prep_material",
    "status", "url", "is_favorite", "contact_persons", "recruiter_info",
    "salary_benchmark", "notes", "is_archived", "archive_reason", "platform_id",
    "generation_error", "checklist", "todos", "pre_generation_status",
)


def _derived_job_fields(job: JobEntry) -> dict:
    """ISO timestamps plus presence flags, so clients never need the large HTML bodies."""
    return {
        "created_at": iso_utc(job.created_at),
        "next_follow_up_at": iso_utc(job.next_follow_up_at),
        "interview_at": iso_utc(job.interview_at),
        "cv_html_present": bool(job.cv_html),
        "cover_letter_html_present": bool(job.cover_letter_html),
    }


def _job_detail(job: JobEntry) -> dict:
    detail = {column: getattr(job, column) for column in _JOB_DETAIL_COLUMNS}
    detail.update(_derived_job_fields(job))
    return detail


def _get_owned_job(db, job_id: str, user_id: int) -> JobEntry:
    job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == user_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


MAX_PAGE_SIZE = 100
MAX_SEARCH_LENGTH = 200
MAX_COMPANY_FILTER_LENGTH = 200
MAX_STATUSES_FILTER_LENGTH = 200

_JOB_LIST_COLUMNS = (
    "id", "title", "company", "company_domain", "match_score", "reasoning", "url",
    "status", "generation_error", "is_favorite", "is_archived", "archive_reason",
    "platform_id", "checklist", "pre_generation_status",
)


class JobListQuery(BaseModel):
    limit: int = Field(MAX_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    offset: int = Field(0, ge=0)
    filter_type: Optional[str] = None
    sort_by: Optional[str] = "date"
    has_application: Optional[bool] = None
    status_filter: Optional[str] = None
    statuses: Optional[str] = Field(None, max_length=MAX_STATUSES_FILTER_LENGTH)
    platform_id: Optional[int] = None
    is_archived: bool = False
    q: Optional[str] = Field(None, max_length=MAX_SEARCH_LENGTH)
    company: Optional[str] = Field(None, max_length=MAX_COMPANY_FILTER_LENGTH)
    company_domain: Optional[CompanyDomain] = None
    archive_reason: Optional[ArchiveReason] = None


def _job_list_item(job: JobEntry, status_changed_at: Optional[datetime] = None) -> dict:
    item = {column: getattr(job, column) for column in _JOB_LIST_COLUMNS}
    item.update(_derived_job_fields(job))
    # The prep text is large; the inbox "Anstehend" card only needs to know that it exists.
    item["interview_prep_present"] = bool(job.interview_prep_material)
    # A letter from POST /generate may exist only as text; the list needs presence, not the text.
    item["application_draft_present"] = bool(job.application_draft)
    item["status_changed_at"] = iso_utc(status_changed_at)
    return item


def _apply_legacy_filters(query, filters: JobListQuery):
    if filters.filter_type == "favorite":
        query = query.filter(JobEntry.is_favorite == True)
    elif filters.filter_type == "no_favorite":
        query = query.filter(JobEntry.is_favorite == False)
    elif filters.filter_type == "applications":
        query = query.filter(JobEntry.application_draft.isnot(None))
    if filters.has_application is True:
        query = query.filter(JobEntry.application_draft.isnot(None))
    elif filters.has_application is False:
        query = query.filter(JobEntry.application_draft.is_(None))
    if filters.status_filter:
        query = query.filter(JobEntry.status == filters.status_filter)
    if filters.platform_id:
        query = query.filter(JobEntry.platform_id == filters.platform_id)
    return query


def _parse_statuses(raw: Optional[str]) -> List[str]:
    return [status.strip() for status in (raw or "").split(",") if status.strip()]


def _apply_text_search(query, raw: Optional[str]):
    search = (raw or "").strip()
    if not search:
        return query
    pattern = contains_pattern(search)
    return query.filter(or_(
        JobEntry.title.ilike(pattern, escape=LIKE_ESCAPE),
        JobEntry.company.ilike(pattern, escape=LIKE_ESCAPE),
    ))


def _apply_search_filters(query, filters: JobListQuery):
    query = _apply_text_search(query, filters.q)
    if filters.company:
        query = query.filter(JobEntry.company == filters.company)
    if filters.company_domain:
        query = query.filter(JobEntry.company_domain == filters.company_domain)
    statuses = _parse_statuses(filters.statuses)
    if statuses:
        query = query.filter(JobEntry.status.in_(statuses))
    if filters.archive_reason:
        query = query.filter(JobEntry.archive_reason == filters.archive_reason.value)
    return query


def _apply_sort(query, sort_by: Optional[str]):
    # The id tiebreaker keeps offset pagination stable when many rows share a score or timestamp.
    if sort_by == "date":
        return query.order_by(JobEntry.created_at.desc(), JobEntry.id)
    return query.order_by(JobEntry.match_score.desc().nullslast(), JobEntry.id)


def _set_archived(job: JobEntry, archived: bool) -> None:
    # Archiving again is not a no-op: it turns a threshold archive into the user's own discard.
    if archived:
        archive_job(job, ArchiveReason.USER)
    elif job.is_archived:
        restore_job(job)


def _check_transition_or_raise(current: Optional[str], target: str) -> None:
    try:
        check_transition(current, target)
    except StatusNotSettable as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except TransitionNotAllowed as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def _apply_status_change(db, job: JobEntry, request: StatusChangeRequest) -> None:
    _check_transition_or_raise(job.status, request.to)
    # job was loaded with an owner filter, so job.user_id is the authenticated actor
    db.add(JobStatusHistory(
        job_id=job.id, from_status=job.status, to_status=request.to,
        changed_by=job.user_id, note=request.note,
    ))
    job.status = request.to
    if job.is_archived:
        restore_job(job)


@router.get("/jobs/counts")
def get_job_counts(current_user: User = Depends(get_current_user), is_archived: bool = False):
    db = SessionLocal()
    try:
        from sqlalchemy import func
        base_filters = [
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == is_archived,
            JobEntry.status != "SEEN",
        ]

        status_rows = db.query(JobEntry.status, func.count(JobEntry.id)).filter(
            *base_filters,
            JobEntry.status.isnot(None),
        ).group_by(JobEntry.status).all()
        status_counts = {status: count for status, count in status_rows}

        # Global totals for the ARCHIVE counter (regardless of view)
        archived_total = db.query(JobEntry.id).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == True
        ).count()
        status_counts["ARCHIVE"] = archived_total

        domain_rows = db.query(JobEntry.company, func.count(JobEntry.id)).filter(
            *base_filters,
            JobEntry.company.isnot(None),
            JobEntry.company != "",
        ).group_by(JobEntry.company).all()
        domains_sorted = sorted(
            [{"domain": company, "count": count} for company, count in domain_rows],
            key=lambda x: x["count"],
            reverse=True,
        )
        return {"status_counts": status_counts, "domain_counts": domains_sorted}
    finally:
        db.close()


@router.get("/jobs/domains")
def get_job_domains(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        from sqlalchemy import distinct

        rows = (
            db.query(distinct(JobEntry.company))
            .filter(JobEntry.user_id == current_user.id, JobEntry.company.isnot(None))
            .all()
        )
        domains = sorted(r[0] for r in rows if r[0])
        return domains
    finally:
        db.close()


def _status_changed_at(db, job_ids: List[str]) -> dict:
    """Latest status change per job in one query. Only user status changes write history (B1)."""
    if not job_ids:
        return {}
    rows = (
        db.query(JobStatusHistory.job_id, func.max(JobStatusHistory.changed_at))
        .filter(JobStatusHistory.job_id.in_(job_ids))
        .group_by(JobStatusHistory.job_id)
        .all()
    )
    return dict(rows)


@router.get("/jobs")
def get_jobs(
    filters: Annotated[JobListQuery, Query()],
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == filters.is_archived,
            JobEntry.status != "SEEN",
        )
        query = _apply_search_filters(_apply_legacy_filters(query, filters), filters)
        total = query.count()
        page = _apply_sort(query, filters.sort_by).offset(filters.offset).limit(filters.limit).all()
        changed = _status_changed_at(db, [job.id for job in page])
        return {"items": [_job_list_item(job, changed.get(job.id)) for job in page], "total": total}
    finally:
        db.close()


@router.get("/jobs/{job_id}")
def get_single_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        return _job_detail(_get_owned_job(db, job_id, current_user.id))
    finally:
        db.close()


@router.post("/jobs/{job_id}/analyze")
@limiter.limit("10/minute")
def trigger_job_analysis(request: Request, job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job_data = {
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "description": job.description or "",
            "url": job.url,
            "user_id": current_user.id,
            "platform_id": job.platform_id,
            "force_reanalyze": True,
        }
        celery_app.send_task("ai.analyze_job", args=[job_data], queue="ai_queue")
        return {"status": "started"}
    finally:
        db.close()


@router.post("/jobs/{job_id}/generate")
@limiter.limit("5/minute")
def trigger_generation(request: Request, job_id: str, body: Optional[GenerateRequest] = None, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        start_generation(job)
        db.commit()
        improvement_notes = body.improvement_notes if body else None
        celery_app.send_task(
            "ai.generate_application",
            args=[job_id, current_user.id, improvement_notes],
            queue="ai_queue"
        )
        return {"status": "started"}
    finally:
        db.close()


@router.post("/jobs/{job_id}/generate-package")
@limiter.limit("5/minute")
def trigger_package_generation(
    request: Request,
    job_id: str,
    body: Optional[GeneratePackageRequest] = None,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        start_generation(job)
        db.commit()
        include_docs = body.include_profile_documents if body else True
        gen_cv = body.generate_cv if body else True
        gen_letter = body.generate_letter if body else True
        celery_app.send_task(
            "ai.generate_application_package",
            args=[job_id, current_user.id, include_docs, gen_cv, gen_letter],
            queue="ai_queue",
        )
        return {"status": "started"}
    finally:
        db.close()


@router.post("/jobs/{job_id}/submit-application")
def submit_application(job_id: str, current_user: User = Depends(get_current_user)):
    # Out of scope: automated online submission. Hook only.
    raise HTTPException(
        status_code=501,
        detail="Online submission is not implemented (out of scope).",
    )


@router.get("/jobs/{job_id}/download")
def download_application_pdf(
    job_id: str, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job or not job.application_draft:
            raise HTTPException(status_code=404, detail="Job or application not found")

        html_content = markdown.markdown(job.application_draft)

        styled_html = f"""
        <html>
        <head>
        <meta charset="utf-8" />
        <style>
            @page {{
                size: A4;
                margin: 2cm;
            }}
            body {{
                font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.5;
                color: #333333;
            }}
            h1, h2, h3 {{
                color: #111111;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
            }}
            p {{
                margin-bottom: 1em;
            }}
        </style>
        </head>
        <body>
        {html_content}
        </body>
        </html>
        """

        pdf_buffer = BytesIO()
        try:
            pisa_status = pisa.CreatePDF(
                styled_html, dest=pdf_buffer, encoding="utf-8", link_callback=xhtml2pdf_link_callback
            )

            if pisa_status.err:
                logger.error(f"Pisa PDF Error: {pisa_status.err}")
                raise HTTPException(
                    status_code=500, detail=f"Error generating PDF: {pisa_status.err}"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Critical PDF Generation Error for job {job_id}: {e}")
            raise HTTPException(
                status_code=500, detail="Internal error during PDF generation"
            )

        pdf_bytes = pdf_buffer.getvalue()

        company_clean = "".join(
            c for c in (job.company or "Job") if c.isalnum() or c in " -_"
        ).replace(" ", "_")
        headers = {
            "Content-Disposition": f'attachment; filename="Bewerbung_{company_clean}.pdf"'
        }
        return Response(
            content=pdf_bytes, media_type="application/pdf", headers=headers
        )
    finally:
        db.close()


@router.post("/jobs/{job_id}/cancel-generation")
def cancel_generation(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status == STATUS_GENERATING:
            finish_generation(job, GenerationOutcome.CANCELLED)
            db.commit()
        return {"status": "cancelled"}
    finally:
        db.close()


def _delete_job_with_rows(db, job: JobEntry) -> None:
    """History and document rows reference the job (foreign keys), so they are removed first."""
    db.query(JobStatusHistory).filter(JobStatusHistory.job_id == job.id).delete(synchronize_session=False)
    db.query(JobDocument).filter(JobDocument.job_id == job.id).delete(synchronize_session=False)
    db.delete(job)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.is_archived:
            _delete_job_with_rows(db, job)
            db.commit()
            return {"status": "deleted"}

        archive_job(job, ArchiveReason.USER)
        db.commit()
        return {"status": "archived"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error archiving job: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


@router.post("/jobs/bulk-delete")
def delete_bulk_jobs(
    request: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        if not request.job_ids:
            return {"status": "success", "count": 0}

        # 1. Permanently delete those already archived
        perm_deleted = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.id.in_(request.job_ids),
            JobEntry.is_archived == True
        ).delete(synchronize_session=False)

        # 2. Archive the rest
        archived_count = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.id.in_(request.job_ids),
            JobEntry.is_archived == False
        ).update(dict(ARCHIVE_BY_USER_VALUES), synchronize_session=False)

        db.commit()
        return {"status": "success", "archived": archived_count, "permanently_deleted": perm_deleted}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in bulk delete: {e}")
        raise HTTPException(
            status_code=500, detail="Database error during bulk delete"
        )
    finally:
        db.close()


@router.post("/jobs/bulk-restore")
def restore_bulk_jobs(
    request: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        if not request.job_ids:
            return {"status": "success", "count": 0}

        restored_count = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.id.in_(request.job_ids),
            JobEntry.is_archived == True
        ).update(dict(RESTORE_BY_USER_VALUES), synchronize_session=False)

        db.commit()
        return {"status": "success", "restored": restored_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in bulk restore: {e}")
        raise HTTPException(
            status_code=500, detail="Database error during bulk restore"
        )
    finally:
        db.close()


@router.post("/jobs/{job_id}/status")
def change_job_status(
    job_id: str,
    request: StatusChangeRequest,
    current_user: User = Depends(get_current_user),
):
    """Move a job to another status through the transition table; always writes history."""
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.id)
        _apply_status_change(db, job, request)
        db.commit()
        db.refresh(job)
        return _job_detail(job)
    finally:
        db.close()


@router.patch("/jobs/{job_id}")
def patch_job(
    job_id: str,
    request: JobPatchRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if request.is_favorite is not None:
            job.is_favorite = request.is_favorite
        if request.company_domain is not None:
            job.company_domain = request.company_domain
        if request.contact_persons is not None:
            job.contact_persons = [contact.model_dump() for contact in request.contact_persons]
        if request.recruiter_info is not None:
            job.recruiter_info = request.recruiter_info.model_dump()
        if request.salary_benchmark is not None:
            job.salary_benchmark = request.salary_benchmark.model_dump()
        # Dates are clearable: an explicit null clears, an omitted field keeps the value.
        for date_field in CLEARABLE_DATE_FIELDS & request.model_fields_set:
            setattr(job, date_field, getattr(request, date_field))
        if request.notes is not None:
            job.notes = request.notes
        if request.application_draft is not None:
            job.application_draft = request.application_draft
        if request.cv_draft is not None:
            job.cv_draft = request.cv_draft
        if request.is_archived is not None:
            _set_archived(job, request.is_archived)
        if request.checklist is not None:
            job.checklist = request.checklist.model_dump()
        if request.todos is not None:
            job.todos = [todo.model_dump() for todo in request.todos]

        db.commit()
        db.refresh(job)
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error patching job: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


@router.get("/jobs/{job_id}/history")
def get_job_history(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        history = (
            db.query(JobStatusHistory)
            .filter(JobStatusHistory.job_id == job_id)
            .order_by(JobStatusHistory.changed_at.desc())
            .all()
        )
        return [
            {
                "id": h.id,
                "from_status": h.from_status,
                "to_status": h.to_status,
                "changed_at": iso_utc(h.changed_at),
                "note": h.note,
            }
            for h in history
        ]
    finally:
        db.close()


@router.patch("/jobs/{job_id}/favorite")
def toggle_favorite(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.is_favorite = not job.is_favorite
        db.commit()
        db.refresh(job)
        return {"status": "updated", "is_favorite": job.is_favorite}
    except Exception as e:
        db.rollback()
        logger.error(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


# "Keep applications" means everything the user moved past the inbox; OPEN is a match, not an application.
_ARCHIVE_ALL_KEPT_STATUSES = [name for name in APPLICATION_STATUSES if name != STATUS_OPEN] + [
    STATUS_GENERATING, STATUS_FAILED,
]


@router.delete("/jobs")
def delete_all_jobs(
    keep_favorites: bool = True,
    keep_applications: bool = True,
    company: Optional[str] = None,
    permanent: bool = False,
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_

    db = SessionLocal()
    try:
        # SEEN rows are dedup placeholders the crawler relies on, never a job the user saw. A legacy NULL
        # status counts as OPEN: compared directly, NULL would match neither the filter nor its negation.
        status_or_open = func.coalesce(JobEntry.status, STATUS_OPEN)
        query = db.query(JobEntry).filter(JobEntry.user_id == current_user.id, status_or_open != STATUS_SEEN)
        if company:
            query = query.filter(JobEntry.company == company)

        # Conditions for items to NOT be deleted/archived
        exclude_conditions = []
        if keep_favorites:
            exclude_conditions.append(JobEntry.is_favorite == True)
        if keep_applications:
            exclude_conditions.append(status_or_open.in_(_ARCHIVE_ALL_KEPT_STATUSES))

        if exclude_conditions:
            query = query.filter(~or_(*exclude_conditions))

        if permanent:
            # Only delete if they are already archived
            query = query.filter(JobEntry.is_archived == True)
            deleted_count = delete_job_rows(db, [job_id for (job_id,) in query.with_entities(JobEntry.id)])
            db.commit()
            return {"status": "deleted", "count": deleted_count}
        else:
            # Standard path: archive non-archived items
            query = query.filter(JobEntry.is_archived == False)
            archived_count = query.update(dict(ARCHIVE_BY_USER_VALUES), synchronize_session=False)
            db.commit()
            return {"status": "archived", "count": archived_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Archivieren der Jobs: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()


@router.post("/jobs/{job_id}/interview-prep")
async def generate_interview_prep_endpoint(
    job_id: str, current_user: User = Depends(get_current_user)
):
    """Triggert AI-Generierung von Interview-Vorbereitung als Background Task."""
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.interview_prep_material:
            return {
                "status": "exists",
                "message": "Interview prep already generated",
                "job_id": job_id,
            }

        celery_app.send_task(
            "worker.generate_interview_prep_task",
            args=[job_id, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "message": "Interview prep generation started",
            "job_id": job_id,
        }
    finally:
        db.close()


@router.post("/jobs/{job_id}/interview-prep/regenerate")
async def regenerate_interview_prep_endpoint(
    job_id: str, current_user: User = Depends(get_current_user)
):
    """Erzwingt Neugeneration."""
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        celery_app.send_task(
            "worker.generate_interview_prep_task",
            args=[job_id, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "message": "Interview prep regeneration started",
            "job_id": job_id,
        }
    finally:
        db.close()


async def _checked_job_upload(file: UploadFile) -> tuple[bytes, str]:
    """The bounded bytes and the declared type of an allowed upload; every refusal is a fixed code (no echo)."""
    mime = file.content_type or ""
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_TYPE)
    content = await read_upload(file, MAX_FILE_SIZE)
    if mime not in _UNSIGNED_TYPES:
        require_type(content, mime)
    return content, mime


@router.post("/jobs/{job_id}/documents")
async def upload_job_document(
    job_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        content, mime = await _checked_job_upload(file)

        from services.storage import get_storage_service
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        storage = get_storage_service(profile) if profile else None

        if storage:
            # Upload to Google Drive via Storage Service
            success = await storage.upload_file(content, file.filename or "unnamed_file", mime_type=mime)
            if not success:
                raise HTTPException(status_code=500, detail="Upload to Google Drive failed")
            stored_filename = f"gdrive://{file.filename}"
            db_content = None
        else:
            # Fallback: Save in local database
            stored_filename = f"db://{file.filename}"
            db_content = content

        # Save record to DB
        doc = JobDocument(
            job_id=job_id,
            user_id=current_user.id,
            filename=stored_filename,
            original_filename=file.filename or "unnamed_file",
            file_size=len(content),
            mime_type=mime,
            content=db_content
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "uploaded_at": iso_utc(doc.uploaded_at),
            "storage": "google_drive" if storage else "database"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Document upload failed: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Document upload failed")
    finally:
        db.close()


@router.get("/jobs/{job_id}/documents")
def list_job_documents(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        docs = (
            db.query(JobDocument)
            .filter(JobDocument.job_id == job_id)
            .order_by(JobDocument.uploaded_at.desc())
            .all()
        )
        return [
            {
                "id": d.id,
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "kind": d.kind,
                "uploaded_at": iso_utc(d.uploaded_at),
            }
            for d in docs
        ]
    finally:
        db.close()


@router.get("/jobs/{job_id}/documents/{doc_id}/download")
def download_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if doc.filename.startswith("db://"):
            data = doc.content
        elif doc.filename.startswith("gdrive://"):
            # Requires Google Drive API download logic
            raise HTTPException(status_code=400, detail="Download for Google Drive files is not yet implemented. Please view in Google Drive directly.")
        else:
            # Fallback for old local filesystem files
            from pathlib import Path as _Path
            base_dir = _Path(UPLOAD_DIR).resolve()
            file_path = (base_dir / str(current_user.id) / job_id / doc.filename).resolve()
            if not str(file_path).startswith(str(base_dir)):
                raise HTTPException(status_code=400, detail="Invalid file path")
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="File not found on disk")
            with open(file_path, "rb") as f:
                data = f.read()

        if data is None:
             raise HTTPException(status_code=404, detail="File content is empty")

        return Response(
            content=data,
            media_type=doc.mime_type or "application/octet-stream",
            headers={"Content-Disposition": content_disposition("attachment", doc.original_filename)},
        )
    finally:
        db.close()


@router.get("/jobs/{job_id}/documents/{doc_id}/view")
def view_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if doc.filename.startswith("db://"):
            data = doc.content
        elif doc.filename.startswith("gdrive://"):
            # Requires Google Drive API view logic
            raise HTTPException(status_code=400, detail="Viewing Google Drive files in app is not yet implemented.")
        else:
            # Fallback for old local filesystem files
            from pathlib import Path as _Path
            base_dir = _Path(UPLOAD_DIR).resolve()
            file_path = (base_dir / str(current_user.id) / job_id / doc.filename).resolve()
            if not str(file_path).startswith(str(base_dir)):
                raise HTTPException(status_code=400, detail="Invalid file path")
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="File not found on disk")
            with open(file_path, "rb") as f:
                data = f.read()

        if data is None:
             raise HTTPException(status_code=404, detail="File content is empty")

        return Response(
            content=data,
            media_type=doc.mime_type or "application/octet-stream",
            headers={"Content-Disposition": content_disposition("inline", doc.original_filename)},
        )
    finally:
        db.close()


@router.delete("/jobs/{job_id}/documents/{doc_id}")
def delete_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Cleanup files on disk if it was a legacy local file
        if not doc.filename.startswith("db://") and not doc.filename.startswith("gdrive://"):
            from pathlib import Path as _Path
            base_dir = _Path(UPLOAD_DIR).resolve()
            file_path = (base_dir / str(current_user.id) / job_id / doc.filename).resolve()
            if str(file_path).startswith(str(base_dir)) and os.path.exists(file_path):
                os.remove(file_path)

        db.delete(doc)
        db.commit()
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Document delete error: {e}")
        raise HTTPException(status_code=500, detail="Delete failed")
    finally:
        db.close()


@router.get("/jobs/{job_id}/documents/html")
def get_job_html(
    job_id: str,
    kind: str = "cv",
    current_user: User = Depends(get_current_user),
):
    if kind not in ("cv", "cover_letter"):
        raise HTTPException(status_code=400, detail="kind must be 'cv' or 'cover_letter'")
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(
            JobEntry.id == job_id,
            JobEntry.user_id == current_user.id,
        ).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if kind == "cv":
            html = job.cv_html or ""
        else:
            html = job.cover_letter_html or ""
            if not html and job.application_draft:
                html = render_cover_letter_html(letter_markdown=job.application_draft)
                job.cover_letter_html = html
                db.commit()
        return {"html": html}
    finally:
        db.close()


@router.put("/jobs/{job_id}/documents/html")
def save_job_html(
    job_id: str,
    body: SaveHtmlRequest,
    kind: str = "cv",
    current_user: User = Depends(get_current_user),
):
    if kind not in ("cv", "cover_letter"):
        raise HTTPException(status_code=400, detail="kind must be 'cv' or 'cover_letter'")
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(
            JobEntry.id == job_id,
            JobEntry.user_id == current_user.id,
        ).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if kind == "cv":
            job.cv_html = body.html
        else:
            job.cover_letter_html = body.html
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/jobs/{job_id}/documents/render")
def render_job_pdf(
    job_id: str,
    kind: str = "cv",
    current_user: User = Depends(get_current_user),
):
    if kind not in ("cv", "cover_letter"):
        raise HTTPException(status_code=400, detail="kind must be 'cv' or 'cover_letter'")
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(
            JobEntry.id == job_id,
            JobEntry.user_id == current_user.id,
        ).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        html = job.cv_html if kind == "cv" else job.cover_letter_html
        if not html:
            raise HTTPException(status_code=422, detail=f"No saved HTML for kind={kind}")
        celery_app.send_task(
            "ai.render_document_pdf",
            args=[job_id, kind, current_user.id],
            queue="ai_queue",
        )
        return {"queued": True}
    finally:
        db.close()
