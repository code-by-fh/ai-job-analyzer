"""Which document templates a user may select and render."""

import re
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database.core import DocumentTemplate

# DocumentTemplate.status while the AI fill runs; such a template cannot be selected yet.
TEMPLATE_STATUS_PROCESSING = "processing"

# Bounded so the value always fits the integer id column.
_TEMPLATE_ID = re.compile(r"[0-9]{1,9}")


def is_template_id(template_ref: Optional[str]) -> bool:
    """True for a DocumentTemplate id (1-9 ASCII digits); any other reference is a file template key."""
    return bool(template_ref) and _TEMPLATE_ID.fullmatch(template_ref) is not None


def looks_like_template_id(template_ref: Optional[str]) -> bool:
    """True for a purely numeric reference, valid id or not; such a value never passes as a file template key."""
    return bool(template_ref) and template_ref.isdigit()


@dataclass(frozen=True)
class TemplateRef:
    """A requested template: a DocumentTemplate id or a bundled file key (None: no selection), for one document type."""

    doc_type: str
    ref: Optional[str]


def find_usable_template(db: Session, user_id: int, wanted: TemplateRef) -> Optional[DocumentTemplate]:
    """Return the DocumentTemplate a numeric reference points to, if the user may use it.

    A user may use their own templates and the admin (global) ones. A
    non-numeric reference is a file template key (e.g. "classic") and never
    names a DocumentTemplate, so it yields None, as do unknown, foreign and
    wrong-type ids.
    """
    if not is_template_id(wanted.ref):
        return None
    return db.query(DocumentTemplate).filter(
        DocumentTemplate.id == int(wanted.ref),
        DocumentTemplate.doc_type == wanted.doc_type,
        or_(DocumentTemplate.is_admin == True, DocumentTemplate.user_id == user_id),  # noqa: E712 (SQL expression)
    ).first()
