import os
import json
import logging
import io
import sys
from openai import OpenAI
from pypdf import PdfReader
import redis
from celery_config import celery_app
from urllib.parse import urlparse
from datetime import datetime, timezone

from database import (
    SessionLocal,
    JobEntry,
    UserProfile,
    SettingsData,
    JobPlatform,
    SystemSettings,
    DomainUrlPattern,
)
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY"),
)


def get_current_model():
    db = SessionLocal()
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
        db.close()


def format_cv_for_prompt(cv_json):
    if not cv_json:
        return "Keine detaillierte Erfahrung angegeben."

    text = "BERUFLICHE ERFAHRUNG:\n"
    for exp in cv_json.get("experience", []):
        text += f"- {exp['role']} bei {exp['company']} ({exp['duration']}): {exp['description']}\n"

    text += "\nPROJEKTE:\n"
    for proj in cv_json.get("projects", []):
        text += (
            f"- {proj['name']} (Tech: {proj['tech_stack']}): {proj['description']}\n"
        )

    text += f"\nAUSBILDUNG:\n{cv_json.get('education', '')}"
    return text


def _send_via_gmail(job, profile):
    """Send a notification via Gmail. Returns True on success."""
    if not profile.gmail_address or not profile.gmail_app_password:
        logger.warning("Gmail notification enabled but credentials missing.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = (
        f"New Job Match: {job.title} at {job.company} ({int(job.match_score)}%)"
    )
    msg["From"] = profile.gmail_address
    msg["To"] = profile.gmail_address

    html = f"""
    <html>
      <body>
        <h2>New Job Found!</h2>
        <p><b>Title:</b> {job.title}</p>
        <p><b>Company:</b> {job.company}</p>
        <p><b>Match Score:</b> {int(job.match_score)}%</p>
        <hr>
        <h3>Reasoning:</h3>
        <p>{job.reasoning}</p>
        <hr>
        <p>
          <a href="{job.url}">Hier Details anschauen</a>
        </p>
      </body>
    </html>
    """
    part = MIMEText(html, "html")
    msg.attach(part)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(profile.gmail_address, profile.gmail_app_password)
        server.sendmail(
            profile.gmail_address, profile.gmail_address, msg.as_string()
        )

    logger.info(f"📧 Email notification sent for job {job.id}")
    return True


def _send_via_pushover(job, profile):
    """Send a notification via Pushover. Returns True on success."""
    if not profile.pushover_user_key or not profile.pushover_api_token:
        logger.warning("Pushover notification enabled but credentials missing.")
        return False

    payload = {
        "token": profile.pushover_api_token,
        "user": profile.pushover_user_key,
        "title": f"{job.title}",
        "message": f"{job.company} - Score: {int(job.match_score)}%\n\n{job.reasoning[:100]}...",
        "url": job.url,
        "url_title": "Hier Details anschauen",
    }

    resp = requests.post(
        "https://api.pushover.net/1/messages.json", data=payload, timeout=10
    )
    if resp.status_code == 200:
        logger.info(f"📱 Pushover notification sent for job {job.id}")
        return True
    else:
        logger.error(f"Pushover Error: {resp.text}")
        return False


def send_notification(job, profile, adapters=None):
    """
    Sends notifications via the specified adapters (e.g. ['GMAIL', 'PUSHOVER']).
    If adapters is None or empty, falls back to profile.active_notification_service.
    Sends via all specified adapters and returns True if at least one succeeded.
    """
    _adapter_fns = {
        "GMAIL": _send_via_gmail,
        "PUSHOVER": _send_via_pushover,
    }

    # Determine which adapters to use
    if adapters:
        services = [a.upper() for a in adapters if a.upper() in _adapter_fns]
    else:
        # Fallback: use all adapters that have credentials configured
        services = []
        if profile.gmail_address and profile.gmail_app_password:
            services.append("GMAIL")
        if profile.pushover_user_key and profile.pushover_api_token:
            services.append("PUSHOVER")

    if not services:
        return False

    any_sent = False
    for service in services:
        try:
            if _adapter_fns[service](job, profile):
                any_sent = True
        except Exception as e:
            logger.error(f"Notification via {service} failed: {e}")

    return any_sent


