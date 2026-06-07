import os
from datetime import datetime
from io import BytesIO
from typing import List, Optional

import markdown
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from pydantic import BaseModel
from xhtml2pdf import pisa

from database.core import (
    SessionLocal,
    User,
    JobEntry,
    JobStatusHistory,
    JobDocument,
    UserProfile,
    JobPatchRequest,
)
from core.auth import get_current_user
from core.celery_config import celery_app
from routers.deps import limiter, UPLOAD_DIR, APPLICATION_STATUSES
from core.logger import get_logger
from services.document_renderer import render_cover_letter_html

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
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class BulkDeleteRequest(BaseModel):
    job_ids: List[str]


class StatusUpdateRequest(BaseModel):
    status: str


class GenerateRequest(BaseModel):
    improvement_notes: Optional[str] = None


class GeneratePackageRequest(BaseModel):
    include_profile_documents: bool = True


class SaveHtmlRequest(BaseModel):
    html: str


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


@router.get("/jobs")
def get_jobs(
    current_user: User = Depends(get_current_user),
    limit: Optional[int] = None,
    offset: int = 0,
    filter_type: Optional[str] = None,
    sort_by: Optional[str] = "date",
    has_application: Optional[bool] = None,
    status_filter: Optional[str] = None,
    platform_id: Optional[int] = None,
    is_archived: bool = False,
):
    db = SessionLocal()
    try:
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == is_archived,
            JobEntry.status != "SEEN",
        )

        # Filtering
        if filter_type == "favorite":
            query = query.filter(JobEntry.is_favorite == True)
        elif filter_type == "no_favorite":
            query = query.filter(JobEntry.is_favorite == False)
        elif filter_type == "applications":
            query = query.filter(JobEntry.application_draft.isnot(None))

        if has_application is True:
            query = query.filter(JobEntry.application_draft.isnot(None))
        elif has_application is False:
            query = query.filter(JobEntry.application_draft.is_(None))

        if status_filter:
            query = query.filter(JobEntry.status == status_filter)

        if platform_id:
            query = query.filter(JobEntry.platform_id == platform_id)

        # Sorting
        if sort_by == "date":
            query = query.order_by(JobEntry.created_at.desc())
        else:
            query = query.order_by(JobEntry.match_score.desc())

        # Pagination (Backward Compatibility: if limit is None, return all)
        if limit is not None:
            query = query.offset(offset).limit(limit)
        else:
            query = query.limit(1000)

        return query.all()
    finally:
        db.close()


@router.get("/jobs/{job_id}")
def get_single_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "company_domain": job.company_domain,
            "description": job.description,
            "match_score": job.match_score,
            "reasoning": job.reasoning,
            "application_draft": job.application_draft,
            "cv_draft": job.cv_draft,
            "interview_prep_material": job.interview_prep_material,
            "status": job.status,
            "url": job.url,
            "is_favorite": job.is_favorite,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "next_follow_up_at": (
                job.next_follow_up_at.isoformat() if job.next_follow_up_at else None
            ),
            "contact_persons": job.contact_persons,
            "recruiter_info": job.recruiter_info,
            "salary_benchmark": job.salary_benchmark,
            "notes": job.notes,
        }
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
        job.status = "GENERATING"
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
        job.status = "GENERATING"
        db.commit()
        include_docs = body.include_profile_documents if body else True
        celery_app.send_task(
            "ai.generate_application_package",
            args=[job_id, current_user.id, include_docs],
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
                styled_html, dest=pdf_buffer, encoding="utf-8"
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
        if job.status == "GENERATING":
            job.status = "DRAFTED" if job.application_draft else "OPEN"
            db.commit()
        return {"status": "cancelled"}
    finally:
        db.close()


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
            db.delete(job)
            db.commit()
            return {"status": "deleted"}

        job.is_archived = True
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
        ).update({"is_archived": True}, synchronize_session=False)

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
        ).update({"is_archived": False}, synchronize_session=False)

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


@router.patch("/jobs/{job_id}/update-status")
def update_job_status(
    job_id: str,
    request: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    logger.info(
        f"Updating status for job {job_id} to {request.status} for user {current_user.username}"
    )
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            logger.warning(f"Job {job_id} not found for user {current_user.username}")
            raise HTTPException(status_code=404, detail="Job not found")
        job.status = request.status
        db.commit()
        db.refresh(job)
        logger.info(f"Status updated successfully for job {job_id}")
        return {"status": "updated", "new_status": job.status}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail="Database error")
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

        # Track status change for history
        if request.status is not None and request.status != job.status:
            history_entry = JobStatusHistory(
                job_id=job_id,
                from_status=job.status,
                to_status=request.status,
                changed_by=current_user.id,
                note=request.note,
            )
            db.add(history_entry)
            job.status = request.status

        if request.is_favorite is not None:
            job.is_favorite = request.is_favorite
        if request.company_domain is not None:
            job.company_domain = request.company_domain
        if request.contact_persons is not None:
            job.contact_persons = request.contact_persons
        if request.recruiter_info is not None:
            job.recruiter_info = request.recruiter_info
        if request.salary_benchmark is not None:
            job.salary_benchmark = request.salary_benchmark
        if request.next_follow_up_at is not None:
            job.next_follow_up_at = datetime.fromisoformat(request.next_follow_up_at)
        if request.notes is not None:
            job.notes = request.notes
        if request.application_draft is not None:
            job.application_draft = request.application_draft
        if request.cv_draft is not None:
            job.cv_draft = request.cv_draft
        if request.is_archived is not None:
            job.is_archived = request.is_archived

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
                "changed_at": h.changed_at.isoformat() if h.changed_at else None,
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
        query = db.query(JobEntry).filter(JobEntry.user_id == current_user.id)
        if company:
            query = query.filter(JobEntry.company == company)

        # Conditions for items to NOT be deleted/archived
        exclude_conditions = []
        if keep_favorites:
            exclude_conditions.append(JobEntry.is_favorite == True)
        if keep_applications:
            exclude_conditions.append(JobEntry.status.in_(APPLICATION_STATUSES))

        if exclude_conditions:
            query = query.filter(~or_(*exclude_conditions))

        if permanent:
            # Only delete if they are already archived
            query = query.filter(JobEntry.is_archived == True)
            deleted_count = query.delete(synchronize_session=False)
            db.commit()
            return {"status": "deleted", "count": deleted_count}
        else:
            # Standard path: archive non-archived items
            query = query.filter(JobEntry.is_archived == False)
            archived_count = query.update({"is_archived": True}, synchronize_session=False)
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

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

        mime = file.content_type or "application/octet-stream"
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415, detail=f"File type not allowed: {mime}"
            )

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
            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
            "storage": "google_drive" if storage else "database"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Document upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
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
            headers={
                "Content-Disposition": f'attachment; filename="{doc.original_filename}"'
            },
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
            headers={
                "Content-Disposition": f'inline; filename="{doc.original_filename}"'
            },
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
