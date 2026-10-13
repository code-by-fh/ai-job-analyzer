"""What a template looks like with the user's own profile: the preview on Profil > Vorlagen.

The same renderers as the generation (workers/tasks/package.py), without any AI call: a user CV
template renders in the isolated Jinja2 sandbox, a user letter template through the slot filler,
a bundled template through the file renderer. Only HTML is produced, so no PDF renderer (and
none of its resource fetching) runs.
"""

import datetime
from dataclasses import dataclass
from typing import Optional

from core.logger import get_logger
from database.core import User, UserProfile
from services.document_renderer import list_templates, render_cover_letter_html, render_cv_html
from services.template_filler import (
    CV_DOC_TYPE,
    TEMPLATE_REJECTED_MESSAGE,
    TemplateRejected,
    check_jinja2_template,
    fill_template,
    render_jinja2_template,
)

logger = get_logger(__name__)

FILE_CATEGORY = {"CV": "cv", "COVER_LETTER": "cover_letter"}
DATE_FORMAT = "%d.%m.%Y"
DEFAULT_LANGUAGE = "de"
# Stand-ins for the per-job parts of a letter, in the profile's language.
SAMPLE_LETTER = {
    "de": {"company": "Beispiel GmbH", "body": "Hier steht dein Anschreiben, zugeschnitten auf die Stelle."},
    "en": {"company": "Example Ltd", "body": "Your cover letter for the position appears here."},
}


@dataclass(frozen=True)
class PreviewSource:
    """A resolved template: the stored HTML of a user/global template, or a bundled file key."""

    doc_type: str
    template_html: Optional[str] = None
    file_key: Optional[str] = None


def _text(profile: Optional[UserProfile], field: str) -> str:
    return (getattr(profile, field, None) or "") if profile else ""


def cv_context(user: User, profile: Optional[UserProfile]) -> dict:
    """The keys the generation's tailored CV data carries, filled from the stored profile."""
    cv = (profile.cv_data if profile else None) or {}
    return {
        "name": user.username,
        "role": _text(profile, "role"),
        "skills": _text(profile, "skills"),
        "location": _text(profile, "location"),
        "spoken_languages": (profile.spoken_languages if profile else None) or [],
        "summary": "",
        "experience": cv.get("experience") or [],
        "projects": cv.get("projects") or [],
        "education": cv.get("education") or "",
    }


def file_template_exists(doc_type: str, key: str) -> bool:
    """True only for a key in the bundled listing, so no other path reaches the file loader."""
    return key in list_templates().get(FILE_CATEGORY[doc_type], [])


def render_preview(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str:
    """Render *source* with the user's profile.

    Raises TemplateRejected when a user CV template fails the static check (it never runs then)
    or the sandbox refuses it, and when a user letter template's annotations cannot be filled.
    """
    if source.doc_type == CV_DOC_TYPE:
        context = cv_context(user, profile)
        if source.template_html is not None:
            check_jinja2_template(source.template_html)
            return render_jinja2_template(source.template_html, context)
        return render_cv_html(context, template_key=source.file_key)
    return _letter_preview(user, profile, source)


def _letter_preview(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str:
    sample = SAMPLE_LETTER.get(_text(profile, "language"), SAMPLE_LETTER[DEFAULT_LANGUAGE])
    if source.template_html is None:
        return render_cover_letter_html(letter_markdown=sample["body"], template_key=source.file_key,
                                        sender_name=user.username, company=sample["company"])
    return _filled_letter(source.template_html, {
        "sender_name": user.username, "company": sample["company"], "body": sample["body"],
        "location": _text(profile, "location"), "date": datetime.date.today().strftime(DATE_FORMAT),
        "role": _text(profile, "role"), "skills": _text(profile, "skills"),
    })


def _filled_letter(template_html: str, data: dict) -> str:
    try:
        return fill_template(template_html, data)
    except AttributeError as error:
        # A data-repeat on a scalar key (e.g. "body") iterates a string; log the type only, never the template.
        logger.warning("Cover letter template rejected while filling the preview (%s)", type(error).__name__)
        raise TemplateRejected(TEMPLATE_REJECTED_MESSAGE) from error