def _detect_url_pattern_with_ai(base_url, urls_list):
    """
    Uses AI to detect the job-detail URL path pattern for a domain.
    Returns (pattern: str, job_urls: list[str]).
    Only URLs present in urls_list are returned (anti-hallucination).
    """
    model = get_current_model()
    system_prompt = """Du bist ein URL-Analyse-Experte für Job-Plattformen.
Analysiere die URL-Liste und identifiziere den URL-Pfad-Präfix, der ausschließlich für Job-Detail-Seiten (einzelne Stellenanzeigen) gilt – keine Listing-, Kategorie- oder Übersichtsseiten.

Antworte NUR mit validem JSON (kein Markdown):
{
  "pattern": "/jobs/",
  "job_urls": ["https://...", "https://..."]
}

- "pattern": URL-Pfad-Präfix der Job-Detail-Seiten (z.B. "/jobs/", "/stellenangebote/", "/career/detail/")
- "job_urls": Alle URLs aus der gegebenen Liste, die diesem Pattern entsprechen
"""
    sample = urls_list[:150]
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Basis-URL: {base_url}\nURL-Liste:\n{json.dumps(sample)}",
            },
        ],
        temperature=0.0,
    )
    content = (
        response.choices[0]
        .message.content.strip()
        .replace("```json", "")
        .replace("```", "")
    )
    data = json.loads(content)
    pattern = data.get("pattern", "")
    urls_set = set(urls_list)
    job_urls = [url for url in data.get("job_urls", []) if url in urls_set]
    return pattern, job_urls


@celery_app.task(name="ai.filter_urls")
def filter_urls_task(args):
    if not args:
        logger.warning("filter_urls_task called with empty args")
        return []

    job_id = None
    user_id = 1

    try:
        if len(args) == 5:
            base_url, urls_list, user_id, job_id, platform_id = args
        elif len(args) == 4:
            base_url, urls_list, user_id, job_id = args
            platform_id = None
        elif len(args) == 3:
            base_url, urls_list, user_id = args
            platform_id = None
        else:
            base_url, urls_list = args
            platform_id = None
    except ValueError:
        logger.error(f"Invalid args unpacking in filter_urls: {args}")
        return []

    logger.info(f"Filtering URLs - Input list size: {len(urls_list)}")

    db = SessionLocal()
    try:
        domain = urlparse(base_url).netloc
        existing_entry = (
            db.query(DomainUrlPattern).filter(DomainUrlPattern.domain == domain).first()
        )

        if existing_entry:
            pattern = existing_entry.url_pattern
            logger.info(f"Known pattern for '{domain}': '{pattern}'")

            filtered_urls = [url for url in urls_list if pattern in urlparse(url).path]

            if len(filtered_urls) == 0:
                logger.warning(
                    f"Pattern '{pattern}' yielded 0 results for '{domain}'. "
                    "Re-detecting pattern with AI..."
                )
                try:
                    new_pattern, filtered_urls = _detect_url_pattern_with_ai(
                        base_url, urls_list
                    )
                    if new_pattern:
                        existing_entry.url_pattern = new_pattern
                        existing_entry.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        logger.info(f"Updated pattern for '{domain}': '{new_pattern}'")
                except Exception as ai_e:
                    logger.error(f"AI re-detection failed for '{domain}': {ai_e}")
                    filtered_urls = []
            else:
                logger.info(f"Pattern filter: {len(filtered_urls)} URLs matched.")

        else:
            logger.info(f"Unknown domain '{domain}'. Detecting URL pattern with AI...")
            try:
                pattern, filtered_urls = _detect_url_pattern_with_ai(
                    base_url, urls_list
                )
                if pattern:
                    db.add(DomainUrlPattern(domain=domain, url_pattern=pattern))
                    db.commit()
                    logger.info(f"Saved new pattern for '{domain}': '{pattern}'")
                logger.info(f"AI detected {len(filtered_urls)} job URLs.")
            except Exception as ai_e:
                logger.error(f"AI pattern detection failed for '{domain}': {ai_e}")
                filtered_urls = []

        # Early deduplication: skip URLs already scraped for this user
        if filtered_urls and user_id:
            try:
                existing_urls = {
                    url
                    for (url,) in db.query(JobEntry.url)
                    .filter(JobEntry.user_id == user_id, JobEntry.url.isnot(None))
                    .all()
                }
                before = len(filtered_urls)
                filtered_urls = [
                    url for url in filtered_urls if url not in existing_urls
                ]
                skipped = before - len(filtered_urls)
                if skipped > 0:
                    logger.info(f"Deduplication: {skipped} already-known URLs removed.")
            except Exception as dedup_e:
                logger.error(f"Deduplication error: {dedup_e}")

        logger.info(f"Final: {len(filtered_urls)} new URLs to scrape for '{domain}'.")
        return [filtered_urls, user_id, job_id, platform_id]

    except Exception as e:
        logger.error(f"Filter Error processing {base_url}: {e}", exc_info=True)
        if job_id:
            SCRAPER_URL = os.getenv(
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper"
            )
            try:
                requests.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={
                        "job_id": job_id,
                        "user_id": user_id,
                        "error_message": str(e),
                    },
                    timeout=5,
                )
            except Exception as cleanup_e:
                logger.error(f"Failed to trigger cleanup for job {job_id}: {cleanup_e}")
        return []
    finally:
        db.close()


