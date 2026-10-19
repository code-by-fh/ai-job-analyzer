import os
from datetime import date, datetime, timezone
from uuid import UUID
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    Float,
    Integer,
    JSON,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    LargeBinary,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationInfo, field_validator
from typing import Annotated, List, Literal, Optional

from core.platform_rules import check_name, check_schedule_days, check_schedule_times, check_url_pattern
from core.url_safety import ensure_public_http_url
from services.company_domain import CompanyDomain

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://user:password@ai-job-agent-database:5432/jobdb"
)

engine = create_engine(DATABASE_URL, poolclass=NullPool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    token_version = Column(Integer, default=0)


class JobEntry(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    title = Column(String)
    company = Column(String)
    description = Column(Text)
    match_score = Column(Float)
    reasoning = Column(Text)
    application_draft = Column(Text, nullable=True)
    cv_draft = Column(Text, nullable=True)
    cv_html = Column(Text, nullable=True)
    cover_letter_html = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    url = Column(String, nullable=True)
    status = Column(String, default="OPEN")
    generation_error = Column(String, nullable=True)
    notification_sent = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_favorite = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    platform_id = Column(Integer, ForeignKey("job_platforms.id"), nullable=True)
    company_domain = Column(String, nullable=True)
    contact_persons = Column(JSON, nullable=True)
    interview_prep_material = Column(Text, nullable=True)
    recruiter_info = Column(JSON, nullable=True)
    salary_benchmark = Column(JSON, nullable=True)
    # Names of the fields above that the analysis filled from the posting; see intelligence/posting_details.py.
    posting_extracted = Column(JSON, nullable=True)
    next_follow_up_at = Column(DateTime(timezone=True), nullable=True)
    interview_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    archive_reason = Column(String, nullable=True)  # "THRESHOLD" | "USER", see core/job_status.py
    kept_by_user = Column(Boolean, default=False, nullable=False, server_default=false())
    checklist = Column(JSON, nullable=True)
    todos = Column(JSON, nullable=True)
    # Status before the running generation started; see core/job_status.py::status_after_generation.
    pre_generation_status = Column(String, nullable=True)
    generation_started_at = Column(DateTime(timezone=True), nullable=True)  # set while GENERATING, see workers/tasks/generation_sweep.py
    # Durable prep run state, see core/interview_prep_state.py: set while a prep runs, cleared when it ends.
    interview_prep_started_at = Column(DateTime(timezone=True), nullable=True)
    interview_prep_error = Column(String, nullable=True)
    # Durable run state of "Aus der Anzeige übernehmen", see core/posting_details_state.py.
    posting_details_started_at = Column(DateTime(timezone=True), nullable=True)
    posting_details_error = Column(String, nullable=True)
    # Durable company research run state, see core/company_research_state.py.
    company_research_started_at = Column(DateTime(timezone=True), nullable=True)
    company_research_error = Column(String, nullable=True)
    # Offer outcome tabs (feedback 1 T14): one notes column for "1. Arbeitstag" and "Wie geht's weiter".
    outcome_notes = Column(Text, nullable=True)
    first_day_checklist = Column(JSON, nullable=True)
    start_date = Column(Date, nullable=True)  # a calendar day, no instant: the first working day

    platform = relationship("JobPlatform", back_populates="jobs")
    status_history = relationship(
        "JobStatusHistory", back_populates="job", order_by="JobStatusHistory.changed_at"
    )
    documents = relationship(
        "JobDocument", back_populates="job", order_by="JobDocument.uploaded_at"
    )


class UserProfile(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    role = Column(String, default="Software Engineer")
    skills = Column(String, default="Python, Docker")
    min_salary = Column(String, default="60000")
    location = Column(String, default="Remote")
    preferences = Column(Text, default="")
    # Matching: Jobs with match_score below this threshold are auto-archived (0 = disabled)
    match_threshold = Column(Integer, default=0, nullable=False, server_default="0")
    cv_data = Column(JSON, default={})
    job_urls = Column(JSON, default=[])
    cv_template = Column(String, nullable=True, default="classic")
    cover_letter_template = Column(String, nullable=True, default="classic")

    # Legacy notification credentials: read-only since the notification service holds the channels; the
    # start-up migration (services/notification_migration.py) copies them once, then sets the flag below.
    pushover_user_key = Column(String, nullable=True)
    pushover_api_token = Column(String, nullable=True)
    resend_api_key = Column(String, nullable=True)
    resend_from_email = Column(String, nullable=True)
    mailjet_api_key = Column(String, nullable=True)
    mailjet_secret_key = Column(String, nullable=True)
    mailjet_from_email = Column(String, nullable=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String, nullable=True)
    smtp_password = Column(String, nullable=True)
    smtp_from_email = Column(String, nullable=True)
    email_global_recipient = Column(String, nullable=True)
    notification_channels_migrated = Column(Boolean, nullable=False, default=False, server_default=false())
    active_notification_service = Column(
        String, default="NONE"
    )  # NONE, PUSHOVER, RESEND, MAILJET
    language = Column(String, default="de")
    timezone = Column(String, default="Europe/Berlin")
    spoken_languages = Column(JSON, default=[], nullable=True)

    # Durable CV import run state, see core/cv_import_state.py: set while an import runs, cleared when it ends.
    cv_import_started_at = Column(DateTime(timezone=True), nullable=True)
    cv_import_error = Column(String, nullable=True)


class SystemSettings(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True)
    openrouter_model = Column(String, default="tngtech/deepseek-r1t2-chimera:free")
    openrouter_api_key = Column(String, nullable=True)
    ollama_model = Column(String, nullable=True, default="llama3.1:8b")
    ollama_base_url = Column(String, nullable=True)
    ai_task_routing = Column(JSON, nullable=True, default=dict)


class JobPlatform(Base):
    __tablename__ = "job_platforms"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    url = Column(String, index=True)
    name = Column(String)
    favicon_url = Column(String, nullable=True)
    crawl_interval_minutes = Column(Integer, default=1440)
    schedule_times = Column(JSON, nullable=True)
    schedule_days = Column(JSON, nullable=True)
    last_crawl_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    is_notification_enabled = Column(Boolean, default=False)
    # Legacy per-type switches, read only by the channel migration; notification_channels replaces them.
    notification_adapters = Column(JSON, default=[])
    # The notification-service channels this source notifies, as [{"id", "type"}]; the type never changes in
    # the service and is kept so lists need no service call. Templates and recipients stay per type below.
    notification_channels = Column(JSON, nullable=True)
    pushover_template = Column(Text, nullable=True)
    resend_template = Column(Text, nullable=True)
    resend_recipients = Column(JSON, nullable=True)
    mailjet_template = Column(Text, nullable=True)
    mailjet_recipients = Column(JSON, nullable=True)
    smtp_template = Column(Text, nullable=True)
    smtp_recipients = Column(JSON, nullable=True)
    setup_status = Column(String, nullable=False, default='pending_setup')
    url_pattern = Column(String, nullable=True)
    last_run = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    jobs = relationship("JobEntry", back_populates="platform")


class PlatformRun(Base):
    """One finished crawl of a platform (drawer history); workers/tasks/platform_runs.py keeps the newest 20."""

    __tablename__ = "platform_runs"
    id = Column(Integer, primary_key=True)
    # CASCADE: the bulk platform deletes (account delete, admin wipe) bypass the ORM.
    platform_id = Column(Integer, ForeignKey("job_platforms.id", ondelete="CASCADE"), index=True, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=False)
    found = Column(Integer, nullable=False, default=0)
    new = Column(Integer, nullable=False, default=0)
    matched = Column(Integer, nullable=False, default=0)
    # A seed run stores today's postings as known without analysing them (B8 "seed").
    seeded = Column(Boolean, nullable=False, default=False, server_default=false())
    error = Column(String, nullable=True)  # a fixed code of platform_runs.ERROR_CODES


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "PUSHOVER"
    content = Column(Text, nullable=False)
    is_admin = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = admin template
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class DocumentTemplate(Base):
    __tablename__ = "document_templates"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = admin/global
    is_admin = Column(Boolean, default=False)
    doc_type = Column(String, nullable=False)  # "CV" | "COVER_LETTER"
    name = Column(String, nullable=False)
    html = Column(Text, nullable=False)
    status = Column(String, nullable=True)  # None = ready | "processing" = AI fill running | "annotation_rejected" = AI output refused | "annotation_failed" = AI call or store failed; the original is kept in both
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User")


class CompanyProfile(Base):
    __tablename__ = "company_profiles"
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    culture_summary = Column(Text, nullable=True)
    review_score = Column(Float, nullable=True)
    review_source = Column(String, nullable=True)
    salary_benchmark = Column(JSON, nullable=True)
    tech_stack = Column(JSON, nullable=True)
    raw_data = Column(JSON, nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CompanyDeepDive(Base):
    """One user's latest run of one deep dive of a company: its run state and result, see core/deep_dive_state.py.

    Per user, unlike the shared profile: the result is in the requester's language and the error is
    meant for them. A deep dive is identified by its focus text; focus_hash keys it, since a focus of
    2000 code points can exceed a PostgreSQL index entry.
    """

    __tablename__ = "company_deep_dives"
    __table_args__ = (UniqueConstraint("user_id", "domain", "focus_hash", name="uq_company_deep_dives_run"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    domain = Column(String, nullable=False)
    focus = Column(Text, nullable=False)
    focus_hash = Column(String(64), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(String, nullable=True)
    result = Column(Text, nullable=True)


class JobDocument(Base):
    __tablename__ = "job_documents"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    kind = Column(String, default="UPLOADED", nullable=False, server_default="UPLOADED")
    # UPLOADED | GENERATED_CV | GENERATED_LETTER | ATTACHED_CERT | ATTACHED_REFERENCE
    # GENERATED_* rows are PDFs of jobs generated before CV and letter became HTML-only (rendered on download).
    content = Column(LargeBinary, nullable=True) # For local database storage
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("JobEntry", back_populates="documents")


class ProfileDocument(Base):
    __tablename__ = "profile_documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doc_type = Column(String, nullable=False)  # REFERENCE | CERTIFICATE
    label = Column(String, nullable=True)
    filename = Column(String, nullable=False)  # db://<name>
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    content = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JobStatusHistory(Base):
    __tablename__ = "job_status_history"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(Text, nullable=True)

    job = relationship("JobEntry", back_populates="status_history")


# Every profile field goes into each AI prompt; the web mirrors these (src/api/profilePaths.ts).
MAX_ROLE_LENGTH = 200
MAX_SKILLS_LENGTH = 2000
MAX_SALARY_LENGTH = 50
MAX_LOCATION_LENGTH = 200
MAX_PREFERENCES_LENGTH = 5000
MAX_SPOKEN_LANGUAGES = 20
MAX_SPOKEN_LANGUAGE_LENGTH = 50
MAX_CV_ENTRIES = 30
MAX_ENTRY_TITLE_LENGTH = 200
MAX_ENTRY_DURATION_LENGTH = 100
MAX_ENTRY_TEXT_LENGTH = 5000
MAX_EDUCATION_LENGTH = 5000

EntryTitle = Annotated[str, Field(max_length=MAX_ENTRY_TITLE_LENGTH)]
EntryText = Annotated[str, Field(max_length=MAX_ENTRY_TEXT_LENGTH)]
SpokenLanguage = Annotated[str, Field(max_length=MAX_SPOKEN_LANGUAGE_LENGTH)]


class ExperienceItem(BaseModel):
    # The CV import fills entries from an AI answer, which may give a year or a duration as a number.
    model_config = ConfigDict(coerce_numbers_to_str=True)

    company: EntryTitle = ""
    role: EntryTitle = ""
    duration: Annotated[str, Field(max_length=MAX_ENTRY_DURATION_LENGTH)] = ""
    description: EntryText = ""


class ProjectItem(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True)

    name: EntryTitle = ""
    tech_stack: EntryTitle = ""
    description: EntryText = ""


class CVDataModel(BaseModel):
    experience: List[ExperienceItem] = Field(default_factory=list, max_length=MAX_CV_ENTRIES)
    projects: List[ProjectItem] = Field(default_factory=list, max_length=MAX_CV_ENTRIES)
    education: str = Field("", max_length=MAX_EDUCATION_LENGTH)


MAX_EMAIL_LENGTH = 254
# Shape only (something@host.tld): delivery is what proves an address, the check keeps junk out.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
EmailAddress = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_EMAIL_LENGTH, pattern=EMAIL_PATTERN)]

MAX_NOTIFICATION_TEMPLATE_NAME_LENGTH = 100
# A digest template is HTML; 100,000 characters is far above any real one and keeps a row small.
MAX_NOTIFICATION_TEMPLATE_LENGTH = 100_000
# Resend accepts at most 50 addresses per message; the other channels get the same bound.
MAX_NOTIFICATION_RECIPIENTS = 50
# The notification service sends to at most 20 channels per notification (and an owner has at most 20).
MAX_SOURCE_CHANNELS = 20
NotificationTemplateName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NOTIFICATION_TEMPLATE_NAME_LENGTH)
]
NotificationTemplateText = Annotated[str, StringConstraints(min_length=1, max_length=MAX_NOTIFICATION_TEMPLATE_LENGTH)]
# A source's own template copy; "" is allowed there and stored as "no template".
NotificationTemplateCopy = Annotated[str, StringConstraints(max_length=MAX_NOTIFICATION_TEMPLATE_LENGTH)]
RecipientList = Annotated[List[EmailAddress], Field(max_length=MAX_NOTIFICATION_RECIPIENTS)]
NotificationChannelType = Literal["PUSHOVER", "RESEND", "MAILJET", "SMTP"]


class SettingsData(BaseModel):
    """Partial profile update: only the fields present in the body are written.

    Profile fields default to None without being Optional, so omitting one is
    fine but an explicit null is rejected. Notification credentials are not
    profile fields any more (the notification service holds them); like any
    unknown key they are ignored.
    """

    role: str = Field(None, max_length=MAX_ROLE_LENGTH)
    skills: str = Field(None, max_length=MAX_SKILLS_LENGTH)
    min_salary: str = Field(None, max_length=MAX_SALARY_LENGTH)
    location: str = Field(None, max_length=MAX_LOCATION_LENGTH)
    preferences: str = Field(None, max_length=MAX_PREFERENCES_LENGTH)
    cv_data: CVDataModel = None
    job_urls: List[str] = None
    spoken_languages: List[SpokenLanguage] = Field(None, max_length=MAX_SPOKEN_LANGUAGES)
    cv_template: str = None
    cover_letter_template: str = None
    active_notification_service: str = None


class PlatformCreate(BaseModel):
    url: str
    crawl_interval_minutes: int = 1440

    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: str) -> str:
        return ensure_public_http_url(value)


class PlatformUpdate(BaseModel):
    url: Optional[str] = None
    name: Optional[str] = None
    crawl_interval_minutes: Optional[int] = None
    schedule_times: Optional[List[str]] = None
    schedule_days: Optional[List[int]] = None
    is_active: Optional[bool] = None
    is_notification_enabled: Optional[bool] = None
    notification_channel_ids: Optional[List[UUID]] = Field(None, max_length=MAX_SOURCE_CHANNELS)
    # Bounded in routers/platforms.py, not here: a value equal to the stored one is accepted unchanged,
    # so a legacy copy the drawer sends back verbatim never blocks the save.
    pushover_template: Optional[str] = None
    resend_template: Optional[str] = None
    resend_recipients: Optional[List[str]] = None
    mailjet_template: Optional[str] = None
    mailjet_recipients: Optional[List[str]] = None
    smtp_template: Optional[str] = None
    smtp_recipients: Optional[List[str]] = None
    setup_status: Optional[str] = None
    url_pattern: Optional[str] = None

    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else ensure_public_http_url(value)

    @field_validator("schedule_times")
    @classmethod
    def _times_format(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return check_schedule_times(value)

    @field_validator("schedule_days")
    @classmethod
    def _days_range(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        return check_schedule_days(value)

    @field_validator("name")
    @classmethod
    def _name_text(cls, value: Optional[str]) -> Optional[str]:
        return check_name(value)

    @field_validator("url_pattern")
    @classmethod
    def _pattern_text(cls, value: Optional[str]) -> Optional[str]:
        return check_url_pattern(value)


class PlatformRunResponse(BaseModel):
    started_at: Optional[str] = None
    finished_at: str
    found: int
    new: int
    matched: int
    seeded: bool
    error: Optional[str] = None


class PlatformResponse(BaseModel):
    id: int
    url: str
    name: str
    favicon_url: Optional[str] = None
    crawl_interval_minutes: int
    schedule_times: Optional[List[str]] = None
    schedule_days: Optional[List[int]] = None
    last_crawl_at: Optional[str] = None
    is_active: bool
    is_notification_enabled: bool = False
    notification_adapters: List[str] = []
    notification_channel_ids: List[str] = []
    pushover_template: Optional[str] = None
    resend_template: Optional[str] = None
    resend_recipients: Optional[List[str]] = None
    mailjet_template: Optional[str] = None
    mailjet_recipients: Optional[List[str]] = None
    smtp_template: Optional[str] = None
    smtp_recipients: Optional[List[str]] = None
    job_count: int = 0
    seen_count: int = 0
    setup_status: str = 'active'
    url_pattern: Optional[str] = None
    last_run: Optional[dict] = None

    class Config:
        orm_mode = True


class PlatformSetupResponse(PlatformResponse):
    """Response of the setup wizard only; list and update responses never carry the setup flag."""

    initial_crawl_started: bool = False


class NotificationTemplateCreate(BaseModel):
    name: NotificationTemplateName
    type: str  # checked by the routers (SMTP stays refused, spec section 3)
    content: NotificationTemplateText


class NotificationTemplateUpdate(BaseModel):
    name: Optional[NotificationTemplateName] = None
    content: Optional[NotificationTemplateText] = None


class NotificationPreviewRequest(BaseModel):
    type: NotificationChannelType
    # Empty previews the built-in default text, as a source without a template would send.
    content: str = Field("", max_length=MAX_NOTIFICATION_TEMPLATE_LENGTH)

    @field_validator("type", mode="before")
    @classmethod
    def _type_in_capitals(cls, value):
        """Like template creation, the type is case-insensitive."""
        return value.upper() if isinstance(value, str) else value


class NotificationTemplateResponse(BaseModel):
    id: int
    name: str
    type: str
    content: str
    is_admin: bool
    user_id: Optional[int] = None
    created_at: str

    class Config:
        orm_mode = True


# Same bound as a job document's HTML (routers.jobs.MAX_DOCUMENT_HTML_LENGTH).
MAX_TEMPLATE_HTML_LENGTH = 1_000_000
MAX_TEMPLATE_NAME_LENGTH = 100
TemplateName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEMPLATE_NAME_LENGTH)]


class DocumentTemplateCreate(BaseModel):
    doc_type: str  # "CV" | "COVER_LETTER"
    name: TemplateName
    html: str = Field(max_length=MAX_TEMPLATE_HTML_LENGTH)
    is_admin: bool = False  # only honored when current_user.is_admin


class DocumentTemplateUpdate(BaseModel):
    name: Optional[TemplateName] = None
    html: Optional[str] = Field(None, max_length=MAX_TEMPLATE_HTML_LENGTH)


class DocumentTemplateResponse(BaseModel):
    id: int
    doc_type: str
    name: str
    is_admin: bool
    user_id: Optional[int] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


class CompanyProfileResponse(BaseModel):
    id: int
    domain: str
    name: Optional[str] = None
    description: Optional[str] = None
    culture_summary: Optional[str] = None
    review_score: Optional[float] = None
    review_source: Optional[str] = None
    salary_benchmark: Optional[dict] = None
    tech_stack: Optional[List[str]] = None
    analyzed_at: Optional[str] = None

    class Config:
        orm_mode = True


class JobStatusHistoryEntry(BaseModel):
    id: int
    from_status: Optional[str] = None
    to_status: str
    changed_at: str
    note: Optional[str] = None

    class Config:
        orm_mode = True


MAX_TODOS = 50
MAX_TODO_TEXT_LENGTH = 500
MAX_TODO_ID_LENGTH = 64


class JobChecklist(BaseModel):
    """Apply checklist of the job page; only these keys exist."""

    model_config = ConfigDict(extra="forbid")
    posting_opened: bool = False
    documents_checked: bool = False
    sent: bool = False


class FirstDayChecklist(BaseModel):
    """First-day checklist of an accepted offer; only these keys exist, replaced as a whole on PATCH."""

    model_config = ConfigDict(extra="forbid")
    contract_signed: bool = False
    papers_ready: bool = False
    others_declined: bool = False
    route_planned: bool = False
    first_day_contact: bool = False


class JobTodo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=MAX_TODO_ID_LENGTH)
    text: str = Field(min_length=1, max_length=MAX_TODO_TEXT_LENGTH)
    done: bool = False


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise to an aware UTC instant; a naive value is taken as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_utc(value: Optional[datetime]) -> Optional[str]:
    """ISO 8601 in UTC with an explicit offset, so clients never guess the zone."""
    return as_utc(value).isoformat() if value else None


MAX_CONTACTS = 20
MAX_CONTACT_FIELD_LENGTH = 200
MAX_SALARY_AMOUNT = 10_000_000
MAX_SALARY_NOTE_LENGTH = 500
MAX_NOTES_LENGTH = 20_000
MAX_DRAFT_LENGTH = 50_000


class JobContactPerson(BaseModel):
    """One contact of a job; only these keys are stored."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=MAX_CONTACT_FIELD_LENGTH)
    role: str = Field("", max_length=MAX_CONTACT_FIELD_LENGTH)
    email: str = Field("", max_length=MAX_CONTACT_FIELD_LENGTH)
    phone: str = Field("", max_length=MAX_CONTACT_FIELD_LENGTH)


class JobRecruiterInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, max_length=MAX_CONTACT_FIELD_LENGTH)
    role: Optional[str] = Field(None, max_length=MAX_CONTACT_FIELD_LENGTH)
    email: Optional[str] = Field(None, max_length=MAX_CONTACT_FIELD_LENGTH)
    phone: Optional[str] = Field(None, max_length=MAX_CONTACT_FIELD_LENGTH)


class JobSalaryBenchmark(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: Optional[float] = Field(None, ge=0, le=MAX_SALARY_AMOUNT)
    max: Optional[float] = Field(None, ge=0, le=MAX_SALARY_AMOUNT)
    note: str = Field("", max_length=MAX_SALARY_NOTE_LENGTH)

    # A field validator on max (not a model validator) puts the 422 on salary_benchmark.max,
    # so the web client can show it under that field.
    @field_validator("max")
    @classmethod
    def max_not_below_min(cls, value: Optional[float], info: ValidationInfo) -> Optional[float]:
        minimum = info.data.get("min")
        if value is not None and minimum is not None and value < minimum:
            raise ValueError("max must not be below min")
        return value


class JobPatchRequest(BaseModel):
    is_favorite: Optional[bool] = None
    company_domain: Optional[CompanyDomain] = None
    contact_persons: Optional[List[JobContactPerson]] = Field(None, max_length=MAX_CONTACTS)
    recruiter_info: Optional[JobRecruiterInfo] = None
    salary_benchmark: Optional[JobSalaryBenchmark] = None
    next_follow_up_at: Optional[datetime] = None
    interview_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=MAX_NOTES_LENGTH)
    outcome_notes: Optional[str] = Field(None, max_length=MAX_NOTES_LENGTH)
    first_day_checklist: Optional[FirstDayChecklist] = None
    start_date: Optional[date] = None
    application_draft: Optional[str] = Field(None, max_length=MAX_DRAFT_LENGTH)
    cv_draft: Optional[str] = Field(None, max_length=MAX_DRAFT_LENGTH)
    is_archived: Optional[bool] = None
    checklist: Optional[JobChecklist] = None
    todos: Optional[List[JobTodo]] = Field(None, max_length=MAX_TODOS)

    @field_validator("next_follow_up_at", "interview_at")
    @classmethod
    def _dates_as_utc(cls, value):
        return as_utc(value)

    @field_validator("todos")
    @classmethod
    def _todo_ids_unique(cls, todos):
        # The UI toggles and deletes to-dos by id, so a duplicate would hit the wrong item.
        if todos is not None and len({todo.id for todo in todos}) != len(todos):
            raise ValueError("todo ids must be unique")
        return todos


class CompanyAnalyzeRequest(BaseModel):
    force_refresh: bool = False


class JobCompanyResearchRequest(BaseModel):
    """The company domain to research for a job; null asks the AI to identify it."""

    company_domain: Optional[CompanyDomain] = None
    force_refresh: bool = False


# The texts come from AI output and scraped names; the web clips them to these bounds before sending.
MAX_DEEP_DIVE_TEXT_LENGTH = 2000
MAX_DEEP_DIVE_TITLE_LENGTH = 300
MAX_DEEP_DIVE_COMPANY_LENGTH = 200


class DeepDiveRequest(BaseModel):
    focus: str = Field(max_length=MAX_DEEP_DIVE_TEXT_LENGTH)
    how_to_proceed: str = Field(max_length=MAX_DEEP_DIVE_TEXT_LENGTH)
    company_name: str = Field(max_length=MAX_DEEP_DIVE_COMPANY_LENGTH)
    title: str = Field(max_length=MAX_DEEP_DIVE_TITLE_LENGTH)
    language: Literal["de", "en"] = "de"
