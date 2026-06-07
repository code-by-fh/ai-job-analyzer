import io
import json
import zoneinfo
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from database.core import (
    NotificationSettingsData,
    NotificationTemplate,
    NotificationTemplateCreate,
    NotificationTemplateResponse,
    NotificationTemplateUpdate,
    SettingsData,
    User,
    UserProfile,
)
from core.logger import get_logger
from routers.deps import (
    _SECRET_MASK,
    _mask_profile,
    _template_to_dict,
    get_current_model,
    get_openrouter_client,
    limiter,
)
from workers.worker import (
    _send_via_mailjet_batch,
    _send_via_pushover,
    _send_via_resend_batch,
    _send_via_smtp_batch,
)

logger = get_logger(__name__)

router = APIRouter()


def extract_text_from_pdf(file_bytes):
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        logger.error(f"PDF Read Error: {e}")
        return ""


def parse_cv_with_ai(cv_text):
    system_prompt = """
    Du bist ein Daten-Extraktions-Assistent.
    Deine Aufgabe: Extrahiere strukturierte Daten aus einem Lebenslauf-Text.

    Antworte AUSSCHLIESSLICH mit validem JSON. Keine Markdown-Formatierung (kein ```json).

    Das Ziel-Format ist:
    {
      "role": "Aktuelle oder angestrebte Rolle (z.B. Senior Python Dev)",
      "skills": "Liste von Skills, kommagetrennt (z.B. Python, Docker, AWS)",
      "min_salary": "Geschätztes Wunschgehalt als Zahl-String (z.B. 70000), falls im Text, sonst leer lassen",
      "location": "Wohnort oder Wunschort, falls im Text, sonst 'Remote'",
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
    """

    user_prompt = f"Hier ist der Lebenslauf:\n\n{cv_text}"

    try:
        model = get_current_model()
        logger.info(f"Using Model for CV Parse: {model}")
        response = get_openrouter_client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "")
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI Parse Error: {e}")
        return None


class LanguagePreferenceData(BaseModel):
    language: str = "de"


class MatchThresholdData(BaseModel):
    match_threshold: int = Field(default=0, ge=0, le=100)


class TestNotificationBody(BaseModel):
    recipient: str = ""


def _make_fake_platform(recipient: str = "") -> object:
    """Create a minimal fake platform for settings-page adapter tests."""
    class _FakePlatform:
        name = "Test"
        resend_recipients = [recipient] if recipient else []
        resend_template = None
        mailjet_recipients = [recipient] if recipient else []
        mailjet_template = None
        smtp_recipients = [recipient] if recipient else []
        smtp_template = None
        pushover_template = None
    return _FakePlatform()


class _FakeJob:
    id = 0
    title = "Senior Software Engineer"
    company = "Acme Corp"
    match_score = 87.0
    reasoning = "Strong match based on your Python and FastAPI experience."
    url = "https://example.com/job/123"
    platform_id = None


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
    return _mask_profile(profile)


