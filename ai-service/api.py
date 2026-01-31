import os
import json
import logging
import io
import asyncio
from datetime import date
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, status
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm

import redis.asyncio as redis_async
import redis as redis_sync
from openai import OpenAI
from pypdf import PdfReader
import markdown
from xhtml2pdf import pisa
from io import BytesIO
from sqlalchemy.orm import Session

from celery_config import celery_app
from database import SessionLocal, JobEntry, UserProfile, SettingsData, CVDataModel, User, JobPlatform, PlatformCreate, PlatformUpdate, PlatformResponse
from auth import (
    create_access_token,
    get_current_user,
    get_current_admin_user,
    verify_password,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta
# Note: tasks are referenced by name strings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    
    # Create Default Admin
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            logger.info("Create default admin user (admin/admin)")
            hashed_pwd = get_password_hash("admin")
            admin_user = User(username="admin", hashed_password=hashed_pwd, is_admin=True)
            db.add(admin_user)
            db.commit()
    except Exception as e:
        logger.error(f"Error creating default admin: {e}")
    finally:
        db.close()

    yield
    task.cancel()
    
app = FastAPI(lifespan=lifespan)

allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

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
        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free",
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.0
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "")
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI Parse Error: {e}")
        return None

@app.post("/auth/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == form_data.username).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        db.close()

@app.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user)
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
    skip: int = 0, limit: int = 100, 
    current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        users = db.query(User).offset(skip).limit(limit).all()
        return users
    finally:
        db.close()

@app.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate, 
    current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.username == user.username).first()
        if db_user:
            raise HTTPException(status_code=400, detail="Username already registered")
        hashed_password = get_password_hash(user.password)
        new_user = User(username=user.username, hashed_password=hashed_password, is_admin=False)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    finally:
        db.close()

