import os
import json
import logging
import io
import asyncio
from datetime import date
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Depends,
    status,
    Response,
)
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import redis.asyncio as redis_async
import redis as redis_sync
from openai import OpenAI
from pypdf import PdfReader
import markdown
from xhtml2pdf import pisa
from io import BytesIO
from sqlalchemy.orm import Session
import requests

from celery_config import celery_app
from database import (
    SessionLocal,
    JobEntry,
    UserProfile,
    SettingsData,
    NotificationSettingsData,
    CVDataModel,
    User,
    JobPlatform,
    PlatformCreate,
    PlatformUpdate,
    PlatformResponse,
    SystemSettings,
    engine,
    Base,
    CompanyProfile,
    JobStatusHistory,
    JobPatchRequest,
    CompanyAnalyzeRequest,
    CompanyProfileResponse,
    JobStatusHistoryEntry,
    DomainUrlPattern,
    JobDocument,
)
from auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_admin_user,
    verify_password,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from datetime import timedelta

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")

limiter = Limiter(key_func=get_remote_address)

# Note: tasks are referenced by name strings

from logger import get_logger

logger = get_logger(__name__)


# Dynamic Client helpers
def get_current_model(db: Session = None):
    # If db is provided, use it. Otherwise create new session.
    local_db = False
    if not db:
        db = SessionLocal()
        local_db = True
    try:
        settings = db.query(SystemSettings).first()
        return (
            settings.openrouter_model
            if settings
            else "tngtech/deepseek-r1t2-chimera:free"
        )
    except Exception:
        return "tngtech/deepseek-r1t2-chimera:free"
    finally:
        if local_db:
            db.close()


client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY"),
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


