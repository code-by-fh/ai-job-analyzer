"""CRUD for DocumentTemplate — mirrors the notification-templates pattern."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import or_

from database.core import (
    SessionLocal,
    DocumentTemplate,
    DocumentTemplateCreate,
    DocumentTemplateUpdate,
    DocumentTemplateResponse,
    User,
)
from core.auth import get_current_user

router = APIRouter()


def _to_dict(t: DocumentTemplate) -> dict:
    return {
        "id": t.id,
        "doc_type": t.doc_type,
        "name": t.name,
        "is_admin": t.is_admin,
        "user_id": t.user_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
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
    from services.template_filler import validate_template

    if body.doc_type.upper() not in ("CV", "COVER_LETTER"):
        raise HTTPException(status_code=400, detail="doc_type must be CV or COVER_LETTER")

    try:
        sanitised_html = validate_template(body.html, body.doc_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    is_admin = body.is_admin and current_user.is_admin
    db = SessionLocal()
    try:
        t = DocumentTemplate(
            doc_type=body.doc_type.upper(),
            name=body.name,
            html=sanitised_html,
            is_admin=is_admin,
            user_id=None if is_admin else current_user.id,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return _to_dict(t)
    finally:
        db.close()


@router.put("/document-templates/{template_id}", response_model=DocumentTemplateResponse)
def update_document_template(
    template_id: int,
    body: DocumentTemplateUpdate,
    current_user: User = Depends(get_current_user),
):
    from services.template_filler import validate_template

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
            try:
                t.html = validate_template(body.html, t.doc_type)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
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
        db.commit()
        return {"ok": True}
    finally:
        db.close()
