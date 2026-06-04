"""Profile-wide document store (references / certificates) + template listing."""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from sqlalchemy.orm import Session

from database.core import ProfileDocument, UserProfile, User
from core.auth import get_current_user, get_db
from services.storage import get_storage_service
from services.document_renderer import list_templates
from core.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
VALID_TYPES = {"REFERENCE", "CERTIFICATE"}


def _serialize(d: ProfileDocument) -> dict:
    return {
        "id": d.id,
        "doc_type": d.doc_type,
        "label": d.label,
        "original_filename": d.original_filename,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


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
    label: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if doc_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"File type not allowed: {mime}")

    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        storage = get_storage_service(profile) if profile else None
        if storage:
            ok = await storage.upload_file(content, file.filename or "document", mime_type=mime)
            if not ok:
                raise HTTPException(status_code=500, detail="Upload to Google Drive failed")
            stored_filename, db_content = f"gdrive://{file.filename}", None
        else:
            stored_filename, db_content = f"db://{file.filename}", content

        doc = ProfileDocument(
            user_id=current_user.id,
            doc_type=doc_type,
            label=label or (file.filename or ""),
            filename=stored_filename,
            original_filename=file.filename or "document",
            file_size=len(content),
            mime_type=mime,
            content=db_content,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return _serialize(doc)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Profile document upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    if not doc.filename.startswith("db://") or doc.content is None:
        raise HTTPException(status_code=400, detail="File not available for direct download")
    return Response(
        content=doc.content,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'{disposition}; filename="{doc.original_filename}"'},
    )
