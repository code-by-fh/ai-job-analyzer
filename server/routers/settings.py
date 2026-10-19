import io
import math
import zoneinfo
from types import SimpleNamespace
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from openai import OpenAIError
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pypdf import PdfReader
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from core.cv_import_state import CV_PARSE_FAILED, claim_import, fail_import, finish_import, import_running
from core.job_status import (
    ARCHIVE_BY_THRESHOLD_VALUES,
    RESTORE_BY_THRESHOLD_VALUES,
    STATUS_OPEN,
    STATUS_SEEN,
    ArchiveReason,
)
from core.profile_rules import profile_complete
from core.uploads import MAX_UPLOAD_BYTES, PDF_TYPE, field_error, read_upload_sync, require_type
from database.core import (
    MAX_LOCATION_LENGTH,
    MAX_ROLE_LENGTH,
    MAX_SALARY_LENGTH,
    MAX_SKILLS_LENGTH,
    CVDataModel,
    JobEntry,
    JobPlatform,
    NotificationPreviewRequest,
    NotificationTemplate,
    NotificationTemplateCreate,
    NotificationTemplateResponse,
    NotificationTemplateUpdate,
    SettingsData,
    User,
    UserProfile,
    iso_utc,
)
from intelligence.service import SETUP_AI_TASK, _call_openrouter, extract_json, get_client_and_model, is_ai_configured
from core.logger import get_logger
from services.template_access import TEMPLATE_STATUS_PROCESSING, TemplateRef, find_usable_template, looks_like_template_id
from routers.deps import (
    _SECRET_FIELDS,
    _SECRET_MASK,
    _mask_profile,
    _template_to_dict,
    limiter,
    user_or_ip_key,
)
from routers.notifications import http_error
from routers.sync_ai_runs import stale_before, sync_ai_slot
from services import notifications_client
from services.match_notifications import USER_NAME_MAX_LENGTH, job_item
from services.notification_channels import LEGACY_CREDENTIAL_FIELDS
from services.notifications_client import NotifyError
from services.run_events import announce_end, publish_cv_import_ended

logger = get_logger(__name__)

router = APIRouter()


CV_PARSE_SYSTEM_PROMPT = """
    Du bist ein Daten-Extraktions-Assistent.
    Deine Aufgabe: Extrahiere strukturierte Daten aus einem Lebenslauf-Text.

    Antworte AUSSCHLIESSLICH mit validem JSON. Keine Markdown-Formatierung (kein ```json).

    Das Ziel-Format ist:
    {
      "role": "Aktuelle oder angestrebte Rolle (z.B. Senior Python Dev)",
      "skills": "Liste von Skills, kommagetrennt (z.B. Python, Docker, AWS)",
      "min_salary": "Geschätztes Wunschgehalt als Zahl-String (z.B. 70000), falls im Text, sonst leer lassen",
      "location": "Wohnort oder Wunschort, falls im Text, sonst leer lassen",
      "cv_data": {
        "education": "Zusammenfassung der Ausbildung",
        "experience": [
          { "company": "Firmenname", "role": "Titel", "duration": "Zeitraum", "description": "Kurze Beschreibung" }
        ],
        "projects": [
           { "name": "Projektname", "tech_stack": "Genutzte Technologien", "description": "Beschreibung" }
        ]
      }
    }

    "skills" ist ein einzelner String, keine Liste.
    "tech_stack" ist ein einzelner String, keine Liste.
    "education" ist ein einzelner String, keine Liste.
    """

MAX_CV_BYTES = MAX_UPLOAD_BYTES
CV_MAX_PAGES = 10
CV_MAX_TEXT_CHARS = 30_000
# Reasoning models spend output tokens on thinking before the answer, and the JSON of a 30k-character CV
# alone can need about 8k tokens: a lower cap cuts real CVs into a 502.
CV_PARSE_MAX_TOKENS = 16_000
_FINISHED_BY_TOKEN_CAP = "length"
MIN_CV_TEXT_CHARS = 50
CV_NO_TEXT = "cv_no_text"
CV_IMPORT_RUNNING = "cv_import_running"
# The fields a CV may fill; empty answers keep the stored value (the import must not blank a goal).
_IMPORTED_TEXT_FIELDS = ("role", "skills", "min_salary", "location")
# The only lists the answer may hold, each with the field a plain-text entry fills; a list or an object anywhere
# else is turned into text.
_ENTRY_TEXT_FIELD = {"experience": "description", "projects": "name"}
_CONTAINERS = ("cv_data",)


