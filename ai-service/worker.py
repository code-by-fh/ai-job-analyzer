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
        
    try:
        user_id = 1
        job_id = None
        if len(args) == 5:
            base_url, urls_list, user_id, job_id, platform_id = args
        elif len(args) == 4:
            base_url, urls_list, user_id, job_id = args
            platform_id = None
        elif len(args) == 3:
            base_url, urls_list, user_id = args
            job_id = None
            platform_id = None
        else:
             base_url, urls_list = args
             user_id = 1
             job_id = None
             platform_id = None
    except ValueError:
        logger.error(f"Invalid args unpacking in filter_urls: {args}")
        return []

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
        return [result_urls, user_id, job_id, platform_id]
    except Exception as e:
        logger.error(f"Filter Error processing {base_url}: {e}", exc_info=True)
        return []

@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    job_id = job_data.get('id', 'unknown')
    job_title = job_data.get('title', 'unknown')
    user_id = job_data.get('user_id')
    logger.info(f"[TASK] Starting Job Analysis for ID: {job_id}, Title: {job_title}, User: {user_id}")
    
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    # Notify frontend that analysis is starting
    crawl_job_id = job_data.get('crawl_job_id')
    if crawl_job_id:
        analysis_completed = int(r.hincrby(f"crawl_job:{crawl_job_id}", "analysis_completed", 1))
        
        # Add job title to all_job_titles list in Redis
        r.lpush(f"crawl_job:{crawl_job_id}:all_job_titles", job_title)
        list_length = r.llen(f"crawl_job:{crawl_job_id}:all_job_titles")
        logger.info(f"Added '{job_title}' to all_job_titles. List now has {list_length} entries.")
        
        r.publish("job_updates", json.dumps({
            "type": "job_analysis_started",
            "job_id": crawl_job_id,
            "user_id": user_id,
            "job_title": job_title,
            "analysis_completed": analysis_completed
        }))
    
    try:
        if db.query(JobEntry).filter(JobEntry.id == job_data['id']).first():
            logger.info(f"Job {job_id} already exists in database. Skipping analysis.")
            return
        
        # Determine profile to use (User Specific or Admin/Default)
        profile = None
        if user_id:
             profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        
        # Fallback to Admin (ID=1) or default if no user speciifed
        if not profile:
             profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if profile:
            cv_text = format_cv_for_prompt(profile.cv_data)
            profile_str = f"Rolle: {profile.role}, Skills: {profile.skills}\nDetails:\n{cv_text}"
        else:
            logger.warning("No user profile found. Using default fallback profile.")
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
            status="OPEN",
            user_id=user_id,
            platform_id=job_data.get('platform_id')
        )
        
        db.add(db_job)
        db.commit()
        logger.info(f"Job {job_id} saved to database.")

        payload = json.dumps({
            "type": "new_job",
            "crawl_job_id": crawl_job_id,
            "job": {
                "id": db_job.id,
                "title": db_job.title,
                "company": db_job.company,
                "description": db_job.description,
                "match_score": db_job.match_score,
                "reasoning": db_job.reasoning,
                "url": db_job.url,
                "status": "OPEN",
                "created_at": db_job.created_at.isoformat() if db_job.created_at else None,
                "user_id": user_id
            }
        })
        
        
        r.publish("job_updates", payload)
        logger.info(f"✅ WebSocket Event 'new_job' published for {db_job.title}")
        
        # Increment jobs_saved counter
        crawl_job_id = job_data.get('crawl_job_id')
        if crawl_job_id:
            jobs_saved = int(r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1))
            
            # Notify that this specific job analysis is finished
            r.publish("job_updates", json.dumps({
                "type": "job_analysis_finished",
                "job_id": crawl_job_id,
                "user_id": user_id,
                "job_title": job_title,
                "jobs_saved": jobs_saved
            }))
        
        # Handle crawl job completion
        if crawl_job_id:
            job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
            if job_hash:
                total = int(job_hash.get(b"total", 0))
                jobs_saved = int(job_hash.get(b"jobs_saved", 0))
                
                # Check if all jobs are saved (new_job events sent)
                if jobs_saved >= total and total > 0:
                    logger.info(f"All jobs analyzed for crawl {crawl_job_id}. Marking as completed.")
                    r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                    r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                    r.delete("system:crawling")
                    r.publish("job_updates", json.dumps({
                        "type": "crawl_job_completed",
                        "job_id": crawl_job_id,
                        "user_id": user_id
                    }))
                    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

    except Exception as e:
        logger.error(f"Analyze Error for Job {job_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


@celery_app.task(name="ai.generate_application")
def generate_application_task(job_id, user_id=None):
    logger.info(f"[TASK] Generiere Anschreiben für Job ID: {job_id}, User ID: {user_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"FEHLER: Job ID {job_id} nicht in DB gefunden!")
            return

        target_user_id = user_id if user_id else job.user_id
        profile = None
        if target_user_id:
            profile = db.query(UserProfile).filter(UserProfile.user_id == target_user_id).first()
        
        # Fallback
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if not profile:
            error_msg = "Profil unvollständig. Bitte in den Einstellungen Lebenslauf hinterlegen."
            logger.error(f"Application generation failed: {error_msg}")
            
            job.status = "FAILED"
            job.generation_error = error_msg
            db.commit()

            r.publish("job_updates", json.dumps({
                "type": "job_update",
                "job_id": job.id,
                "status": "FAILED",
                "error": error_msg,
                "user_id": job.user_id
            }))
            
            r.publish("job_updates", json.dumps({
                "type": "global_error",
                "message": error_msg
            }))
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
        job.status = "COMPLETED"
        db.commit()
        logger.info(f"Anschreiben für Job {job_id} in DB gespeichert.")
        
        r.publish("job_updates", json.dumps({
            "type": "job_update",
            "job_id": job.id,
            "status": "COMPLETED",
            "application_draft": job.application_draft,
            "user_id": job.user_id
        }))
        logger.info(f"✅ WebSocket Event 'job_update' für {job.id} gesendet.")
        
    except Exception as e:
        logger.error(f"CRASH BEI GENERIERUNG für Job {job_id}: {e}", exc_info=True)
        db.rollback()
        
        # Try to set status to FAILED in DB
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = str(e)
                db.commit()
                
                r.publish("job_updates", json.dumps({
                    "type": "job_update",
                    "job_id": job.id,
                    "status": "FAILED",
                    "error": str(e),
                    "user_id": job.user_id
                }))
        except Exception as db_e:
            logger.error(f"Failed to save error status to DB: {db_e}")
    finally:
        db.close()


@celery_app.task(name="ai.check_periodic_crawls")
def check_periodic_crawls_task():
    logger.info("⏰ [TASK] Checking for platforms due for periodic crawl...")
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import or_
        from database import JobPlatform
        import requests

        now = datetime.now(timezone.utc)
        
        # Load platforms that are active and either never crawled or interval passed
        platforms = db.query(JobPlatform).filter(
            JobPlatform.is_active == True
        ).all()

        triggered_count = 0
        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://scraper-service:8080")

        for p in platforms:
            is_due = False
            if not p.last_crawl_at:
                is_due = True
            else:
                # Calculate if interval passed
                diff = now - p.last_crawl_at.replace(tzinfo=timezone.utc)
                if diff.total_seconds() / 60 >= p.crawl_interval_minutes:
                    is_due = True
            
            if is_due:
                logger.info(f"🚀 Platform {p.name} (ID: {p.id}) is due for crawl. Triggering...")
                try:
                    resp = requests.post(
                        f"{SCRAPER_URL}/search",
                        json={
                            "query": p.url,
                            "location": "Remote",
                            "user_id": p.user_id,
                            "platform_id": p.id
                        },
                        timeout=5
                    )
                    if resp.status_code == 200:
                        p.last_crawl_at = now
                        triggered_count += 1
                    else:
                        logger.error(f"Failed to trigger crawl for {p.name}: {resp.status_code}")
                except Exception as e:
                    logger.error(f"Error triggering periodic crawl for {p.name}: {e}")

        if triggered_count > 0:
            db.commit()
            logger.info(f"✅ Triggered {triggered_count} periodic crawls.")
        else:
            logger.info("No platforms due for crawl.")

    except Exception as e:
        logger.error(f"Error in check_periodic_crawls_task: {e}")
    finally:
        db.close()