async def redis_listener():
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    logger.info(f" cercando Redis at {redis_url}...")

    try:
        r = redis_async.from_url(redis_url, encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe("job_updates")
        logger.info("✅ Erflogreich auf Kanal 'job_updates' abonniert!")

        async for message in pubsub.listen():
            logger.debug(f"🔍 Rohe Nachricht von Redis: {message}")
            if message["type"] == "message":
                payload = message["data"]
                logger.debug(f"Event empfangen & wird gebroadcastet: {payload}")
                await manager.broadcast(payload)
    except Exception as e:
        logger.error(f"RITISCHER FEHLER im Redis Listener: {e}")


class UserCreate(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool


class Token(BaseModel):
    access_token: str
    token_type: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starte Redis Listener Task...")
    task = asyncio.create_task(redis_listener())

    # Ensure Tables Exist
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Checked/Created Database Tables")
    except Exception as e:
        logger.error(f"Error creating tables: {e}")

    # Create Default Admin
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            admin_password = os.getenv("ADMIN_PASSWORD", "admin")
            logger.info("Create default admin user")
            hashed_pwd = get_password_hash(admin_password)
            admin_user = User(
                username="admin", hashed_password=hashed_pwd, is_admin=True
            )
            db.add(admin_user)
            db.commit()
    except Exception as e:
        logger.error(f"Error creating default admin: {e}")
    finally:
        db.close()

    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

from scraper_api import app as scraper_app

app.mount("/scraper", scraper_app)


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


class SystemSettingsUpdate(BaseModel):
    openrouter_model: str


@app.get("/admin/settings")
def get_admin_settings(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        if not settings:
            return {"openrouter_model": "tngtech/deepseek-r1t2-chimera:free"}
        return {"openrouter_model": settings.openrouter_model}
    finally:
        db.close()


@app.post("/admin/settings")
def update_admin_settings(
    settings: SystemSettingsUpdate, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        db_settings = db.query(SystemSettings).first()
        if not db_settings:
            db_settings = SystemSettings(openrouter_model=settings.openrouter_model)
            db.add(db_settings)
        else:
            db_settings.openrouter_model = settings.openrouter_model
        db.commit()
        return {"status": "updated", "openrouter_model": db_settings.openrouter_model}
    finally:
        db.close()


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
        response = client.chat.completions.create(
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


@app.post("/auth/login")
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == form_data.username).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
            )
        token_data = {"sub": user.username, "tv": user.token_version}
        access_token = create_access_token(data=token_data)
        refresh_token = create_refresh_token(data=token_data)
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        )
        return {"status": "ok"}
    finally:
        db.close()


@app.post("/auth/refresh")
async def refresh_access_token(request: Request, response: Response):
    from jose import JWTError, jwt
    from auth import SECRET_KEY, ALGORITHM

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
    )
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise credentials_exception
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_exception
        username: str = payload.get("sub")
        token_version: int = payload.get("tv", 0)
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or user.token_version != token_version:
            raise credentials_exception
        token_data = {"sub": user.username, "tv": user.token_version}
        access_token = create_access_token(data=token_data)
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        return {"status": "ok"}
    finally:
        db.close()


@app.post("/auth/logout")
async def logout(response: Response, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if user:
            user.token_version += 1
            db.commit()
    finally:
        db.close()
    response.delete_cookie(
        key="access_token", httponly=True, secure=COOKIE_SECURE, samesite="lax"
    )
    response.delete_cookie(
        key="refresh_token", httponly=True, secure=COOKIE_SECURE, samesite="lax"
    )
    return {"status": "logged out"}


@app.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(request.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")

        user.hashed_password = get_password_hash(request.new_password)
        db.commit()
        return {"status": "password updated"}
    finally:
        db.close()


@app.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/users", response_model=List[UserResponse])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        users = db.query(User).offset(skip).limit(limit).all()
        return users
    finally:
        db.close()


@app.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.username == user.username).first()
        if db_user:
            raise HTTPException(status_code=400, detail="Username already registered")
        hashed_password = get_password_hash(user.password)
        new_user = User(
            username=user.username, hashed_password=hashed_password, is_admin=False
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    finally:
        db.close()


@app.delete("/users/{user_id}")
async def delete_user(
    user_id: int, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Delete dependent data first to avoid IntegrityError
        # 1. Delete Jobs (depend on User and Platform)
        db.query(JobEntry).filter(JobEntry.user_id == user_id).delete()

        # 2. Delete Profile (depends on User)
        db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()

        # 3. Delete Platforms (depend on User)
        # Note: Jobs referring to these platforms are already deleted above
        db.query(JobPlatform).filter(JobPlatform.user_id == user_id).delete()

        db.delete(user)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/status")
async def get_system_status():
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    r = redis_sync.from_url(redis_url, decode_responses=True)
    is_crawling = r.get("system:crawling")
    return {"crawling": bool(is_crawling)}


@app.get("/jobs/domains")
def get_job_domains(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        from sqlalchemy import distinct

        rows = (
            db.query(distinct(JobEntry.company))
            .filter(JobEntry.user_id == current_user.id, JobEntry.company.isnot(None))
            .all()
        )
        domains = sorted(r[0] for r in rows if r[0])
        return domains
    finally:
        db.close()


@app.get("/jobs")
def get_jobs(
    current_user: User = Depends(get_current_user),
    limit: Optional[int] = None,
    offset: int = 0,
    filter_type: Optional[str] = None,
    sort_by: Optional[str] = "score",
    has_application: Optional[bool] = None,
    status_filter: Optional[str] = None,
    platform_id: Optional[int] = None,
    is_archived: bool = False,
):
    db = SessionLocal()
    try:
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == is_archived,
        )

        # Filtering
        if filter_type == "favorite":
            query = query.filter(JobEntry.is_favorite == True)
        elif filter_type == "no_favorite":
            query = query.filter(JobEntry.is_favorite == False)
        elif filter_type == "applications":
            query = query.filter(JobEntry.application_draft.isnot(None))

        if has_application is True:
            query = query.filter(JobEntry.application_draft.isnot(None))
        elif has_application is False:
            query = query.filter(JobEntry.application_draft.is_(None))

        if status_filter:
            query = query.filter(JobEntry.status == status_filter)

        if platform_id:
            query = query.filter(JobEntry.platform_id == platform_id)

        # Sorting
        if sort_by == "date":
            query = query.order_by(JobEntry.created_at.desc())
        else:
            query = query.order_by(JobEntry.match_score.desc())

        # Pagination (Backward Compatibility: if limit is None, return all)
        if limit is not None:
            query = query.offset(offset).limit(limit)
        else:
            query = query.limit(1000)

        return query.all()
    finally:
        db.close()


@app.get("/jobs/{job_id}")
def get_single_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "company_domain": job.company_domain,
            "description": job.description,
            "match_score": job.match_score,
            "reasoning": job.reasoning,
            "application_draft": job.application_draft,
            "interview_prep_material": job.interview_prep_material,
            "status": job.status,
            "url": job.url,
            "is_favorite": job.is_favorite,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "next_follow_up_at": (
                job.next_follow_up_at.isoformat() if job.next_follow_up_at else None
            ),
            "contact_persons": job.contact_persons,
            "recruiter_info": job.recruiter_info,
            "salary_benchmark": job.salary_benchmark,
            "notes": job.notes,
        }
    finally:
        db.close()


@app.post("/jobs/{job_id}/generate")
def trigger_generation(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.status = "GENERATING"
        db.commit()
        # Pass user_id to task so it can use correct profile
        celery_app.send_task(
            "ai.generate_application", args=[job_id, current_user.id], queue="ai_queue"
        )
        return {"status": "started"}
    finally:
        db.close()


@app.get("/jobs/{job_id}/download")
def download_application_pdf(
    job_id: str, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job or not job.application_draft:
            raise HTTPException(status_code=404, detail="Job or application not found")

        html_content = markdown.markdown(job.application_draft)

        styled_html = f"""
        <html>
        <head>
        <style>
            @page {{
                size: A4;
                margin: 2cm;
            }}
            body {{
                font-family: Helvetica, Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.5;
                color: #333333;
            }}
            h1, h2, h3 {{
                color: #111111;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
            }}
            p {{
                margin-bottom: 1em;
            }}
        </style>
        </head>
        <body>
        {html_content}
        </body>
        </html>
        """

        pdf_buffer = BytesIO()
        try:
            # Encoding as utf-8 and using BytesIO is safer for pisa
            pisa_status = pisa.CreatePDF(
                BytesIO(styled_html.encode("utf-8")), dest=pdf_buffer, encoding="utf-8"
            )

            if pisa_status.err:
                logger.error(f"Pisa PDF Error: {pisa_status.err}")
                raise HTTPException(
                    status_code=500, detail=f"Error generating PDF: {pisa_status.err}"
                )
        except Exception as e:
            logger.error(f"Critical PDF Generation Error for job {job_id}: {e}")
            raise HTTPException(
                status_code=500, detail="Internal error during PDF generation"
            )

        pdf_bytes = pdf_buffer.getvalue()

        company_clean = "".join(
            c for c in (job.company or "Job") if c.isalnum() or c in " -_"
        ).replace(" ", "_")
        headers = {
            "Content-Disposition": f'attachment; filename="Bewerbung_{company_clean}.pdf"'
        }
        return Response(
            content=pdf_bytes, media_type="application/pdf", headers=headers
        )
    finally:
        db.close()


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.is_archived = True
        db.commit()
        return {"status": "archived"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error archiving job: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


class BulkDeleteRequest(BaseModel):
    job_ids: List[str]


@app.post("/jobs/bulk-delete")
def delete_bulk_jobs(
    request: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        # Prevent massive accidental deletions or empty requests
        if not request.job_ids:
            return {"status": "success", "count": 0}

        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id, JobEntry.id.in_(request.job_ids)
        )

        archived_count = query.update({"is_archived": True}, synchronize_session=False)
        db.commit()
        return {"status": "archived", "count": archived_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Bulk-Archivieren der Jobs: {e}")
        raise HTTPException(
            status_code=500, detail="Datenbankfehler beim Bulk-Archivieren"
        )
    finally:
        db.close()


class StatusUpdateRequest(BaseModel):
    status: str


@app.patch("/jobs/{job_id}/update-status")
def update_job_status(
    job_id: str,
    request: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    logger.info(
        f"Updating status for job {job_id} to {request.status} for user {current_user.username}"
    )
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            logger.warning(f"Job {job_id} not found for user {current_user.username}")
            raise HTTPException(status_code=404, detail="Job not found")
        job.status = request.status
        db.commit()
        db.refresh(job)
        logger.info(f"Status updated successfully for job {job_id}")
        return {"status": "updated", "new_status": job.status}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


@app.patch("/jobs/{job_id}")
def patch_job(
    job_id: str,
    request: JobPatchRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        # Track status change for history
        if request.status is not None and request.status != job.status:
            history_entry = JobStatusHistory(
                job_id=job_id,
                from_status=job.status,
                to_status=request.status,
                changed_by=current_user.id,
                note=request.note,
            )
            db.add(history_entry)
            job.status = request.status

        if request.is_favorite is not None:
            job.is_favorite = request.is_favorite
        if request.company_domain is not None:
            job.company_domain = request.company_domain
        if request.contact_persons is not None:
            job.contact_persons = request.contact_persons
        if request.recruiter_info is not None:
            job.recruiter_info = request.recruiter_info
        if request.salary_benchmark is not None:
            job.salary_benchmark = request.salary_benchmark
        if request.next_follow_up_at is not None:
            from datetime import datetime

            job.next_follow_up_at = datetime.fromisoformat(request.next_follow_up_at)
        if request.notes is not None:
            job.notes = request.notes
        if request.application_draft is not None:
            job.application_draft = request.application_draft

        db.commit()
        db.refresh(job)
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error patching job: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


@app.get("/jobs/{job_id}/history")
def get_job_history(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        history = (
            db.query(JobStatusHistory)
            .filter(JobStatusHistory.job_id == job_id)
            .order_by(JobStatusHistory.changed_at.desc())
            .all()
        )
        return [
            {
                "id": h.id,
                "from_status": h.from_status,
                "to_status": h.to_status,
                "changed_at": h.changed_at.isoformat() if h.changed_at else None,
                "note": h.note,
            }
            for h in history
        ]
    finally:
        db.close()


@app.patch("/jobs/{job_id}/favorite")
def toggle_favorite(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.is_favorite = not job.is_favorite
        db.commit()
        db.refresh(job)
        return {"status": "updated", "is_favorite": job.is_favorite}
    except Exception as e:
        db.rollback()
        logger.error(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()


@app.get("/settings")
def get_settings(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
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
        return profile
    finally:
        db.close()


@app.post("/settings")
def save_settings(
    settings: SettingsData, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
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
        profile.cv_data = settings.cv_data.dict()
        profile.job_urls = settings.job_urls

        # Save Notification Settings
        profile.gmail_address = settings.gmail_address
        profile.gmail_app_password = settings.gmail_app_password
        profile.pushover_user_key = settings.pushover_user_key
        profile.pushover_api_token = settings.pushover_api_token
        profile.active_notification_service = settings.active_notification_service

        db.commit()
        return {"status": "saved"}
    finally:
        db.close()


@app.post("/notification-settings")
def save_notification_settings(
    settings: NotificationSettingsData, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if not profile:
            profile = UserProfile(user_id=current_user.id)
            db.add(profile)
        profile.gmail_address = settings.gmail_address
        profile.gmail_app_password = settings.gmail_app_password
        profile.pushover_user_key = settings.pushover_user_key
        profile.pushover_api_token = settings.pushover_api_token
        db.commit()
        return {"status": "saved"}
    finally:
        db.close()


@app.delete("/settings")
def delete_settings(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if profile:
            db.delete(profile)
            db.commit()
            return {"status": "deleted"}
        else:
            raise HTTPException(status_code=404, detail="Profil nicht gefunden")
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Löschen der Einstellungen: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()


@app.delete("/jobs")
def delete_all_jobs(
    keep_favorites: bool = True,
    keep_applications: bool = True,
    company: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        query = db.query(JobEntry).filter(JobEntry.user_id == current_user.id)
        if company:
            query = query.filter(JobEntry.company == company)
        if keep_favorites:
            query = query.filter(JobEntry.is_favorite == False)
        if keep_applications:
            query = query.filter(JobEntry.status == "OPEN")
        query = query.filter(JobEntry.is_archived == False)

        archived_count = query.update({"is_archived": True}, synchronize_session=False)
        db.commit()
        return {"status": "archived", "count": archived_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Archivieren der Jobs: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()


@app.delete("/user/reset")
def reset_user_data(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        jobs_deleted = (
            db.query(JobEntry).filter(JobEntry.user_id == current_user.id).delete()
        )
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        profile_deleted = False
        if profile:
            db.delete(profile)
            profile_deleted = True
        db.commit()
        return {
            "status": "reset complete",
            "jobs_deleted": jobs_deleted,
            "profile_deleted": profile_deleted,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Reset der Benutzerdaten: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()


@app.get("/platforms", response_model=List[PlatformResponse])
def get_platforms(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        from sqlalchemy import func

        # Subquery to count jobs per platform
        job_counts = (
            db.query(JobEntry.platform_id, func.count(JobEntry.id).label("job_count"))
            .filter(JobEntry.user_id == current_user.id)
            .group_by(JobEntry.platform_id)
            .subquery()
        )

        platforms_query = (
            db.query(
                JobPlatform, func.coalesce(job_counts.c.job_count, 0).label("job_count")
            )
            .outerjoin(job_counts, JobPlatform.id == job_counts.c.platform_id)
            .filter(JobPlatform.user_id == current_user.id)
            .all()
        )

        result = []
        for p, count in platforms_query:
            result.append(
                {
                    "id": p.id,
                    "url": p.url,
                    "name": p.name,
                    "favicon_url": p.favicon_url,
                    "crawl_interval_minutes": p.crawl_interval_minutes,
                    "last_crawl_at": (
                        p.last_crawl_at.isoformat() if p.last_crawl_at else None
                    ),
                    "is_active": p.is_active,
                    "is_notification_enabled": p.is_notification_enabled,
                    "notification_adapters": p.notification_adapters or [],
                    "gmail_template": p.gmail_template,
                    "gmail_recipients": p.gmail_recipients,
                    "job_count": count,
                }
            )
        return result
    finally:
        db.close()


@app.post("/platforms", response_model=PlatformResponse)
def create_platform(
    platform: PlatformCreate, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        # Check for duplicates
        existing = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.user_id == current_user.id, JobPlatform.url == platform.url
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Platform URL already exists")

        # Basic name extraction from URL
        from urllib.parse import urlparse

        domain = urlparse(platform.url).netloc
        name = domain.replace("www.", "")

        # Favicon URL (using Google's service)
        favicon_url = f"https://www.google.com/s2/favicons?sz=64&domain={domain}"

        db_platform = JobPlatform(
            user_id=current_user.id,
            url=platform.url,
            name=name,
            favicon_url=favicon_url,
            crawl_interval_minutes=platform.crawl_interval_minutes,
        )
        db.add(db_platform)
        db.commit()
        db.refresh(db_platform)
        return {
            **db_platform.__dict__,
            "job_count": 0,
            "notification_adapters": db_platform.notification_adapters or [],
        }
    finally:
        db.close()


@app.patch("/platforms/{platform_id}", response_model=PlatformResponse)
def update_platform(
    platform_id: int,
    platform_update: PlatformUpdate,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        if platform_update.crawl_interval_minutes is not None:
            db_platform.crawl_interval_minutes = platform_update.crawl_interval_minutes
        if platform_update.is_active is not None:
            db_platform.is_active = platform_update.is_active
        if platform_update.is_notification_enabled is not None:
            db_platform.is_notification_enabled = (
                platform_update.is_notification_enabled
            )
        if platform_update.notification_adapters is not None:
            db_platform.notification_adapters = platform_update.notification_adapters
            db_platform.is_notification_enabled = (
                len(platform_update.notification_adapters) > 0
            )
        if "gmail_template" in platform_update.__fields_set__:
            db_platform.gmail_template = platform_update.gmail_template or None
        if "gmail_recipients" in platform_update.__fields_set__:
            db_platform.gmail_recipients = platform_update.gmail_recipients or None

        db.commit()
        db.refresh(db_platform)

        # Get job count
        job_count = (
            db.query(JobEntry).filter(JobEntry.platform_id == db_platform.id).count()
        )

        return {
            "id": db_platform.id,
            "url": db_platform.url,
            "name": db_platform.name,
            "favicon_url": db_platform.favicon_url,
            "crawl_interval_minutes": db_platform.crawl_interval_minutes,
            "last_crawl_at": (
                db_platform.last_crawl_at.isoformat()
                if db_platform.last_crawl_at
                else None
            ),
            "is_active": db_platform.is_active,
            "is_notification_enabled": db_platform.is_notification_enabled,
            "notification_adapters": db_platform.notification_adapters or [],
            "gmail_template": db_platform.gmail_template,
            "gmail_recipients": db_platform.gmail_recipients,
            "job_count": job_count,
        }
    finally:
        db.close()


class GmailTestRequest(BaseModel):
    recipients: Optional[List[str]] = None
    template: Optional[str] = None


@app.post("/platforms/{platform_id}/test-gmail")
def test_gmail_notification(
    platform_id: int,
    body: GmailTestRequest = GmailTestRequest(),
    current_user: User = Depends(get_current_user),
):
    from worker import _send_via_gmail_batch

    db = SessionLocal()
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.gmail_address or not profile.gmail_app_password:
            raise HTTPException(status_code=400, detail="Gmail credentials not configured")

        # Allow caller to override recipients and template without saving
        class _PlatformProxy:
            gmail_recipients = body.recipients if body.recipients is not None else platform.gmail_recipients
            gmail_template = body.template if body.template is not None else platform.gmail_template

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"

        _send_via_gmail_batch([_FakeJob()], profile, _PlatformProxy())
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-gmail failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/platforms/{platform_id}/test-pushover")
def test_pushover_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
):
    from worker import _send_via_pushover

    db = SessionLocal()
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.pushover_user_key or not profile.pushover_api_token:
            raise HTTPException(status_code=400, detail="Pushover credentials not configured")

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"

        if not _send_via_pushover(_FakeJob(), profile):
            raise HTTPException(status_code=500, detail="Pushover delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-pushover failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    delete_listings: bool = False,
    keep_favorites: bool = True,
    keep_applications: bool = True,
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func

    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        # Get all domains associated with the platform's jobs
        domains_to_check = [
            row[0]
            for row in db.query(JobEntry.company_domain)
            .filter(JobEntry.platform_id == platform_id)
            .distinct()
            .all()
            if row[0]
        ]

        # Delete job status history for these jobs
        job_ids_subquery = (
            db.query(JobEntry.id).filter(JobEntry.platform_id == platform_id).subquery()
        )
        db.query(JobStatusHistory).filter(
            JobStatusHistory.job_id.in_(job_ids_subquery)
        ).delete(synchronize_session=False)

        # Delete all jobs of this platform unconditionally
        query = db.query(JobEntry).filter(JobEntry.platform_id == platform_id)
        query.delete(synchronize_session=False)

        # Delete company profiles that were ONLY associated with these jobs
        for domain in domains_to_check:
            other_jobs_using_domain = (
                db.query(func.count(JobEntry.id))
                .filter(JobEntry.company_domain == domain)
                .scalar()
            )
            if other_jobs_using_domain == 0:
                db.query(CompanyProfile).filter(CompanyProfile.domain == domain).delete(
                    synchronize_session=False
                )

        db.delete(db_platform)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@app.delete("/platforms/{platform_id}/jobs")
def delete_platform_jobs(
    platform_id: int,
    keep_favorites: bool = True,
    keep_applications: bool = True,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        # Verify platform belongs to user
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        query = db.query(JobEntry).filter(JobEntry.platform_id == platform_id)
        if keep_favorites:
            query = query.filter(JobEntry.is_favorite == False)
        if keep_applications:
            query = query.filter(JobEntry.status == "OPEN")

        deleted_count = query.delete()

        db.commit()
        return {"status": "deleted", "deleted_count": deleted_count}
    finally:
        db.close()


@app.post("/platforms/{platform_id}/crawl")
def trigger_platform_crawl(
    platform_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        if not db_platform.is_active:
            raise HTTPException(status_code=400, detail="Platform is deactivated")

        is_initial_run = db_platform.last_crawl_at is None

        # Trigger scraper-service
        from sqlalchemy import func

        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper")
        logger.info(f"Triggering scraper at: {SCRAPER_URL}/search")
        try:
            resp = requests.post(
                f"{SCRAPER_URL}/search",
                json={
                    "query": db_platform.url,
                    "location": "Remote",
                    "user_id": current_user.id,
                    "platform_id": db_platform.id,
                    "is_initial_run": is_initial_run,
                },
                timeout=5,
            )
            resp.raise_for_status()

            # Update last_crawl_at
            db_platform.last_crawl_at = func.now()
            db.commit()

            return resp.json()
        except Exception as e:
            logger.error(f"Failed to trigger scraper: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to trigger crawler service"
            )
    finally:
        db.close()


@app.get("/statistics")
def get_statistics(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        q = db.query(JobEntry).filter(JobEntry.user_id == current_user.id)
        total_jobs = q.count()
        applied_jobs = q.filter(JobEntry.status == "APPLIED").count()
        interviews = q.filter(JobEntry.status == "INTERVIEW").count()
        offers = q.filter(JobEntry.status == "OFFER").count()
        rejected = q.filter(JobEntry.status == "REJECTED").count()
        return {
            "total_jobs": total_jobs,
            "applied_jobs": applied_jobs,
            "interviews": interviews,
            "offers": offers,
            "rejected": rejected,
        }
    finally:
        db.close()


@app.get("/companies/{domain}")
def get_company_profile(domain: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if not company:
            raise HTTPException(status_code=404, detail="Company profile not found")
        return {
            "id": company.id,
            "domain": company.domain,
            "name": company.name,
            "description": company.description,
            "culture_summary": company.culture_summary,
            "review_score": company.review_score,
            "review_source": company.review_source,
            "salary_benchmark": company.salary_benchmark,
            "tech_stack": company.tech_stack,
            "key_artifacts": (
                company.raw_data.get("key_artifacts", []) if company.raw_data else []
            ),
            "swot_analysis": (
                company.raw_data.get("swot_analysis") if company.raw_data else None
            ),
            "comprehensive_report": (
                company.raw_data.get("comprehensive_report")
                if company.raw_data
                else None
            ),
            "key_benefits": (
                company.raw_data.get("key_benefits", []) if company.raw_data else []
            ),
            "red_flags": (
                company.raw_data.get("red_flags", []) if company.raw_data else []
            ),
            "company_intelligence": (
                company.raw_data.get("company_intelligence")
                if company.raw_data
                else None
            ),
            "analyzed_at": (
                company.analyzed_at.isoformat() if company.analyzed_at else None
            ),
        }
    finally:
        db.close()


@app.post("/companies/{domain}/analyze")
def analyze_company(
    domain: str,
    request: CompanyAnalyzeRequest = CompanyAnalyzeRequest(),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if company and not request.force_refresh:
            return {
                "status": "exists",
                "domain": domain,
                "message": "Profile already exists. Use force_refresh=true to regenerate.",
            }
        celery_app.send_task(
            "worker.generate_company_profile",
            args=[domain, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "domain": domain,
            "message": "Company profile analysis started",
        }
    finally:
        db.close()


@app.post("/jobs/{job_id}/interview-prep")
async def generate_interview_prep_endpoint(
    job_id: str, current_user: User = Depends(get_current_user)
):
    """Triggert AI-Generierung von Interview-Vorbereitung als Background Task."""
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.interview_prep_material:
            return {
                "status": "exists",
                "message": "Interview prep already generated",
                "job_id": job_id,
            }

        # Queue Celery task
        celery_app.send_task(
            "worker.generate_interview_prep_task",
            args=[job_id, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "message": "Interview prep generation started",
            "job_id": job_id,
        }
    finally:
        db.close()


@app.post("/jobs/{job_id}/interview-prep/regenerate")
async def regenerate_interview_prep_endpoint(
    job_id: str, current_user: User = Depends(get_current_user)
):
    """Erzwingt Neugeneration."""
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        celery_app.send_task(
            "worker.generate_interview_prep_task",
            args=[job_id, current_user.id],
            queue="ai_queue",
        )
        return {
            "status": "queued",
            "message": "Interview prep regeneration started",
            "job_id": job_id,
        }
    finally:
        db.close()


@app.get("/dashboard-data")
def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    limit: Optional[int] = 10,
    offset: int = 0,
    filter_type: Optional[str] = "all",
    sort_by: Optional[str] = "score",
    has_application: Optional[bool] = None,
    status_filter: Optional[str] = None,
):
    """
    Combined endpoint for Dashboard:
    1. Jobs list
    2. System status (crawling boolean)
    3. Active crawls (from scraper-service)
    """
    db = SessionLocal()
    try:
        # 1. Fetch Jobs
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == False,
        )
        if filter_type == "favorite":
            query = query.filter(JobEntry.is_favorite == True)
        elif filter_type == "no_favorite":
            query = query.filter(JobEntry.is_favorite == False)
        elif filter_type == "applications":
            query = query.filter(JobEntry.application_draft.isnot(None))

        if has_application is True:
            query = query.filter(JobEntry.application_draft.isnot(None))
        elif has_application is False:
            query = query.filter(JobEntry.application_draft.is_(None))

        if status_filter:
            query = query.filter(JobEntry.status == status_filter)

        if sort_by == "date":
            query = query.order_by(JobEntry.created_at.desc())
        else:
            query = query.order_by(JobEntry.match_score.desc())
        jobs = query.offset(offset).limit(limit).all()

        # 2. Fetch System Status
        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        try:
            r = redis_sync.from_url(redis_url, decode_responses=True)
            is_crawling = bool(r.get("system:crawling"))
        except Exception as e:
            logger.error(f"Redis error: {e}")
            is_crawling = False

        # 3. Fetch Scraper Status (Active Crawls)
        active_crawls = []
        try:
            SCRAPER_URL = os.getenv(
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper"
            )
            res = requests.get(
                f"{SCRAPER_URL}/crawl-status?user_id={current_user.id}", timeout=2
            )
            if res.ok:
                data = res.json()
                if "jobs" in data:
                    active_crawls = data["jobs"]
        except Exception as e:
            logger.error(f"Scraper service error: {e}")

        return {
            "jobs": jobs,
            "system_crawling": is_crawling,
            "active_crawls": active_crawls,
        }
    finally:
        db.close()


@app.get("/settings-view")
def get_settings_view(current_user: User = Depends(get_current_user)):
    """
    Combined endpoint for Settings Page:
    1. User Profile
    2. Platforms list (with counts)
    3. Crawl Status
    """
    db = SessionLocal()
    try:
        # 1. Profile
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if not profile:
            # Create default if missing
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

        # 2. Platforms
        from sqlalchemy import func

        job_counts = (
            db.query(JobEntry.platform_id, func.count(JobEntry.id).label("job_count"))
            .filter(JobEntry.user_id == current_user.id)
            .group_by(JobEntry.platform_id)
            .subquery()
        )

        platforms_query = (
            db.query(
                JobPlatform, func.coalesce(job_counts.c.job_count, 0).label("job_count")
            )
            .outerjoin(job_counts, JobPlatform.id == job_counts.c.platform_id)
            .filter(JobPlatform.user_id == current_user.id)
            .all()
        )

        platforms_data = []
        for p, count in platforms_query:
            platforms_data.append(
                {
                    "id": p.id,
                    "url": p.url,
                    "name": p.name,
                    "favicon_url": p.favicon_url,
                    "crawl_interval_minutes": p.crawl_interval_minutes,
                    "last_crawl_at": (
                        p.last_crawl_at.isoformat() if p.last_crawl_at else None
                    ),
                    "is_active": p.is_active,
                    "is_notification_enabled": p.is_notification_enabled,
                    "notification_adapters": p.notification_adapters or [],
                    "gmail_template": p.gmail_template,
                    "gmail_recipients": p.gmail_recipients,
                    "job_count": count,
                }
            )

        # 3. Crawl Status (Active Crawls)
        active_crawls = []
        try:
            SCRAPER_URL = os.getenv(
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper"
            )
            res = requests.get(
                f"{SCRAPER_URL}/crawl-status?user_id={current_user.id}", timeout=2
            )
            if res.ok:
                data = res.json()
                if "jobs" in data:
                    active_crawls = data["jobs"]
        except Exception as e:
            logger.error(f"Scraper service error: {e}")

        return {
            "profile": profile,
            "platforms": platforms_data,
            "active_crawls": active_crawls,
        }
    finally:
        db.close()

    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )

        if not job or not job.application_draft:
            raise HTTPException(status_code=404, detail="Kein Anschreiben gefunden")

        html_content = markdown.markdown(job.application_draft)

        today_str = date.today().strftime("%d.%m.%Y")
        applicant_name = "Dein Name"

        full_html = f"""
        <html>
        <head>
            <style>
                @page {{
                    size: A4;
                    margin: 2.5cm 2cm 2cm 2.5cm; /* Standard Rand */
                }}
                body {{
                    font-family: Helvetica, Arial, sans-serif;
                    font-size: 11pt;
                    line-height: 1.5;
                    color: #000;
                }}
                .header {{
                    margin-bottom: 2cm;
                    font-size: 9pt;
                    color: #555;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 10px;
                }}
                .sender {{
                    font-size: 8pt;
                    text-decoration: underline;
                    margin-bottom: 1cm;
                }}
                .meta {{
                    text-align: right;
                    margin-bottom: 1cm;
                }}
                .address {{
                    margin-bottom: 2cm;
                    font-size: 11pt;
                }}
                .subject {{
                    font-weight: bold;
                    margin-bottom: 1cm;
                    font-size: 12pt;
                }}
                .content {{
                    text-align: justify;
                }}
            </style>
        </head>
        <body>
            <div class="sender">{applicant_name} • Musterstraße 1 • 12345 Musterstadt</div>

            <div class="meta">
                {profile.location if profile else "Musterstadt"}, den {today_str}
            </div>

            <div class="address">
                {job.company}<br>
                Personalabteilung<br>
                (Adresse unbekannt)
            </div>

            <div class="content">
                {html_content}
            </div>
        </body>
        </html>
        """

        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(src=full_html, dest=pdf_buffer)

        if pisa_status.err:
            raise HTTPException(status_code=500, detail="PDF Fehler")

        pdf_buffer.seek(0)

        filename = f"Bewerbung_{job.title.replace(' ', '_')}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    finally:
        db.close()


@app.post("/settings/upload-cv")
async def upload_cv(
    file: UploadFile = File(...), current_user: User = Depends(get_current_user)
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

    db = SessionLocal()
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
    finally:
        db.close()


class AdminWipeRequest(BaseModel):
    password: str
    wipe_all_users: bool = False


@app.post("/admin/database/wipe")
def wipe_database(
    request: AdminWipeRequest, current_user: User = Depends(get_current_admin_user)
):
    from sqlalchemy import func

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(request.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Falsches Passwort")

        if request.wipe_all_users:
            # Delete EVERYTHING (Jobs, History, Platforms, Companies, Patterns)
            db.query(JobStatusHistory).delete(synchronize_session=False)
            db.query(JobEntry).delete(synchronize_session=False)
            db.query(JobPlatform).delete(synchronize_session=False)
            db.query(CompanyProfile).delete(synchronize_session=False)
            db.query(DomainUrlPattern).delete(synchronize_session=False)
        else:
            # Delete ONLY for admin user
            admin_id = current_user.id

            # History
            job_ids = db.query(JobEntry.id).filter(JobEntry.user_id == admin_id)
            db.query(JobStatusHistory).filter(
                JobStatusHistory.job_id.in_(job_ids)
            ).delete(synchronize_session=False)

            # Jobs
            db.query(JobEntry).filter(JobEntry.user_id == admin_id).delete(
                synchronize_session=False
            )

            # Platforms
            db.query(JobPlatform).filter(JobPlatform.user_id == admin_id).delete(
                synchronize_session=False
            )

            # Delete unused companies
            active_domains = db.query(JobEntry.company_domain).distinct()
            db.query(CompanyProfile).filter(
                CompanyProfile.domain.notin_(active_domains)
            ).delete(synchronize_session=False)

            # Delete unused URL patterns
            from urllib.parse import urlparse

            active_urls = db.query(JobPlatform.url).all()
            active_platform_domains = [
                urlparse(u[0]).netloc for u in active_urls if u[0]
            ]
            if active_platform_domains:
                db.query(DomainUrlPattern).filter(
                    DomainUrlPattern.domain.notin_(active_platform_domains)
                ).delete(synchronize_session=False)
            else:
                db.query(DomainUrlPattern).delete(synchronize_session=False)

        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Wipe Error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Datenbankfehler beim Löschen")
    finally:
        db.close()


# ── JOB DOCUMENTS ──────────────────────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@app.post("/jobs/{job_id}/documents")
async def upload_job_document(
    job_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

        mime = file.content_type or "application/octet-stream"
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415, detail=f"File type not allowed: {mime}"
            )

        import uuid

        ext = os.path.splitext(file.filename or "file")[1]
        stored_filename = f"{uuid.uuid4().hex}{ext}"
        upload_path = os.path.join(UPLOAD_DIR, str(current_user.id), job_id)
        os.makedirs(upload_path, exist_ok=True)
        file_path = os.path.join(upload_path, stored_filename)
        with open(file_path, "wb") as f:
            f.write(content)

        doc = JobDocument(
            job_id=job_id,
            user_id=current_user.id,
            filename=stored_filename,
            original_filename=file.filename or stored_filename,
            file_size=len(content),
            mime_type=mime,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Document upload error: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")
    finally:
        db.close()


@app.get("/jobs/{job_id}/documents")
def list_job_documents(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        docs = (
            db.query(JobDocument)
            .filter(JobDocument.job_id == job_id)
            .order_by(JobDocument.uploaded_at.desc())
            .all()
        )
        return [
            {
                "id": d.id,
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            }
            for d in docs
        ]
    finally:
        db.close()


@app.get("/jobs/{job_id}/documents/{doc_id}/download")
def download_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        file_path = os.path.join(UPLOAD_DIR, str(current_user.id), job_id, doc.filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        with open(file_path, "rb") as f:
            data = f.read()
        from fastapi.responses import Response as FastAPIResponse

        return FastAPIResponse(
            content=data,
            media_type=doc.mime_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{doc.original_filename}"'
            },
        )
    finally:
        db.close()


@app.get("/jobs/{job_id}/documents/{doc_id}/view")
def view_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        file_path = os.path.join(UPLOAD_DIR, str(current_user.id), job_id, doc.filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        with open(file_path, "rb") as f:
            data = f.read()
        from fastapi.responses import Response as FastAPIResponse

        return FastAPIResponse(
            content=data,
            media_type=doc.mime_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'inline; filename="{doc.original_filename}"'
            },
        )
    finally:
        db.close()


@app.delete("/jobs/{job_id}/documents/{doc_id}")
def delete_job_document(
    job_id: str, doc_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        doc = (
            db.query(JobDocument)
            .filter(
                JobDocument.id == doc_id,
                JobDocument.job_id == job_id,
                JobDocument.user_id == current_user.id,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        file_path = os.path.join(UPLOAD_DIR, str(current_user.id), job_id, doc.filename)
        if os.path.exists(file_path):
            os.remove(file_path)
        db.delete(doc)
        db.commit()
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Document delete error: {e}")
        raise HTTPException(status_code=500, detail="Delete failed")
    finally:
        db.close()