class ParsedCv(BaseModel):
    """The AI's answer, validated like a profile save; a missing field becomes empty."""

    # Models answer a salary as a number; it is stored as text like every profile field.
    model_config = ConfigDict(coerce_numbers_to_str=True)

    role: str = Field("", max_length=MAX_ROLE_LENGTH)
    skills: str = Field("", max_length=MAX_SKILLS_LENGTH)
    min_salary: str = Field("", max_length=MAX_SALARY_LENGTH)
    location: str = Field("", max_length=MAX_LOCATION_LENGTH)
    cv_data: CVDataModel = Field(default_factory=CVDataModel)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Text of the first pages, bounded: a long PDF must not become an unbounded AI prompt."""
    try:
        pages = PdfReader(io.BytesIO(file_bytes)).pages[:CV_MAX_PAGES]
        text = "\n".join(page.extract_text() or "" for page in pages)
    except Exception as e:  # pypdf raises many types for broken files; a broken file reads as no text
        logger.error(f"PDF Read Error: {e}")
        return ""
    return text[:CV_MAX_TEXT_CHARS]


def _cv_parse_messages(cv_text: str) -> list:
    return [
        {"role": "system", "content": CV_PARSE_SYSTEM_PROMPT},
        {"role": "user", "content": f"Hier ist der Lebenslauf:\n\n{cv_text}"},
    ]


def _normalised(value):
    """The answer without null values, so a field the AI left null gets its empty default, and with lists and
    objects where text belongs turned into text: models often answer skills, durations or education that way."""
    if isinstance(value, dict):
        return {key: _normalised_field(key, item) for key, item in value.items() if item is not None}
    return value


def _normalised_field(key: str, value):
    if key in _ENTRY_TEXT_FIELD and isinstance(value, list):
        return _normalised_entries(_ENTRY_TEXT_FIELD[key], value)
    if key in _CONTAINERS or not isinstance(value, (list, dict)):
        return _normalised(value)
    return _text(value)


def _normalised_entries(text_field: str, entries: list) -> list:
    """Each entry as an object; an entry answered as plain text fills `text_field`."""
    return [
        _normalised(entry) if isinstance(entry, dict) else {text_field: _text(entry)}
        for entry in entries if entry is not None
    ]


def _text(value) -> str:
    """Any answer value as text: object values and scalar lists join with commas, a list of objects one line
    per object; nested containers are flattened, so no Python syntax reaches the stored text."""
    if isinstance(value, dict):
        return ", ".join(_text(item) for item in value.values() if item is not None)
    if isinstance(value, list):
        present = [item for item in value if item is not None]
        separator = "\n" if any(isinstance(item, dict) for item in present) else ", "
        return separator.join(_text(item) for item in present)
    return str(value)


def _answer_text(response) -> str:
    """The first choice's text; an answer without choices is a parse failure, not a crash."""
    choices = getattr(response, "choices", None)
    if not choices:
        raise ValueError("AI answer without choices")
    if getattr(choices[0], "finish_reason", None) == _FINISHED_BY_TOKEN_CAP:
        logger.warning("CV parse answer was cut by the token cap")
    return choices[0].message.content or ""


def _log_parse_failure(error: Exception) -> None:
    """Names the failure only: the messages of these errors can quote the CV."""
    if isinstance(error, ValidationError):
        locations = [item["loc"] for item in error.errors(include_input=False)]
        logger.error(f"CV parse answer refused: {error.error_count()} errors at {locations}")
    else:
        logger.error(f"CV parse failed: {type(error).__name__}")


