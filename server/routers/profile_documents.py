"""Profile-wide document store (references / certificates) + template listing."""

from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response, status
from sqlalchemy.orm import Session

from database.core import ProfileDocument, User, iso_utc
from core.auth import get_current_user, get_db
from services.document_renderer import list_templates
from core.logger import get_logger
from core.uploads import (
    FALLBACK_FILENAME, MAX_UPLOAD_BYTES, UNSUPPORTED_TYPE, content_disposition, field_error, read_upload,
    require_type,
)

logger = get_logger(__name__)
router = APIRouter()

MAX_FILE_SIZE = MAX_UPLOAD_BYTES
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
VALID_TYPES = {"REFERENCE", "CERTIFICATE"}
MAX_LABEL_LENGTH = 200
MAX_FILENAME_LENGTH = 255
INVALID_DOC_TYPE = "invalid_doc_type"
DB_PREFIX = "db://"


@dataclass(frozen=True)
class _Upload:
    content: bytes
    name: str
    mime: str


def _serialize(d: ProfileDocument) -> dict:
    return {
        "id": d.id,
        "doc_type": d.doc_type,
        "label": d.label,
        "original_filename": d.original_filename,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "created_at": iso_utc(d.created_at),
        # Rows without stored bytes cannot be served (400 on view/download); the web disables their buttons.
        "downloadable": _is_downloadable(d),
    }


def _is_downloadable(doc: ProfileDocument) -> bool:
    return doc.content is not None


async def _checked_upload(file: UploadFile, doc_type: str) -> _Upload:
    """An allowed upload with its bytes, stored name and type; every refusal is a fixed code (no echo)."""
    if doc_type not in VALID_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail=[field_error("doc_type", INVALID_DOC_TYPE)])
    mime = file.content_type or ""
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_TYPE)
    content = await read_upload(file, MAX_FILE_SIZE)
    require_type(content, mime)
    return _Upload(content=content, name=_stored_name(file), mime=mime)


def _stored_name(file: UploadFile) -> str:
    return (file.filename or FALLBACK_FILENAME)[:MAX_FILENAME_LENGTH]


@router.get("/profile/templates")
def get_templates(current_user: User = Depends(get_current_user)):
    return list_templates()


@router.get("/profile/documents")
def list_profile_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    docs = (
        db.query(ProfileDocument)
        .filter(ProfileDocument.user_id == current_user.id)
        .order_by(ProfileDocument.created_at.desc())
        .all()
    )
    return [_serialize(d) for d in docs]


@router.post("/profile/documents")
async def upload_profile_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    label: str = Form("", max_length=MAX_LABEL_LENGTH),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    upload = await _checked_upload(file, doc_type)
    try:
        doc = ProfileDocument(
            user_id=current_user.id, doc_type=doc_type, label=label or upload.name,
            filename=f"{DB_PREFIX}{upload.name}", original_filename=upload.name, file_size=len(upload.content),
            mime_type=upload.mime, content=upload.content,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return _serialize(doc)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Profile document upload failed: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Document upload failed")


@router.delete("/profile/documents/{doc_id}")
def delete_profile_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = (
        db.query(ProfileDocument)
        .filter(ProfileDocument.id == doc_id, ProfileDocument.user_id == current_user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}


@router.get("/profile/documents/{doc_id}/download")
def download_profile_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return _serve(doc_id, current_user, db, disposition="attachment")


@router.get("/profile/documents/{doc_id}/view")
def view_profile_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return _serve(doc_id, current_user, db, disposition="inline")



def _serve(doc_id: int, current_user: User, db: Session, disposition: str):
    doc = (
        db.query(ProfileDocument)
        .filter(ProfileDocument.id == doc_id, ProfileDocument.user_id == current_user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _is_downloadable(doc):
        raise HTTPException(status_code=400, detail="File not available for direct download")
    return Response(
        content=doc.content,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": content_disposition(disposition, doc.original_filename)},
    )
