"""Persist attached application documents as JobDocument rows; name and retire generated PDFs."""

from database.core import JobDocument

ATTACHED_KINDS = ["ATTACHED_CERT", "ATTACHED_REFERENCE"]
# The kind a generated document's PDF was stored under before CV and letter became HTML-only.
GENERATED_KIND = {"cv": "GENERATED_CV", "cover_letter": "GENERATED_LETTER"}
_PDF_NAME_PREFIX = {"cv": "Lebenslauf", "cover_letter": "Anschreiben"}
_NAME_FALLBACK = "Job"


def generated_pdf_name(kind: str, company: str | None) -> str:
    """The download name of a generated document, e.g. "Lebenslauf_ACME_GmbH.pdf"."""
    cleaned = "".join(c for c in (company or _NAME_FALLBACK) if c.isalnum() or c in " -_")
    return f"{_PDF_NAME_PREFIX[kind]}_{cleaned.replace(' ', '_') or _NAME_FALLBACK}.pdf"


def delete_generated_pdf(db, job_id: str, kind: str) -> None:
    """Remove the PDF an earlier generation stored for *kind* (no commit).

    A regenerated document exists only as HTML; the old PDF would otherwise still be listed as
    the document's proof.
    """
    db.query(JobDocument).filter(
        JobDocument.job_id == job_id, JobDocument.kind == GENERATED_KIND[kind]
    ).delete(synchronize_session=False)


def delete_attached_documents(db, job_id: str) -> None:
    """Remove the job's previously attached profile documents (no commit)."""
    db.query(JobDocument).filter(
        JobDocument.job_id == job_id, JobDocument.kind.in_(ATTACHED_KINDS)
    ).delete(synchronize_session=False)


def add_job_document(
    db,
    job_id: str,
    user_id: int,
    content: bytes,
    original_filename: str,
    mime_type: str,
    kind: str,
) -> JobDocument:
    """Add a JobDocument stored in the DB without replacing siblings and without committing, so
    callers can group several inserts into one transaction."""
    doc = JobDocument(
        job_id=job_id,
        user_id=user_id,
        filename=f"db://{original_filename}",
        original_filename=original_filename,
        file_size=len(content),
        mime_type=mime_type,
        content=content,
        kind=kind,
    )
    db.add(doc)
    return doc
