from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, Float, Integer, JSON, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func
from celery import Celery
from openai import OpenAI
import os
import json
import logging
from typing import List, Optional
import markdown
from xhtml2pdf import pisa
from io import BytesIO
from fastapi.responses import StreamingResponse
from datetime import date
from fastapi import UploadFile, File
import io
from pypdf import PdfReader
import redis.asyncio as redis_async 
import redis as redis_sync
from contextlib import asynccontextmanager
from fastapi import WebSocket, WebSocketDisconnect
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

celery_app = Celery(
    'ai_worker',
    broker=os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@rabbitmq:5672//"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
)

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starte Redis Listener Task...")
    task = asyncio.create_task(redis_listener())
    yield
    task.cancel()
    
app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def format_cv_for_prompt(cv_json):
    if not cv_json:
        return "Keine detaillierte Erfahrung angegeben."
    
    text = "BERUFLICHE ERFAHRUNG:\n"
    for exp in cv_json.get("experience", []):
        text += f"- {exp['role']} bei {exp['company']} ({exp['duration']}): {exp['description']}\n"
    
    text += "\nPROJEKTE:\n"
    for proj in cv_json.get("projects", []):
        text += f"- {proj['name']} (Tech: {proj['tech_stack']}): {proj['description']}\n"
        
    text += f"\nAUSBILDUNG:\n{cv_json.get('education', '')}"
    return text

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

@celery_app.task(name="ai.filter_urls")
def filter_urls_task(args):
    if not args: return []
    base_url, urls_list = args
    urls_to_check = urls_list[:60]
    try:
        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free",
            messages=[
                {"role": "system", "content": "Du bist ein Crawler-Filter. Gib NUR ein JSON Array mit relevanten Job-Detail-URLs zurück."},
                {"role": "user", "content": f"Basis: {base_url}. Liste: {json.dumps(urls_to_check)}"}
            ],
            temperature=0.0
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "")
        return json.loads(content)
    except Exception as e:
        logger.error(f"Filter Error: {e}")
        return []

@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    logger.info(f"[TASK] Analyzing: {job_data['title']}")
    db = SessionLocal()
    r = redis_sync.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    try:
        if db.query(JobEntry).filter(JobEntry.id == job_data['id']).first():
            return
        
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if profile:
            cv_text = format_cv_for_prompt(profile.cv_data)
            profile_str = f"Rolle: {profile.role}, Skills: {profile.skills}\nDetails:\n{cv_text}"
        else:
            profile_str = "Python Dev"

        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free", 
            messages=[
                {"role": "system", "content": "Antworte NUR JSON: { 'score': 0-100, 'reason_de': '...' }"}, 
                {"role": "user", "content": f"Job: {job_data['title']} \n {job_data['description'][:3000]} \n User: {profile_str}"}
            ],
            temperature=0.0
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "")
        data = json.loads(content)
        
        db_job = JobEntry(
            id=job_data['id'], 
            title=job_data['title'], 
            company=job_data['company'], 
            description=job_data['description'], 
            match_score=float(data.get("score", 0)), 
            url=job_data.get('url'),
            reasoning=data.get("reason_de", ""),
            application_draft=None,
            status="OPEN"
        )
        
        db.add(db_job)
        db.commit()

        payload = json.dumps({
            "type": "new_job",
            "job": {
                "id": db_job.id,
                "title": db_job.title,
                "company": db_job.company,
                "description": db_job.description,
                "match_score": db_job.match_score,
                "reasoning": db_job.reasoning,
                "url": db_job.url,
                "status": "OPEN",
                "created_at": db_job.created_at.isoformat() if db_job.created_at else None
            }
        })
        
        r.publish("job_updates", payload)
        logger.info(f"✅ WebSocket Event 'new_job' gesendet für {db_job.title}")

    except Exception as e:
        logger.error(f"Analyze Error: {e}")
        db.rollback()
    finally:
        db.close()

@celery_app.task(name="ai.generate_application")
def generate_application_task(job_id):
    logger.info(f"[TASK] Generiere Anschreiben für Job: {job_id}")
    db = SessionLocal()
    r = redis_sync.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"FEHLER: Job ID {job_id} nicht in DB gefunden!")
            return

        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if not profile:
            error_msg = "Profil unvollständig. Bitte in den Einstellungen Lebenslauf hinterlegen."
            logger.error(f"error_msg: {error_msg}")
            
            r.publish("job_updates", json.dumps({
                "type": "global_error",
                "message": error_msg
            }))
            
            r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
            return
        
        logger.info(f"Daten geladen. Job: {job.title}, User: {profile.role}")

        cv_text = format_cv_for_prompt(profile.cv_data)
        
        system_prompt = """
        Du bist ein professioneller Karriere-Coach. Schreibe ein überzeugendes Anschreiben.
        Nutze Markdown.
        """
        
        user_prompt = f"""
        STELLENANZEIGE: {job.title} bei {job.company}
        {job.description[:2000]}
        
        BEWERBER: {profile.role}
        {cv_text}
        """

        logger.info("⏳ Sende Anfrage an OpenAI...")
        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free", 
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.7
        )
        logger.info("Antwort von OpenAI erhalten.")
        
        job.application_draft = response.choices[0].message.content
        db.commit()
        logger.info("Anschreiben in DB gespeichert.")
        
        r = redis_sync.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
        r.publish("job_updates", json.dumps({
            "type": "job_update",
            "job_id": job.id,
            "status": "COMPLETED",
            "application_draft": job.application_draft
        }))
        logger.info(f"✅ WebSocket Event 'job_update' für {job.id} gesendet.")
        
    except Exception as e:
        logger.error(f"CRASH BEI GENERIERUNG: {e}")
        db.rollback()
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
def get_jobs():
    db = SessionLocal()
    try:
        return db.query(JobEntry).order_by(JobEntry.match_score.desc()).all()
    finally:
        db.close()

@app.post("/jobs/{job_id}/generate")
def trigger_generation(job_id: str):
    generate_application_task.apply_async(args=[job_id], queue="ai_queue")
    return {"status": "started"}

@app.get("/settings")
def get_settings():
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if not profile:
            profile = UserProfile(id=1, cv_data={"experience": [], "projects": [], "education": ""}, job_urls=[])
            db.add(profile)
            db.commit()
            db.refresh(profile)
        return profile
    finally:
        db.close()

@app.post("/settings")
def save_settings(settings: SettingsData):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if not profile:
            profile = UserProfile(id=1)
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
def delete_settings():
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
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

@app.get("/jobs/{job_id}/download")
def download_application_pdf(job_id: str):
    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        
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
async def upload_cv(file: UploadFile = File(...)):
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
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if not profile:
            profile = UserProfile(id=1)
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
def reset_db():
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