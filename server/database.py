import os
from sqlalchemy import create_engine, Column, String, Text, Float, Integer, JSON, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import List, Optional

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@database:5432/jobdb")

engine = create_engine(DATABASE_URL, poolclass=NullPool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)

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
    platform_id = Column(Integer, ForeignKey("job_platforms.id"), nullable=True)
    
    platform = relationship("JobPlatform", back_populates="jobs")

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
    gmail_address = Column(String, nullable=True)
    gmail_app_password = Column(String, nullable=True)
    pushover_user_key = Column(String, nullable=True)
    pushover_api_token = Column(String, nullable=True)
    active_notification_service = Column(String, default="NONE") # NONE, GMAIL, PUSHOVER

class SystemSettings(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True)
    openrouter_model = Column(String, default="tngtech/deepseek-r1t2-chimera:free")


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
    crawl_interval_minutes = Column(Integer, default=1440) # Default: 24h
    last_crawl_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    is_notification_enabled = Column(Boolean, default=False)
    notification_adapters = Column(JSON, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    jobs = relationship("JobEntry", back_populates="platform")

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
    
    gmail_address: Optional[str] = None
    gmail_app_password: Optional[str] = None
    pushover_user_key: Optional[str] = None
    pushover_api_token: Optional[str] = None
    active_notification_service: str = "NONE"

class PlatformCreate(BaseModel):
    url: str
    crawl_interval_minutes: int = 1440

class PlatformUpdate(BaseModel):
    crawl_interval_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    is_notification_enabled: Optional[bool] = None
    notification_adapters: Optional[List[str]] = None

class PlatformResponse(BaseModel):
    id: int
    url: str
    name: str
    favicon_url: Optional[str] = None
    crawl_interval_minutes: int
    last_crawl_at: Optional[str] = None
    is_active: bool
    is_notification_enabled: bool = False
    notification_adapters: List[str] = []
    job_count: int = 0

    class Config:
        orm_mode = True