def parse_cv_with_ai(cv_text: str, client, model: str) -> Optional[ParsedCv]:
    """The CV as a validated ParsedCv, or None when the AI fails or answers in the wrong shape.

    Goes through the app's AI wrapper, so provider errors reach the AI status banner like every other call.
    """
    try:
        response = _call_openrouter(
            client=client, model=model, messages=_cv_parse_messages(cv_text),
            temperature=0.0, max_tokens=CV_PARSE_MAX_TOKENS, func_name="parse_cv_with_ai",
        )
        return ParsedCv.model_validate(_normalised(extract_json(_answer_text(response))))
    except (OpenAIError, ValueError) as e:  # JSON and shape errors are ValueErrors; all are one fixed answer
        _log_parse_failure(e)
        return None


def _profile_for(db: Session, user_id: int) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    return profile


def _has_text(entry: BaseModel) -> bool:
    return any(value.strip() for value in entry.model_dump().values())


def _cv_content(cv: CVDataModel) -> Optional[dict]:
    """The CV without all-blank entries, or None when nothing is left: a PDF that is not a CV must not wipe it."""
    experience = [item for item in cv.experience if _has_text(item)]
    projects = [item for item in cv.projects if _has_text(item)]
    if not (experience or projects or cv.education.strip()):
        return None
    return CVDataModel(experience=experience, projects=projects, education=cv.education).model_dump()


def _store_parsed_cv(db: Session, user_id: int, parsed: ParsedCv) -> dict:
    """Non-empty values replace stored ones; CV data with content replaces the stored CV as a whole.
    Returns the stored values."""
    profile = _profile_for(db, user_id)
    for field in _IMPORTED_TEXT_FIELDS:
        value = getattr(parsed, field).strip()
        if value:
            setattr(profile, field, value)
    cv_data = _cv_content(parsed.cv_data)
    if cv_data is not None:
        profile.cv_data = cv_data
    db.commit()
    stored = {field: getattr(profile, field) for field in _IMPORTED_TEXT_FIELDS}
    return {**stored, "cv_data": profile.cv_data}


class LanguagePreferenceData(BaseModel):
    language: str = "de"


MIN_MATCH_THRESHOLD = 0
MAX_MATCH_THRESHOLD = 100


class MatchThresholdData(BaseModel):
    match_threshold: int = Field(ge=MIN_MATCH_THRESHOLD, le=MAX_MATCH_THRESHOLD)
    apply_to_existing: bool = False


def _jobs_to_archive(db: Session, user_id: int, threshold: int):
    """Active inbox jobs a threshold would hide; favourites and jobs the user kept are never touched."""
    return db.query(JobEntry).filter(
        JobEntry.user_id == user_id,
        JobEntry.is_archived == False,
        JobEntry.status == STATUS_OPEN,
        JobEntry.is_favorite.isnot(True),
        JobEntry.kept_by_user == False,
        JobEntry.match_score < threshold,
    )


def _jobs_to_restore(db: Session, user_id: int, threshold: int):
    """Jobs an earlier threshold hid that now score at or above the new one."""
    return db.query(JobEntry).filter(
        JobEntry.user_id == user_id,
        JobEntry.is_archived == True,
        JobEntry.archive_reason == ArchiveReason.THRESHOLD.value,
        JobEntry.match_score >= threshold,
    )


def _apply_threshold(db: Session, user_id: int, threshold: int) -> dict:
    archived = _jobs_to_archive(db, user_id, threshold).update(
        dict(ARCHIVE_BY_THRESHOLD_VALUES), synchronize_session=False
    )
    restored = _jobs_to_restore(db, user_id, threshold).update(
        dict(RESTORE_BY_THRESHOLD_VALUES), synchronize_session=False
    )
    return {"archived": archived, "restored": restored}


SCORE_BUCKETS = MAX_MATCH_THRESHOLD + 1
HALF = 0.5


def _score_bucket(score: float) -> int:
    # Half up like Math.round in the web client, so a tick sits where the list shows the score.
    return min(MAX_MATCH_THRESHOLD, max(MIN_MATCH_THRESHOLD, math.floor(score + HALF)))


