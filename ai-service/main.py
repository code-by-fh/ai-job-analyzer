import os
import json
import logging
import io
import sys
from openai import OpenAI
from pypdf import PdfReader
import redis
from celery_config import celery_app
from database import SessionLocal, JobEntry, UserProfile, SettingsData

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY"),
)


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

@celery_app.task(name="ai.filter_urls")
def filter_urls_task(args):
    if not args: 
        logger.warning("filter_urls_task called with empty args")
        return []
        
    base_url, urls_list = args
    logger.info(f"Filtering url with Input list size: {len(urls_list)}")
    
    try:
        system_prompt = """
        Du bist ein Crawler-Filter. Analysiere den gesamten Text und gib ein JSON Array mit ALLEN relevanten Job-Detail-URLs zurück. Gib NUR das Array zurück.
        Beispiel-Output: ["https://firma.de/jobs/entwickler-123", "https://firma.de/career/marketing-manager"]
        """
        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Basis: {base_url}. Liste: {json.dumps(urls_list)}"}
            ],
            temperature=0.0
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "")
        result_urls = json.loads(content)
        logger.info(f"Filter result: {len(result_urls)} relevant URLs found.")
        return result_urls
    except Exception as e:
        logger.error(f"Filter Error processing {base_url}: {e}", exc_info=True)
        return []

@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    job_id = job_data.get('id', 'unknown')
    job_title = job_data.get('title', 'unknown')
    logger.info(f"[TASK] Starting Job Analysis for ID: {job_id}, Title: {job_title}")
    
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    try:
        if db.query(JobEntry).filter(JobEntry.id == job_data['id']).first():
            logger.info(f"Job {job_id} already exists in database. Skipping analysis.")
            return
        
        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if profile:
            cv_text = format_cv_for_prompt(profile.cv_data)
            profile_str = f"Rolle: {profile.role}, Skills: {profile.skills}\nDetails:\n{cv_text}"
        else:
            logger.warning("No user profile found (ID 1). Using default fallback profile.")
            profile_str = "Python Dev"

        logger.info(f"Sending analysis request to LLM for Job {job_id}...")
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
        logger.info(f"LLM analysis completed for Job {job_id}. Score: {data.get('score')}")
        
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
        logger.info(f"Job {job_id} saved to database.")

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
        logger.info(f"✅ WebSocket Event 'new_job' published for {db_job.title}")

    except Exception as e:
        logger.error(f"Analyze Error for Job {job_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

@celery_app.task(name="ai.generate_application")
def generate_application_task(job_id):
    logger.info(f"[TASK] Generiere Anschreiben für Job ID: {job_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"FEHLER: Job ID {job_id} nicht in DB gefunden!")
            return

        profile = db.query(UserProfile).filter(UserProfile.id == 1).first()
        if not profile:
            error_msg = "Profil unvollständig. Bitte in den Einstellungen Lebenslauf hinterlegen."
            logger.error(f"Application generation failed: {error_msg}")
            
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

        logger.info("⏳ Sende Anfrage an OpenAI für Anschreiben...")
        response = client.chat.completions.create(
            model="tngtech/deepseek-r1t2-chimera:free", 
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.7
        )
        logger.info("Antwort von OpenAI erhalten (Anschreiben).")
        
        job.application_draft = response.choices[0].message.content
        db.commit()
        logger.info(f"Anschreiben für Job {job_id} in DB gespeichert.")
        
        # Redis connection refresh often not needed if 'r' is valid, but kept from original structure or re-init if preferred. 
        # Variable 'r' is already initialized above.
        r.publish("job_updates", json.dumps({
            "type": "job_update",
            "job_id": job.id,
            "status": "COMPLETED",
            "application_draft": job.application_draft
        }))
        logger.info(f"✅ WebSocket Event 'job_update' für {job.id} gesendet.")
        
    except Exception as e:
        logger.error(f"CRASH BEI GENERIERUNG für Job {job_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
