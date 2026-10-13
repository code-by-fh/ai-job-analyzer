"""CRUD for DocumentTemplate — mirrors the notification-templates pattern."""

from typing import List, Literal, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from sqlalchemy import or_

from database.core import (
    SessionLocal,
    iso_utc,
    DocumentTemplate,
    DocumentTemplateCreate,
    DocumentTemplateUpdate,
    DocumentTemplateResponse,
    User,
    UserProfile,
)
from core.auth import get_current_user
from routers.deps import limiter
from services.template_access import TEMPLATE_STATUS_PROCESSING, TemplateRef, find_usable_template, looks_like_template_id
from services.template_filler import TemplateRejected
from services.template_preview import PreviewSource, file_template_exists, render_preview

router = APIRouter()

_HTML_FIELD_LOCATION = ("body", "html")
_VALIDATION_STATUS = 422
_SELECTION_FIELDS = ("cv_template", "cover_letter_template")
PREVIEW_RATE = "20/minute"  # each CV preview spawns a bounded render child (up to 15 s CPU)
MAX_TEMPLATE_REF_LENGTH = 64
TEMPLATE_REJECTED = "template_rejected"
TEMPLATE_NOT_FOUND = "Template not found"


def _validated_html(html: str, doc_type: str) -> str:
    """Sanitise and check *html*; a rejected template becomes a 422 shaped like Pydantic's."""
    from services.template_filler import validate_template

    try:
        return validate_template(html, doc_type)
    except TemplateRejected as rejected:
        detail = [{"type": "value_error", "loc": list(_HTML_FIELD_LOCATION), "msg": str(rejected)}]
        raise HTTPException(status_code=_VALIDATION_STATUS, detail=detail) from rejected


def _clear_selection(db, user_id: int, template_id: int) -> None:
    """A deleted default falls back to the bundled template instead of naming a missing id."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile is None:
        return
    for field in _SELECTION_FIELDS:
        if getattr(profile, field) == str(template_id):
            setattr(profile, field, None)


def _to_dict(t: DocumentTemplate) -> dict:
    return {
        "id": t.id,
        "doc_type": t.doc_type,
        "name": t.name,
        "is_admin": t.is_admin,
        "user_id": t.user_id,
        "status": t.status,
        "created_at": iso_utc(t.created_at),
        "updated_at": iso_utc(t.updated_at),
    }


@router.get("/document-templates", response_model=List[DocumentTemplateResponse])
def list_document_templates(
    doc_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        q = db.query(DocumentTemplate).filter(
            or_(
                DocumentTemplate.is_admin == True,
                DocumentTemplate.user_id == current_user.id,
            )
        )
        if doc_type:
            q = q.filter(DocumentTemplate.doc_type == doc_type.upper())
        rows = q.order_by(DocumentTemplate.is_admin.desc(), DocumentTemplate.name).all()
        return [_to_dict(r) for r in rows]
    finally:
        db.close()


def _preview_source(db, user_id: int, wanted: TemplateRef) -> PreviewSource:
    """Own or global templates by id, bundled ones by key; anything else is not found."""
    if looks_like_template_id(wanted.ref):
        template = find_usable_template(db, user_id, wanted)
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TEMPLATE_NOT_FOUND)
        return PreviewSource(wanted.doc_type, template_html=template.html)
    if not file_template_exists(wanted.doc_type, wanted.ref):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TEMPLATE_NOT_FOUND)
    return PreviewSource(wanted.doc_type, file_key=wanted.ref)


def _rendered(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str:
    """A refused template becomes a fixed code; the refusal's text never reaches the client."""
    try:
        return render_preview(user, profile, source)
    except TemplateRejected as rejected:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=TEMPLATE_REJECTED) from rejected


# Declared before the /document-templates/{template_id}/... routes; sync on purpose (the render child blocks).
@router.get("/document-templates/preview")
@limiter.limit(PREVIEW_RATE)
def preview_document_template(
    request: Request,
    doc_type: Literal["CV", "COVER_LETTER"],
    template: str = Query(min_length=1, max_length=MAX_TEMPLATE_REF_LENGTH),
    current_user: User = Depends(get_current_user),
):
    """Render a template with the caller's own profile as {"html": ...}; 404 unknown, 422 refused."""
    db = SessionLocal()
    try:
        source = _preview_source(db, current_user.id, TemplateRef(doc_type, template))
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        return {"html": _rendered(current_user, profile, source)}
    finally:
        db.close()


@router.get("/document-templates/{template_id}/html")
def get_document_template_html(
    template_id: int,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        t = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            or_(
                DocumentTemplate.is_admin == True,
                DocumentTemplate.user_id == current_user.id,
            ),
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"html": t.html}
    finally:
        db.close()


@router.post("/document-templates", response_model=DocumentTemplateResponse)
def create_document_template(
    body: DocumentTemplateCreate,
    current_user: User = Depends(get_current_user),
):
    doc_type = body.doc_type.upper()
    if doc_type not in ("CV", "COVER_LETTER"):
        raise HTTPException(status_code=400, detail="doc_type must be CV or COVER_LETTER")

    sanitised_html = _validated_html(body.html, doc_type)

    is_admin = body.is_admin and current_user.is_admin
    should_fill = doc_type == "CV" and not is_admin
    db = SessionLocal()
    try:
        t = DocumentTemplate(
            doc_type=doc_type,
            name=body.name,
            html=sanitised_html,
            is_admin=is_admin,
            user_id=None if is_admin else current_user.id,
            status=TEMPLATE_STATUS_PROCESSING if should_fill else None,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        if should_fill:
            from workers.tasks.fill_cv_template import fill_cv_template_task
            fill_cv_template_task.apply_async(args=[t.id, current_user.id], queue="ai_queue")
        return _to_dict(t)
    finally:
        db.close()


@router.put("/document-templates/{template_id}", response_model=DocumentTemplateResponse)
def update_document_template(
    template_id: int,
    body: DocumentTemplateUpdate,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        t = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == current_user.id,
            DocumentTemplate.is_admin == False,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found")
        if body.name is not None:
            t.name = body.name
        if body.html is not None:
            t.html = _validated_html(body.html, t.doc_type)
        db.commit()
        db.refresh(t)
        return _to_dict(t)
    finally:
        db.close()


@router.delete("/document-templates/{template_id}")
def delete_document_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        t = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == current_user.id,
            DocumentTemplate.is_admin == False,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Template not found or cannot be deleted")
        db.delete(t)
        _clear_selection(db, current_user.id, template_id)
        db.commit()
        return {"ok": True}
    finally:
        db.close()