def _threshold_population(db: Session, user_id: int):
    """The jobs a threshold sorts: active matches plus the ones it hid."""
    return db.query(JobEntry.match_score).filter(
        JobEntry.user_id == user_id,
        JobEntry.status == STATUS_OPEN,
        JobEntry.match_score.isnot(None),
        or_(JobEntry.is_archived == False, JobEntry.archive_reason == ArchiveReason.THRESHOLD.value),
    )


def _owns_any(db: Session, column, *conditions) -> bool:
    return db.query(column).filter(*conditions).first() is not None


def _apply_partial_update(profile: UserProfile, update: BaseModel) -> None:
    """Copy only the fields present in the request body onto the profile.

    Omitted fields keep their stored value, so the profile form and the
    notification form can save independently. A secret sent back as the mask
    sentinel also keeps its stored value.
    """
    for field in update.model_fields_set:
        value = getattr(update, field)
        if field in _SECRET_FIELDS and value == _SECRET_MASK:
            continue
        setattr(profile, field, value.model_dump() if isinstance(value, BaseModel) else value)


_TEMPLATE_FIELD_DOC_TYPES = {"cv_template": "CV", "cover_letter_template": "COVER_LETTER"}
TEMPLATE_PROCESSING = "template_processing"


def _check_template_selection(db: Session, user_id: int, selection: dict) -> None:
    """Reject a template id the user may not use, or one the AI is still filling.

    File template keys such as "classic" pass unchanged. A purely numeric value that is not a
    usable id (unknown, foreign, wrong type, out of range or non-ASCII digits) is rejected.
    """
    for field, doc_type in _TEMPLATE_FIELD_DOC_TYPES.items():
        template_ref = selection.get(field)
        if not looks_like_template_id(template_ref):
            continue
        template = find_usable_template(db, user_id, TemplateRef(doc_type, template_ref))
        if template is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"{field}: template not found")
        if template.status == TEMPLATE_STATUS_PROCESSING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TEMPLATE_PROCESSING)


@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )
    if not profile:
        profile = UserProfile(
            user_id=current_user.id,
            role="",
            skills="",
            min_salary="",
            location="",
            preferences="",
            cv_data={"experience": [], "projects": [], "education": ""},
            job_urls=[],
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return {**_without_legacy_credentials(_mask_profile(profile)), **_cv_import_view(profile)}


def _cv_import_view(profile: UserProfile) -> dict:
    """The durable import state, so a reloaded profile page shows a running import and how it ended."""
    return {
        "cv_import_running": import_running(profile),
        "cv_import_started_at": iso_utc(profile.cv_import_started_at),
        "cv_import_error": profile.cv_import_error,
    }


def _without_legacy_credentials(view: dict) -> dict:
    """The old credential columns are only read by the start-up migration; channels live in the service."""
    return {key: value for key, value in view.items() if key not in LEGACY_CREDENTIAL_FIELDS}


@router.post("/settings")
def save_settings(
    settings: SettingsData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_template_selection(db, current_user.id, settings.model_dump(include=settings.model_fields_set))
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    _apply_partial_update(profile, settings)
    db.commit()
    return {"status": "saved"}


class TemplateSelectionData(BaseModel):
    cv_template: Optional[str] = None
    cover_letter_template: Optional[str] = None


@router.patch("/settings/template")
def save_template_selection(
    body: TemplateSelectionData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_template_selection(db, current_user.id, body.model_dump(exclude_none=True))
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    if body.cv_template is not None:
        profile.cv_template = body.cv_template
    if body.cover_letter_template is not None:
        profile.cover_letter_template = body.cover_letter_template
    db.commit()
    return {"status": "saved"}


def _clear_goal_and_cv(profile: UserProfile) -> None:
    for field in ("role", "skills", "min_salary", "location", "preferences"):
        setattr(profile, field, "")
    profile.cv_data = {"experience": [], "projects": [], "education": ""}
    profile.job_urls = []
    profile.spoken_languages = []


@router.delete("/settings")
def delete_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if profile:
            # Clears goal and CV (empty, not demo values) so the onboarding asks again;
            # notification adapter config is preserved.
            _clear_goal_and_cv(profile)
            db.commit()
            return {"status": "deleted"}
        else:
            raise HTTPException(status_code=404, detail="Profil nicht gefunden")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Löschen der Einstellungen: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")


def _start_cv_import(db: Session, user_id: int) -> UserProfile:
    """Claim and commit the start before the AI call, so a reloaded page sees the import running."""
    profile = _profile_for(db, user_id)
    db.flush()
    if not claim_import(db, profile.id, stale_before()):
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CV_IMPORT_RUNNING)
    db.commit()
    return profile


def _parse_and_store(db: Session, profile: UserProfile, text: str) -> Optional[dict]:
    """The stored values, or None when the AI gave no usable answer."""
    client, model = get_client_and_model(SETUP_AI_TASK, db)
    # Ends the read transaction, so no database connection is held during the minutes-long AI call.
    db.commit()
    parsed = parse_cv_with_ai(text, client, model)
    if parsed is None:
        return None
    finish_import(profile)
    return _store_parsed_cv(db, profile.user_id, parsed)


def _end_failed_cv_import(db: Session, profile: UserProfile) -> None:
    db.rollback()
    fail_import(profile, CV_PARSE_FAILED)
    db.commit()
    announce_end(publish_cv_import_ended, profile.user_id)


def _run_cv_import(db: Session, profile: UserProfile, text: str) -> dict:
    """Every failure ends the run with the one fixed parse error before it propagates."""
    try:
        stored = _parse_and_store(db, profile, text)
    except Exception:
        _end_failed_cv_import(db, profile)
        raise
    if stored is None:
        _end_failed_cv_import(db, profile)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=CV_PARSE_FAILED)
    announce_end(publish_cv_import_ended, profile.user_id)
    return stored


@router.post("/settings/upload-cv")
@limiter.limit("10/minute")
def upload_cv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Sync on purpose: the AI call blocks, so FastAPI must run it in the threadpool, not on the event loop.
    # A reload does not end it: the thread finishes and stores, and the end event tells the reloaded page.
    content = read_upload_sync(file, MAX_CV_BYTES)
    require_type(content, PDF_TYPE)
    text = extract_text_from_pdf(content)
    if len(text.strip()) < MIN_CV_TEXT_CHARS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=[field_error("file", CV_NO_TEXT)])
    with sync_ai_slot():
        profile = _start_cv_import(db, current_user.id)
        return {"status": "success", "data": _run_cv_import(db, profile, text)}


