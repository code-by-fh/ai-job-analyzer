import os
from sqlalchemy import create_engine, Column, String, Text, Float, Integer, JSON, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import List, Optional

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@database:5432/jobdb")

engine = create_engine(DATABASE_URL, poolclass=NullPool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

class UserProfile(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True) 
    role = Column(String, default="Software Engineer")
    skills = Column(String, default="Python, Docker")
    min_salary = Column(String, default="60000")
    location = Column(String, default="Remote")
    preferences = Column(Text, default="")
    cv_data = Column(JSON, default={}) 
    job_urls = Column(JSON, default=[])

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