@app.delete("/users/{user_id}")
async def delete_user(
    user_id: int, 
    current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
             raise HTTPException(status_code=404, detail="User not found")
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

@app.get("/jobs")
def get_jobs(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        return db.query(JobEntry).filter(JobEntry.user_id == current_user.id).order_by(JobEntry.match_score.desc()).all()
    finally:
        db.close()

@app.post("/jobs/{job_id}/generate")
def trigger_generation(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.status = "GENERATING"
        db.commit()
        # Pass user_id to task so it can use correct profile
        celery_app.send_task("ai.generate_application", args=[job_id, current_user.id], queue="ai_queue")
        return {"status": "started"}
    finally:
        db.close()

@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        db.delete(job)
        db.commit()
        return {"status": "deleted"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting job: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        db.close()

@app.patch("/jobs/{job_id}/favorite")
def toggle_favorite(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id).first()
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
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile:
            profile = UserProfile(
                user_id=current_user.id,
                cv_data={"experience": [], "projects": [], "education": ""}, 
                job_urls=[]
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
        return profile
    finally:
        db.close()

@app.post("/settings")
def save_settings(settings: SettingsData, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
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
        
        db.commit()
        return {"status": "saved"}
    finally:
        db.close()

@app.delete("/settings")
def delete_settings(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
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
def delete_all_jobs(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        deleted_count = db.query(JobEntry).filter(JobEntry.user_id == current_user.id).delete()
        db.commit()
        return {"status": "deleted", "count": deleted_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Löschen der Jobs: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()

@app.delete("/user/reset")
def reset_user_data(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        jobs_deleted = db.query(JobEntry).filter(JobEntry.user_id == current_user.id).delete()
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        profile_deleted = False
        if profile:
            db.delete(profile)
            profile_deleted = True
        db.commit()
        return {"status": "reset complete", "jobs_deleted": jobs_deleted, "profile_deleted": profile_deleted}
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
        job_counts = db.query(
            JobEntry.platform_id, 
            func.count(JobEntry.id).label('job_count')
        ).filter(JobEntry.user_id == current_user.id).group_by(JobEntry.platform_id).subquery()

        platforms_query = db.query(
            JobPlatform,
            func.coalesce(job_counts.c.job_count, 0).label('job_count')
        ).outerjoin(
            job_counts, JobPlatform.id == job_counts.c.platform_id
        ).filter(JobPlatform.user_id == current_user.id).all()

        result = []
        for p, count in platforms_query:
            result.append({
                "id": p.id,
                "url": p.url,
                "name": p.name,
                "favicon_url": p.favicon_url,
                "crawl_interval_minutes": p.crawl_interval_minutes,
                "last_crawl_at": p.last_crawl_at.isoformat() if p.last_crawl_at else None,
                "is_active": p.is_active,
                "job_count": count
            })
        return result
    finally:
        db.close()

@app.post("/platforms", response_model=PlatformResponse)
def create_platform(platform: PlatformCreate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Check for duplicates
        existing = db.query(JobPlatform).filter(
            JobPlatform.user_id == current_user.id,
            JobPlatform.url == platform.url
        ).first()
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
            crawl_interval_minutes=platform.crawl_interval_minutes
        )
        db.add(db_platform)
        db.commit()
        db.refresh(db_platform)
        return {**db_platform.__dict__, "job_count": 0}
    finally:
        db.close()

@app.patch("/platforms/{platform_id}", response_model=PlatformResponse)
def update_platform(platform_id: int, platform_update: PlatformUpdate, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        db_platform = db.query(JobPlatform).filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        ).first()
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        if platform_update.crawl_interval_minutes is not None:
            db_platform.crawl_interval_minutes = platform_update.crawl_interval_minutes
        if platform_update.is_active is not None:
            db_platform.is_active = platform_update.is_active

        db.commit()
        db.refresh(db_platform)
        
        # Get job count
        job_count = db.query(JobEntry).filter(JobEntry.platform_id == db_platform.id).count()
        return {**db_platform.__dict__, "job_count": job_count}
    finally:
        db.close()

@app.delete("/platforms/{platform_id}")
def delete_platform(platform_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        db_platform = db.query(JobPlatform).filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        ).first()
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        # Set platform_id to NULL in jobs
        db.query(JobEntry).filter(JobEntry.platform_id == platform_id).update({"platform_id": None})
        
        db.delete(db_platform)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()

@app.post("/platforms/{platform_id}/crawl")
def trigger_platform_crawl(platform_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        db_platform = db.query(JobPlatform).filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        ).first()
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        # Trigger scraper-service
        import requests
        from sqlalchemy import func
        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://scraper-service:8080")
        try:
            resp = requests.post(
                f"{SCRAPER_URL}/search",
                json={
                    "query": db_platform.url,
                    "location": "Remote", 
                    "user_id": current_user.id,
                    "platform_id": db_platform.id 
                },
                timeout=5
            )
            resp.raise_for_status()
            
            # Update last_crawl_at
            db_platform.last_crawl_at = func.now()
            db.commit()
            
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to trigger scraper: {e}")
            raise HTTPException(status_code=500, detail="Failed to trigger crawler service")
    finally:
        db.close()


@app.get("/jobs/{job_id}/download")
def download_application_pdf(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id).first()
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        
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
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    finally:
        db.close()

@app.post("/settings/upload-cv")
async def upload_cv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Nur PDF Dateien erlaubt.")

    content = await file.read()
    text = extract_text_from_pdf(content)
    
    if len(text) < 50:
        raise HTTPException(status_code=400, detail="Konnte keinen Text aus dem PDF lesen (evtl. Bild-Scan?).")

    parsed_data = parse_cv_with_ai(text)
    
    if not parsed_data:
         raise HTTPException(status_code=500, detail="AI konnte CV nicht verarbeiten.")

    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile:
            profile = UserProfile(user_id=current_user.id)
            db.add(profile)
        
        profile.role = parsed_data.get("role", profile.role)
        profile.skills = parsed_data.get("skills", profile.skills)
        if parsed_data.get("min_salary"): profile.min_salary = parsed_data.get("min_salary")
        if parsed_data.get("location"): profile.location = parsed_data.get("location")
        
        profile.cv_data = parsed_data.get("cv_data", {})
        
        db.commit()
        return {"status": "success", "data": parsed_data}
    
    except Exception as e:
        logger.error(f"DB Save Error: {e}")
        raise HTTPException(status_code=500, detail="Datenbank Fehler")
    finally:
        db.close()

@app.get("/reset")
def reset_db(current_user: User = Depends(get_current_admin_user)):
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Löscht Jobs UND User Settings
        db.query(JobEntry).delete()
        db.query(UserProfile).delete()
        db.commit()
        return {"status": "cleared (jobs & settings)"}
    except Exception as e:
        logger.error(f"Reset Error: {e}")
        db.rollback()
        return {"status": "error"}
    finally:
        db.close()