@router.post("/language-preference")
def save_language_preference(
    data: LanguagePreferenceData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    lang = data.language if data.language in ('en', 'de') else 'de'
    profile.language = lang
    db.commit()
    return {"status": "saved", "language": lang}


@router.get("/matching-preference/preview")
def preview_matching_threshold(
    threshold: int = Query(ge=MIN_MATCH_THRESHOLD, le=MAX_MATCH_THRESHOLD),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Count the jobs a threshold would move into and out of 'below threshold', changing nothing."""
    return {
        "threshold": threshold,
        "would_archive": _jobs_to_archive(db, current_user.id, threshold).count(),
        "would_restore": _jobs_to_restore(db, current_user.id, threshold).count(),
    }


@router.get("/matching-preference/distribution")
def threshold_distribution(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Jobs per whole score 0..100, for the tick strip under the inbox threshold slider."""
    counts = [0] * SCORE_BUCKETS
    for (score,) in _threshold_population(db, current_user.id):
        counts[_score_bucket(score)] += 1
    return {"counts": counts}


@router.post("/matching-preference")
def save_matching_preference(
    data: MatchThresholdData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.match_threshold = data.match_threshold
    moved = (
        _apply_threshold(db, current_user.id, data.match_threshold)
        if data.apply_to_existing
        else {"archived": 0, "restored": 0}
    )
    db.commit()
    return {"status": "saved", "match_threshold": data.match_threshold, **moved}


@router.post("/timezone-preference")
def save_timezone_preference(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tz = data.get("timezone", "Europe/Berlin")
    # Validate timezone
    try:
        zoneinfo.ZoneInfo(tz)
    except Exception:
        tz = "Europe/Berlin"
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.timezone = tz
    db.commit()
    return {"status": "saved", "timezone": tz}


@router.get("/setup-status")
def get_setup_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What the first-run onboarding needs. Booleans only: no setting or secret leaves the server."""
    user_id = current_user.id
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    return {
        "has_source": _owns_any(db, JobPlatform.id, JobPlatform.user_id == user_id),
        "ai_configured": is_ai_configured(db),
        "profile_complete": profile_complete(profile),
        "has_jobs": _owns_any(db, JobEntry.id, JobEntry.user_id == user_id, JobEntry.status != STATUS_SEEN),
    }


@router.get("/notification-templates", response_model=List[NotificationTemplateResponse])
def list_notification_templates(
    type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(NotificationTemplate).filter(
        or_(
            NotificationTemplate.is_admin == True,
            NotificationTemplate.user_id == current_user.id,
        )
    )
    if type:
        q = q.filter(NotificationTemplate.type == type.upper())
    templates = q.order_by(NotificationTemplate.is_admin.desc(), NotificationTemplate.name).all()
    return [_template_to_dict(t) for t in templates]


NOTIFICATION_PREVIEW_RATE = "30/minute"
PREVIEW_USER_NAME_FALLBACK = "Test"
PREVIEW_PLATFORM_NAME = "Test"
# One sample match, so a preview shows the template as a real digest would.
SAMPLE_JOB = SimpleNamespace(
    title="Senior Software Engineer",
    company="Acme Corp",
    match_score=87.0,
    reasoning="Strong match based on your Python and FastAPI experience.",
    url="https://example.com/job/123",
)
EMAIL_TEMPLATE_TYPES = ("RESEND", "MAILJET", "SMTP")


@router.post("/notification-templates/preview")
@limiter.limit(NOTIFICATION_PREVIEW_RATE, key_func=user_or_ip_key)
def preview_notification_template(
    request: Request,
    body: NotificationPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """The template rendered with a fixed sample job by the notification service's own renderer; nothing is sent.

    An email answer is user-authored HTML (``html: true``): the service only fills escaped text into it
    and fetches nothing, so a client must treat it as untrusted and show it only in a sandboxed frame.
    A template the service refuses (a push text over its bound) is a 422 on ``content``.
    """
    email = body.type in EMAIL_TEMPLATE_TYPES
    template = {
        "name": "job_digest",
        ("html" if email else "push_text"): body.content or None,
        "variables": {
            "user_name": (current_user.username or PREVIEW_USER_NAME_FALLBACK)[:USER_NAME_MAX_LENGTH],
            "platform_name": PREVIEW_PLATFORM_NAME,
            "jobs": [job_item(SAMPLE_JOB)],
        },
    }
    try:
        rendered = notifications_client.get_client().preview(template)
    except NotifyError as error:
        raise http_error(error, loc_for=lambda _path: ["body", "content"]) from error
    return {"html": email, "body": rendered["html"] if email else rendered["push_text"]}


@router.post("/notification-templates", response_model=NotificationTemplateResponse)
def create_notification_template(
    body: NotificationTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if body.type.upper() not in ("PUSHOVER", "RESEND", "MAILJET"):
        raise HTTPException(status_code=400, detail="type must be PUSHOVER, RESEND or MAILJET")
    t = NotificationTemplate(
        name=body.name,
        type=body.type.upper(),
        content=body.content,
        is_admin=False,
        user_id=current_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_dict(t)


@router.put("/notification-templates/{template_id}", response_model=NotificationTemplateResponse)
def update_notification_template(
    template_id: int,
    body: NotificationTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    t = db.query(NotificationTemplate).filter(
        NotificationTemplate.id == template_id,
        NotificationTemplate.user_id == current_user.id,
        NotificationTemplate.is_admin == False,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        t.name = body.name
    if body.content is not None:
        t.content = body.content
    db.commit()
    db.refresh(t)
    return _template_to_dict(t)


@router.delete("/notification-templates/{template_id}")
def delete_notification_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    t = db.query(NotificationTemplate).filter(
        NotificationTemplate.id == template_id,
        NotificationTemplate.user_id == current_user.id,
        NotificationTemplate.is_admin == False,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found or cannot be deleted")
    db.delete(t)
    db.commit()
    return {"ok": True}