@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    logger.info(
        f"[TASK] Starting Job Analysis for ID: {job_id}, Title: {job_title}, User: {user_id}"
    )

    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    # Notify frontend that analysis is starting
    crawl_job_id = job_data.get("crawl_job_id")
    if crawl_job_id:
        analysis_completed = int(
            r.hincrby(f"crawl_job:{crawl_job_id}", "analysis_completed", 1)
        )

        # Add job title to all_job_titles list in Redis
        r.lpush(f"crawl_job:{crawl_job_id}:all_job_titles", job_title)
        list_length = r.llen(f"crawl_job:{crawl_job_id}:all_job_titles")
        logger.info(
            f"Added '{job_title}' to all_job_titles. List now has {list_length} entries."
        )

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_analysis_started",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "analysis_completed": analysis_completed,
                }
            ),
        )

    try:
        if db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first():
            logger.info(f"Job {job_id} already exists in database. Skipping analysis.")

            if crawl_job_id:
                # Increment skipped counter
                jobs_skipped = int(
                    r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_skipped", 1)
                )

                # Notify frontend about skipped job
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_skipped",
                            "job_id": crawl_job_id,
                            "user_id": user_id,
                            "job_title": job_title,
                            "jobs_skipped": jobs_skipped,
                        }
                    ),
                )

                # Check completion
                job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
                if job_hash:
                    total = int(job_hash.get(b"total", 0))
                    jobs_saved = int(job_hash.get(b"jobs_saved", 0))
                    # Check if all jobs are accounted for (saved + skipped)
                    if (jobs_saved + jobs_skipped) >= total and total > 0:
                        logger.info(
                            f"All jobs processed (some skipped) for crawl {crawl_job_id}. Marking as completed."
                        )
                        r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                        r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                        r.delete("system:crawling")
                        r.publish(
                            "job_updates",
                            json.dumps(
                                {
                                    "type": "crawl_job_completed",
                                    "job_id": crawl_job_id,
                                    "user_id": user_id,
                                }
                            ),
                        )
                        r.publish(
                            "job_updates", json.dumps({"type": "crawl_completed"})
                        )
            return

        # Check if this is an initial run (skip LLM analysis to avoid unnecessary costs)
        is_initial_run = False
        if crawl_job_id:
            raw = r.hget(f"crawl_job:{crawl_job_id}", "is_initial_run")
            is_initial_run = raw is not None and int(raw) == 1

        if is_initial_run:
            logger.info(
                f"Initial run detected for crawl {crawl_job_id}. Skipping LLM analysis for Job {job_id}."
            )
            data = {"score": 0, "reason_de": "Initialer Scan (Keine KI-Analyse)"}
        else:
            # Determine profile to use (User Specific or Admin/Default)
            profile = None
            if user_id:
                profile = (
                    db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
                )

            # Fallback to Admin (ID=1) or default if no user speciifed
            if not profile:
                profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

            if profile:
                cv_text = format_cv_for_prompt(profile.cv_data)
                profile_str = (
                    f"Rolle: {profile.role}, Skills: {profile.skills}\nDetails:\n{cv_text}"
                )
            else:
                logger.warning("No user profile found. Using default fallback profile.")
                profile_str = "Python Dev"

            logger.info(f"Sending analysis request to LLM for Job {job_id}...")
            model = get_current_model()
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Antworte NUR JSON: { 'score': 0-100, 'reason_de': '...' }",
                    },
                    {
                        "role": "user",
                        "content": f"Job: {job_data['title']} \n {job_data['description'][:3000]} \n User: {profile_str}",
                    },
                ],
                temperature=0.0,
            )
            content = (
                response.choices[0]
                .message.content.strip()
                .replace("```json", "")
                .replace("```", "")
            )
            data = json.loads(content)
            logger.info(
                f"LLM analysis completed for Job {job_id}. Score: {data.get('score')}"
            )

        db_job = JobEntry(
            id=job_data["id"],
            title=job_data["title"],
            company=job_data["company"],
            description=job_data["description"],
            match_score=float(data.get("score", 0)),
            url=job_data.get("url"),
            reasoning=data.get("reason_de", ""),
            application_draft=None,
            status="OPEN",
            user_id=user_id,
            platform_id=job_data.get("platform_id"),
        )

        db.add(db_job)
        db.commit()
        logger.info(f"Job {job_id} saved to database.")

        payload = json.dumps(
            {
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
                    "created_at": (
                        db_job.created_at.isoformat() if db_job.created_at else None
                    ),
                    "user_id": user_id,
                },
            }
        )

        r.publish("job_updates", payload)
        logger.info(f"✅ WebSocket Event 'new_job' published for {db_job.title}")

        # Increment jobs_saved counter
        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            jobs_saved = int(r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1))

            # Notify that this specific job analysis is finished
            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "job_analysis_finished",
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "job_title": job_title,
                        "jobs_saved": jobs_saved,
                    }
                ),
            )

        # --- NOTIFICATION LOGIC ---
        try:
            # Re-fetch job to ensure attached to session if needed (though db_job should be valid)
            # Check platform settings
            if db_job.platform_id:
                platform = (
                    db.query(JobPlatform)
                    .filter(JobPlatform.id == db_job.platform_id)
                    .first()
                )
                if (
                    platform
                    and platform.is_notification_enabled
                    and not db_job.notification_sent
                ):
                    settings_profile = (
                        db.query(UserProfile)
                        .filter(UserProfile.user_id == user_id)
                        .first()
                    )

                    if settings_profile:
                        platform_adapters = platform.notification_adapters or []
                        sent = send_notification(db_job, settings_profile, adapters=platform_adapters if platform_adapters else None)
                        if sent:
                            db_job.notification_sent = True
                            db.commit()
        except Exception as notif_e:
            logger.error(f"Error in notification logic: {notif_e}")
        # --------------------------

        # Handle crawl job completion
        if crawl_job_id:
            job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
            if job_hash:
                total = int(job_hash.get(b"total", 0))
                jobs_skipped = int(job_hash.get(b"jobs_skipped", 0))

                # Check if all jobs are saved (new_job events sent)
                if (jobs_saved + jobs_skipped) >= total and total > 0:
                    logger.info(
                        f"All jobs analyzed for crawl {crawl_job_id}. Marking as completed."
                    )
                    r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                    r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                    r.delete("system:crawling")
                    r.publish(
                        "job_updates",
                        json.dumps(
                            {
                                "type": "crawl_job_completed",
                                "job_id": crawl_job_id,
                                "user_id": user_id,
                            }
                        ),
                    )
                    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

    except Exception as e:
        logger.error(f"Analyze Error for Job {job_id}: {e}", exc_info=True)
        db.rollback()

        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            try:
                import requests

                SCRAPER_URL = os.getenv(
                    "SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper"
                )
                requests.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "error_message": str(e),
                    },
                    timeout=5,
                )
            except Exception as cleanup_e:
                logger.error(
                    f"Failed to trigger cleanup for job {crawl_job_id}: {cleanup_e}"
                )
    finally:
        db.close()


