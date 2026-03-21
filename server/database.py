import os
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    Float,
    Integer,
    JSON,
    DateTime,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import List, Optional

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://user:password@database:5432/jobdb"
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
    next_follow_up_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

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
    cv_data = Column(JSON, default={})
    job_urls = Column(JSON, default=[])

    # Notification Settings
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
    active_notification_service = Column(
        String, default="NONE"
    )  # NONE, PUSHOVER, RESEND, MAILJET
    language = Column(String, default="de")
    timezone = Column(String, default="Europe/Berlin")


class SystemSettings(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True)
    openrouter_model = Column(String, default="tngtech/deepseek-r1t2-chimera:free")
    openrouter_api_key = Column(String, nullable=True)


class DomainUrlPattern(Base):
    __tablename__ = "domain_url_patterns"
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, index=True, nullable=False)
    url_pattern = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class JobPlatform(Base):
    __tablename__ = "job_platforms"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    url = Column(String, index=True)
    name = Column(String)
    favicon_url = Column(String, nullable=True)
    crawl_interval_minutes = Column(Integer, default=1440)  # Default: 24h (fallback)
    schedule_time = Column(String, nullable=True)   # "HH:MM" UTC, e.g. "08:30"
    schedule_days = Column(JSON, nullable=True)     # [0..6] Mon=0 Sun=6
    last_crawl_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    is_notification_enabled = Column(Boolean, default=False)
    notification_adapters = Column(JSON, default=[])
    pushover_template = Column(Text, nullable=True)
    resend_template = Column(Text, nullable=True)
    resend_recipients = Column(JSON, nullable=True)
    mailjet_template = Column(Text, nullable=True)
    mailjet_recipients = Column(JSON, nullable=True)
    smtp_template = Column(Text, nullable=True)
    smtp_recipients = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    jobs = relationship("JobEntry", back_populates="platform")


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


class JobDocument(Base):
    __tablename__ = "job_documents"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("JobEntry", back_populates="documents")


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


class ExperienceItem(BaseModel):
    company: str
    role: str
    duration: str
    description: str


class ProjectItem(BaseModel):
    name: str
    tech_stack: str
    description: str


class CVDataModel(BaseModel):
    experience: List[ExperienceItem] = []
    projects: List[ProjectItem] = []
    education: str = ""


class SettingsData(BaseModel):
    role: str
    skills: str
    min_salary: str
    location: str
    preferences: str
    cv_data: CVDataModel
    job_urls: List[str] = []

    pushover_user_key: Optional[str] = None
    pushover_api_token: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None
    mailjet_api_key: Optional[str] = None
    mailjet_secret_key: Optional[str] = None
    mailjet_from_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    active_notification_service: str = "NONE"
    language: str = "de"
    timezone: str = "Europe/Berlin"


class NotificationSettingsData(BaseModel):
    pushover_user_key: Optional[str] = None
    pushover_api_token: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None
    mailjet_api_key: Optional[str] = None
    mailjet_secret_key: Optional[str] = None
    mailjet_from_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None


class PlatformCreate(BaseModel):
    url: str
    crawl_interval_minutes: int = 1440


class PlatformUpdate(BaseModel):
    url: Optional[str] = None
    name: Optional[str] = None
    crawl_interval_minutes: Optional[int] = None
    schedule_time: Optional[str] = None
    schedule_days: Optional[List[int]] = None
    is_active: Optional[bool] = None
    is_notification_enabled: Optional[bool] = None
    notification_adapters: Optional[List[str]] = None
    pushover_template: Optional[str] = None
    resend_template: Optional[str] = None
    resend_recipients: Optional[List[str]] = None
    mailjet_template: Optional[str] = None
    mailjet_recipients: Optional[List[str]] = None
    smtp_template: Optional[str] = None
    smtp_recipients: Optional[List[str]] = None


class PlatformResponse(BaseModel):
    id: int
    url: str
    name: str
    favicon_url: Optional[str] = None
    crawl_interval_minutes: int
    schedule_time: Optional[str] = None
    schedule_days: Optional[List[int]] = None
    last_crawl_at: Optional[str] = None
    is_active: bool
    is_notification_enabled: bool = False
    notification_adapters: List[str] = []
    pushover_template: Optional[str] = None
    resend_template: Optional[str] = None
    resend_recipients: Optional[List[str]] = None
    mailjet_template: Optional[str] = None
    mailjet_recipients: Optional[List[str]] = None
    smtp_template: Optional[str] = None
    smtp_recipients: Optional[List[str]] = None
    job_count: int = 0
    seen_count: int = 0

    class Config:
        orm_mode = True


class NotificationTemplateCreate(BaseModel):
    name: str
    type: str  # "PUSHOVER"
    content: str


class NotificationTemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None


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


class JobPatchRequest(BaseModel):
    status: Optional[str] = None
    is_favorite: Optional[bool] = None
    company_domain: Optional[str] = None
    contact_persons: Optional[list] = None
    recruiter_info: Optional[dict] = None
    salary_benchmark: Optional[dict] = None
    next_follow_up_at: Optional[str] = None
    note: Optional[str] = None
    notes: Optional[str] = None
    application_draft: Optional[str] = None
    is_archived: Optional[bool] = None


class CompanyAnalyzeRequest(BaseModel):
    force_refresh: bool = False