@router.post("/settings")
def save_settings(
    settings: SettingsData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    profile.role = settings.role
    profile.skills = settings.skills
    profile.min_salary = settings.min_salary
    profile.location = settings.location
    profile.preferences = settings.preferences
    profile.cv_data = settings.cv_data.model_dump()
    profile.job_urls = settings.job_urls
    profile.spoken_languages = settings.spoken_languages

    if settings.cv_template is not None:
        profile.cv_template = settings.cv_template
    if settings.cover_letter_template is not None:
        profile.cover_letter_template = settings.cover_letter_template

    # Save Notification Settings
    profile.pushover_user_key = settings.pushover_user_key

    if settings.pushover_api_token != _SECRET_MASK:
        profile.pushover_api_token = settings.pushover_api_token
    if settings.resend_api_key != _SECRET_MASK:
        profile.resend_api_key = settings.resend_api_key
    profile.resend_from_email = settings.resend_from_email
    if settings.mailjet_api_key != _SECRET_MASK:
        profile.mailjet_api_key = settings.mailjet_api_key
    if settings.mailjet_secret_key != _SECRET_MASK:
        profile.mailjet_secret_key = settings.mailjet_secret_key
    profile.mailjet_from_email = settings.mailjet_from_email
    profile.active_notification_service = settings.active_notification_service

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
            # Only reset CV/profile fields — notification adapter config is preserved
            profile.role = "Software Engineer"
            profile.skills = "Python, Docker"
            profile.min_salary = "60000"
            profile.location = "Remote"
            profile.preferences = ""
            profile.cv_data = {}
            profile.job_urls = []
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


@router.post("/settings/upload-cv")
@limiter.limit("10/minute")
async def upload_cv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Nur PDF Dateien erlaubt.")

    content = await file.read()
    text = extract_text_from_pdf(content)

    if len(text) < 50:
        raise HTTPException(
            status_code=400,
            detail="Konnte keinen Text aus dem PDF lesen (evtl. Bild-Scan?).",
        )

    parsed_data = parse_cv_with_ai(text)

    if not parsed_data:
        raise HTTPException(status_code=500, detail="AI konnte CV nicht verarbeiten.")

    try:
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if not profile:
            profile = UserProfile(user_id=current_user.id)
            db.add(profile)

        profile.role = parsed_data.get("role", profile.role)
        profile.skills = parsed_data.get("skills", profile.skills)
        if parsed_data.get("min_salary"):
            profile.min_salary = parsed_data.get("min_salary")
        if parsed_data.get("location"):
            profile.location = parsed_data.get("location")

        profile.cv_data = parsed_data.get("cv_data", {})

        db.commit()
        return {"status": "success", "data": parsed_data}

    except Exception as e:
        logger.error(f"DB Save Error: {e}")
        raise HTTPException(status_code=500, detail="Datenbank Fehler")


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
    db.commit()
    return {"status": "saved", "match_threshold": data.match_threshold}


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


@router.post("/notification-settings")
def save_notification_settings(
    settings: NotificationSettingsData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.pushover_user_key = settings.pushover_user_key
    if settings.pushover_api_token != _SECRET_MASK:
        profile.pushover_api_token = settings.pushover_api_token
    if settings.resend_api_key != _SECRET_MASK:
        profile.resend_api_key = settings.resend_api_key
    profile.resend_from_email = settings.resend_from_email
    if settings.mailjet_api_key != _SECRET_MASK:
        profile.mailjet_api_key = settings.mailjet_api_key
    if settings.mailjet_secret_key != _SECRET_MASK:
        profile.mailjet_secret_key = settings.mailjet_secret_key
    profile.mailjet_from_email = settings.mailjet_from_email
    profile.smtp_host = settings.smtp_host
    profile.smtp_port = settings.smtp_port
    profile.smtp_user = settings.smtp_user
    if settings.smtp_password != _SECRET_MASK:
        profile.smtp_password = settings.smtp_password
    profile.smtp_from_email = settings.smtp_from_email
    profile.email_global_recipient = settings.email_global_recipient or profile.email_global_recipient
    db.commit()
    return {"status": "saved"}


@router.post("/notification-settings/test-pushover")
def test_pushover_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.pushover_user_key or not profile.pushover_api_token:
            raise HTTPException(status_code=400, detail="Pushover credentials not configured")
        if not _send_via_pushover(_FakeJob(), profile, platform=_make_fake_platform()):
            raise HTTPException(status_code=500, detail="Pushover delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notification-settings/test-resend")
def test_resend_settings(
    body: TestNotificationBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.resend_api_key or not profile.resend_from_email:
            raise HTTPException(status_code=400, detail="Resend credentials not configured")
        recipient = body.recipient or profile.email_global_recipient
        if not recipient:
            raise HTTPException(status_code=400, detail="No recipient provided")
        if not _send_via_resend_batch([_FakeJob()], profile, platform=_make_fake_platform(recipient), userName=current_user.username):
            raise HTTPException(status_code=500, detail="Resend delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notification-settings/test-mailjet")
def test_mailjet_settings(
    body: TestNotificationBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.mailjet_api_key or not profile.mailjet_secret_key or not profile.mailjet_from_email:
            raise HTTPException(status_code=400, detail="Mailjet credentials not configured")
        recipient = body.recipient or profile.email_global_recipient
        if not recipient:
            raise HTTPException(status_code=400, detail="No recipient provided")
        if not _send_via_mailjet_batch([_FakeJob()], profile, platform=_make_fake_platform(recipient), userName=current_user.username):
            raise HTTPException(status_code=500, detail="Mailjet delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notification-settings/test-smtp")
def test_smtp_settings(
    body: TestNotificationBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.smtp_host or not profile.smtp_user or not profile.smtp_password:
            raise HTTPException(status_code=400, detail="SMTP credentials not configured")
        recipient = body.recipient or profile.email_global_recipient
        if not recipient:
            raise HTTPException(status_code=400, detail="No recipient provided")
        if not _send_via_smtp_batch([_FakeJob()], profile, platform=_make_fake_platform(recipient), userName=current_user.username):
            raise HTTPException(status_code=500, detail="SMTP delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notification-settings/test-email")
def test_email_notification(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a test email to the configured global recipient using the first configured adapter."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    recipient = profile.email_global_recipient
    if not recipient:
        raise HTTPException(status_code=400, detail="No global recipient configured")

    fake_platform = _make_fake_platform(recipient)

    sent = False
    if profile.resend_api_key and profile.resend_from_email:
        sent = _send_via_resend_batch([_FakeJob()], profile, platform=fake_platform, userName=current_user.username)
    elif profile.smtp_host and profile.smtp_user and profile.smtp_password:
        sent = _send_via_smtp_batch([_FakeJob()], profile, platform=fake_platform, userName=current_user.username)
    elif profile.mailjet_api_key and profile.mailjet_secret_key and profile.mailjet_from_email:
        sent = _send_via_mailjet_batch([_FakeJob()], profile, platform=fake_platform, userName=current_user.username)

    if not sent:
        raise HTTPException(
            status_code=500,
            detail="Test delivery failed or no email adapter configured (Resend, Mailjet or SMTP)"
        )

    return {"success": True, "message": f"Test-E-Mail an {recipient} gesendet"}


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