@celery_app.task(name="ai.generate_application")
def generate_application_task(job_id, user_id=None):
    logger.info(
        f"[TASK] Generiere Anschreiben für Job ID: {job_id}, User ID: {user_id}"
    )
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
            profile = (
                db.query(UserProfile)
                .filter(UserProfile.user_id == target_user_id)
                .first()
            )

        # Fallback
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if not profile:
            error_msg = "Profil unvollständig. Bitte in den Einstellungen Lebenslauf hinterlegen."
            logger.error(f"Application generation failed: {error_msg}")

            job.status = "FAILED"
            job.generation_error = error_msg
            db.commit()

            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "job_update",
                        "job_id": job.id,
                        "status": "FAILED",
                        "error": error_msg,
                        "user_id": job.user_id,
                    }
                ),
            )

            r.publish(
                "job_updates",
                json.dumps({"type": "global_error", "message": error_msg}),
            )
            return

        logger.info(f"Daten geladen. Job: {job.title}, User: {profile.role}")

        cv_text = format_cv_for_prompt(profile.cv_data)

        system_prompt = """
        Du bist ein professioneller Karriere-Coach und Bewerbungsexperte mit tiefem Verständnis für ATS-Systeme.
        Schreibe ein überzeugendes, ATS-optimiertes Anschreiben in Markdown, das klar strukturiert, gut lesbar und frei von Floskeln ist.
        An folgende Vorgaben hast du dich strikt zu halten:
        1. Die Einleitung soll originell und aufmerksamkeitsstark sein, ohne Standardfloskeln wie „mit großer Begeisterung“ oder „ich freue mich sehr“.
        2. Nutze ausschließlich realistische Angaben, die der Bewerber liefert. Keine erfundenen Projekte, Zahlen oder Firmen.
        3. Zeige konkret auf, welchen Mehrwert die Bewerberin/der Bewerber dem Unternehmen bringt.
        4. Hebe fachliche Kompetenzen, Berufserfahrung, Ausbildung und Motivation präzise hervor.
        5. Verwende relevante Keywords aus der Stellenanzeige sinnvoll, ohne Keyword-Stuffing.
        6. Der Stil soll professionell, klar, selbstbewusst und authentisch sein.
        7. Vermeide Sonderzeichen, Grafiken, Tabellen oder unnötige Formatierungen, die ATS-Systeme stören könnten.
        8. Das Ergebnis soll ein vollständiges Anschreiben in Markdown sein, keine zusätzlichen Informationen oder Erklärungen.
        9. Wenn der Bewerber konkrete Zahlen oder Ergebnisse angibt, integriere sie sinnvoll in den Text, um Erfolge messbar darzustellen.
        """

        user_prompt = f"""
        STELLENANZEIGE: {job.title} bei {job.company}
        {job.description[:10000]}
        
        BEWERBER: {profile.role}
        {cv_text}
        """

        logger.info("⏳ Sende Anfrage an OpenAI für Anschreiben...")
        model = get_current_model()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
        logger.info("Antwort von OpenAI erhalten (Anschreiben).")

        job.application_draft = response.choices[0].message.content
        job.status = "COMPLETED"
        db.commit()
        logger.info(f"Anschreiben für Job {job_id} in DB gespeichert.")

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_update",
                    "job_id": job.id,
                    "status": "COMPLETED",
                    "application_draft": job.application_draft,
                    "user_id": job.user_id,
                }
            ),
        )
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

                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_update",
                            "job_id": job.id,
                            "status": "FAILED",
                            "error": str(e),
                            "user_id": job.user_id,
                        }
                    ),
                )
        except Exception as db_e:
            logger.error(f"Failed to save error status to DB: {db_e}")
    finally:
        db.close()


@celery_app.task(name="ai.check_platforms_for_crawl")
def check_platforms_for_crawl():
    logger.info("⏰ Checking platforms for scheduled crawls...")
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import or_
        from database import JobPlatform
        import requests

        now = datetime.now(timezone.utc)

        # Load platforms that are active and either never crawled or interval passed
        platforms = db.query(JobPlatform).filter(JobPlatform.is_active == True).all()

        triggered_count = 0
        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper")

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
                is_initial_run = not p.last_crawl_at
                logger.info(
                    f"🚀 Platform {p.name} (ID: {p.id}) is due for crawl. Triggering..."
                )
                try:
                    resp = requests.post(
                        f"{SCRAPER_URL}/search",
                        json={
                            "query": p.url,
                            "location": "Remote",
                            "user_id": p.user_id,
                            "platform_id": p.id,
                            "is_initial_run": is_initial_run,
                        },
                        timeout=5,
                    )
                    if resp.status_code == 200:
                        p.last_crawl_at = now
                        triggered_count += 1
                    else:
                        logger.error(
                            f"Failed to trigger crawl for {p.name}: {resp.status_code}"
                        )
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
