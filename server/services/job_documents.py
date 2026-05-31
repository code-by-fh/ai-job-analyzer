"""Persist generated/attached application documents as JobDocument rows."""

import asyncio

from database.core import JobDocument
from core.logger import get_logger

logger = get_logger(__name__)


def store_generated_document(
    db,
    job_id: str,
    user_id: int,
    content: bytes,
    original_filename: str,
    mime_type: str,
    kind: str,
    storage=None,
):
    """Create a JobDocument for `content`, replacing any existing doc of the same
    `kind` for this job. Uploads to external storage when `storage` is provided,
    otherwise stores the blob in the DB."""
    # Replace existing docs of this kind for the job.
    db.query(JobDocument).filter(
        JobDocument.job_id == job_id, JobDocument.kind == kind
    ).delete(synchronize_session=False)

    db_content = None
    if storage is not None:
        try:
            ok = asyncio.run(
                storage.upload_file(content, original_filename, mime_type=mime_type)
            )
            if not ok:
                logger.warning(f"External upload failed for {original_filename}; storing in DB")
                db_content = content
                stored_filename = f"db://{original_filename}"
            else:
                stored_filename = f"gdrive://{original_filename}"
        except Exception as e:
            logger.error(f"External upload error for {original_filename}: {e}")
            db_content = content
            stored_filename = f"db://{original_filename}"
    else:
        db_content = content
        stored_filename = f"db://{original_filename}"

    doc = JobDocument(
        job_id=job_id,
        user_id=user_id,
        filename=stored_filename,
        original_filename=original_filename,
        file_size=len(content),
        mime_type=mime_type,
        content=db_content,
        kind=kind,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
