import os
import json
import logging
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)
import redis
from celery_config import celery_app
from urllib.parse import urlparse
from datetime import datetime, timezone

from database import (
    SessionLocal,
    JobEntry,
    UserProfile,
    JobPlatform,
    DomainUrlPattern,
    User,
)
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests

# Logging Setup
from logger import get_logger

from intelligence_service import (
    get_model,
    get_api_key,
    format_cv_for_prompt,
    detect_url_pattern_with_ai,
    analyze_job,
    generate_application,
)

logger = get_logger(__name__)


def _send_via_gmail_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a single digest Gmail for all jobs in a crawl."""
    if not profile.gmail_address or not profile.gmail_app_password:
        logger.warning("Gmail batch notification enabled but credentials missing.")
        return False

    recipients = (platform.gmail_recipients or []) if platform else []
    if not recipients:
        recipients = [profile.gmail_address]

    msg = MIMEMultipart("alternative")
    count = len(jobs)
    msg["Subject"] = f"{count} New Job Match{'es' if count != 1 else ''}"
    msg["From"] = profile.gmail_address
    msg["To"] = ", ".join(recipients)

    custom_template = platform.gmail_template if platform else None
    if custom_template:
        import re
        from string import Template

        # Provide jobCount and userName globally in the template
        custom_template = Template(custom_template).safe_substitute(
            jobCount=count, userName=userName
        )

        loop_match = re.search(
            r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", custom_template, re.DOTALL
        )
        if loop_match:
            job_block = loop_match.group(1)
            rendered_jobs = "".join(
                Template(job_block).safe_substitute(
                    jobCount=count,
                    userName=userName,
                    title=j.title,
                    company=j.company,
                    match_score=int(j.match_score),
                    reasoning=j.reasoning or "",
                    url=j.url,
                )
                for j in jobs
            )
            html = (
                custom_template[: loop_match.start()]
                + rendered_jobs
                + custom_template[loop_match.end() :]
            )
        else:
            # No loop block — render template once per job, separated by <hr>
            html = "\n<hr>\n".join(
                Template(custom_template).safe_substitute(
                    jobCount=count,
                    userName=userName,
                    title=j.title,
                    company=j.company,
                    match_score=int(j.match_score),
                    reasoning=j.reasoning or "",
                    url=j.url,
                )
                for j in jobs
            )
    else:
        job_items = "".join(
            f"""
            <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e5e7eb">
              <h3 style="margin:0 0 8px">{j.title} &ndash; {j.company}</h3>
              <p style="margin:0 0 4px"><b>Match Score:</b> {int(j.match_score)}%</p>
              <p style="margin:0 0 12px">{j.reasoning}</p>
              <a href="{j.url}">View details</a>
            </div>
            """
            for j in jobs
        )
        html = f"""
        <html><body>
          <p>Hello {userName},</p>
          <h2>{count} New Job Match{'es' if count != 1 else ''}</h2>
          {job_items}
        </body></html>
        """

    msg.attach(MIMEText(html, "html"))
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(profile.gmail_address, profile.gmail_app_password)
        server.sendmail(profile.gmail_address, recipients, msg.as_string())

    logger.info(f" Gmail digest sent: {count} jobs to {recipients}")
    return True


def _flush_gmail_digest(crawl_job_id, user_id, db, r):
    """Send batched Gmail digest for all jobs queued during a crawl, if any."""
    key = f"crawl:{crawl_job_id}:pending_gmail"
    job_ids_raw = r.lrange(key, 0, -1)
    if not job_ids_raw:
        return
    r.delete(key)

    job_ids = [
        jid.decode("utf-8") if isinstance(jid, bytes) else str(jid)
        for jid in job_ids_raw
    ]
    jobs = db.query(JobEntry).filter(JobEntry.id.in_(job_ids)).all()
    if not jobs:
        return

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        return

    user = db.query(User).filter(User.id == user_id).first()
    userName = user.username if user else "Candidate"

    # Get platform from the first job if available
    platform = None
    if jobs[0].platform_id:
        platform = (
            db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()
        )

    try:
        _send_via_gmail_batch(jobs, profile, platform=platform, userName=userName)
    except Exception as e:
        logger.error(f"Gmail digest failed: {e}")


def _send_via_gmail(job, profile, platform=None, userName="Candidate"):
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

    custom_template = platform.gmail_template if platform else None
    if custom_template:
        from string import Template

        html = Template(custom_template).safe_substitute(
            jobCount=1,
            userName=userName,
            title=job.title,
            company=job.company,
            match_score=int(job.match_score),
            reasoning=job.reasoning or "",
            url=job.url,
        )
    else:
        html = f"""
    <html>
      <body>
        <p>Hello {userName},</p>
        <h2>New Job Found!</h2>
        <p><b>Title:</b> {job.title}</p>
        <p><b>Company:</b> {job.company}</p>
        <p><b>Match Score:</b> {int(job.match_score)}%</p>
        <hr>
        <h3>Reasoning:</h3>
        <p>{job.reasoning}</p>
        <hr>
        <p>
          <a href="{job.url}">View details</a>
        </p>
      </body>
    </html>
    """
    part = MIMEText(html, "html")
    msg.attach(part)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(profile.gmail_address, profile.gmail_app_password)
        server.sendmail(profile.gmail_address, profile.gmail_address, msg.as_string())

    logger.info(f" Email notification sent for job {job.id}")
    return True


def _send_via_pushover(job, profile, platform=None):
    """Send a notification via Pushover. Returns True on success."""
    if not profile.pushover_user_key or not profile.pushover_api_token:
        logger.warning("Pushover notification enabled but credentials missing.")
        return False

    template = getattr(platform, "pushover_template", None) if platform else None
    if template:
        message = template
        message = message.replace("$title", job.title or "")
        message = message.replace("$company", job.company or "")
        message = message.replace(
            "$match_score", str(int(job.match_score)) if job.match_score else "0"
        )
        message = message.replace("$reasoning", job.reasoning or "")
        message = message.replace("$url", job.url or "")
    else:
        message = f"{job.company} - Score: {int(job.match_score)}%\n\n{job.reasoning[:100]}..."

    payload = {
        "token": profile.pushover_api_token,
        "user": profile.pushover_user_key,
        "title": f"{job.title}",
        "message": message,
        "url": job.url,
        "url_title": "View details",
    }

    resp = requests.post(
        "https://api.pushover.net/1/messages.json", data=payload, timeout=10
    )
    if resp.status_code == 200:
        logger.info(f" Pushover notification sent for job {job.id}")
        return True
    else:
        logger.error(f"Pushover Error: {resp.text}")
        return False


def send_notification(job, profile, db, adapters=None, platform=None):
    """
    Sends notifications via the specified adapters (e.g. ['GMAIL', 'PUSHOVER']).
    If adapters is None or empty, falls back to profile.active_notification_service.
    Sends via all specified adapters and returns True if at least one succeeded.
    """
    user_obj = (
        db.query(User).filter(User.id == profile.user_id).first()
        if hasattr(profile, "user_id")
        else None
    )
    userName = user_obj.username if user_obj else "Candidate"

    _adapter_fns = {
        "GMAIL": lambda j, p: _send_via_gmail(
            j, p, platform=platform, userName=userName
        ),
        "PUSHOVER": lambda j, p: _send_via_pushover(j, p, platform=platform),
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
                    new_pattern, filtered_urls = detect_url_pattern_with_ai(
                        base_url,
                        urls_list,
                        model=get_model(db),
                        api_key=get_api_key(db),
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
                pattern, filtered_urls = detect_url_pattern_with_ai(
                    base_url, urls_list, model=get_model(db), api_key=get_api_key(db)
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
        total_found_before_dedup = len(filtered_urls)
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
                    if job_id:
                        r_dedup = redis.from_url(
                            os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
                        )
                        r_dedup.hset(f"crawl_job:{job_id}", "total_found", before)
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
                        _flush_gmail_digest(crawl_job_id, user_id, db, r)
                        r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                        r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                        r.delete("system:crawling")
                        total_found_raw = job_hash.get(b"total_found")
                        total_found = int(total_found_raw) if total_found_raw else total

                        r.publish(
                            "job_updates",
                            json.dumps(
                                {
                                    "type": "crawl_job_completed",
                                    "job_id": crawl_job_id,
                                    "user_id": user_id,
                                    "total": total,
                                    "total_found": total_found,
                                }
                            ),
                        )
                        r.publish(
                            "job_updates", json.dumps({"type": "crawl_completed"})
                        )
            return

        # Determine profile to use (User Specific or Admin/Default)
        profile = None
        if user_id:
            profile = (
                db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            )

        # Fallback to Admin (ID=1) or default if no user speciifed
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        user_language = getattr(profile, "language", "de") if profile else "de"

        if profile:
            cv_text = format_cv_for_prompt(profile.cv_data)
            profile_str = (
                f"Rolle: {profile.role}, Skills: {profile.skills}\nDetails:\n{cv_text}"
            )
        else:
            logger.warning("No user profile found. Using default fallback profile.")
            profile_str = "Python Dev"

        logger.info(f"Sending analysis request to LLM for Job {job_id}...")
        model = get_model(db)
        api_key = get_api_key(db)
        data = analyze_job(
            job_title=job_data["title"],
            job_description=job_data["description"][:10000],
            profile_str=profile_str,
            user_language=user_language,
            model=model,
            api_key=api_key,
        )
        logger.info(
            f"LLM analysis completed for Job {job_id}. Score: {data.get('score')}"
        )

        job_url = job_data.get("url")
        company_domain = None
        if job_url:
            try:
                parsed = urlparse(job_url)
                company_domain = parsed.netloc.removeprefix("www.")
            except Exception:
                pass

        db_job = JobEntry(
            id=job_data["id"],
            title=job_data["title"],
            company=job_data["company"],
            description=job_data["description"],
            match_score=float(data.get("score", 0)),
            url=job_url,
            reasoning=data.get("reasoning", ""),
            application_draft=None,
            status="OPEN",
            user_id=user_id,
            platform_id=job_data.get("platform_id"),
            company_domain=company_domain,
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
        logger.info(f" WebSocket Event 'new_job' published for {db_job.title}")

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
                        platform_adapters = [
                            a.upper() for a in (platform.notification_adapters or [])
                        ]
                        non_gmail = [a for a in platform_adapters if a != "GMAIL"]
                        has_gmail = "GMAIL" in platform_adapters

                        sent = False
                        # Non-Gmail adapters (e.g. PUSHOVER) fire per job
                        if non_gmail:
                            sent = send_notification(
                                db_job,
                                settings_profile,
                                db,
                                adapters=non_gmail,
                                platform=platform,
                            )

                        # Gmail: queue for batch digest at crawl completion
                        if has_gmail:
                            if crawl_job_id:
                                r.rpush(
                                    f"crawl:{crawl_job_id}:pending_gmail", db_job.id
                                )
                                r.expire(f"crawl:{crawl_job_id}:pending_gmail", 3600)
                            else:
                                # No crawl context — send immediately
                                user_obj = (
                                    db.query(User).filter(User.id == user_id).first()
                                )
                                userName = (
                                    user_obj.username if user_obj else "Candidate"
                                )
                                sent = (
                                    _send_via_gmail(
                                        db_job,
                                        settings_profile,
                                        platform=platform,
                                        userName=userName,
                                    )
                                    or sent
                                )

                        if sent or has_gmail:
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
                    _flush_gmail_digest(crawl_job_id, user_id, db, r)
                    r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                    r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                    r.delete("system:crawling")
                    total_found_raw = job_hash.get(b"total_found")
                    total_found = int(total_found_raw) if total_found_raw else total

                    r.publish(
                        "job_updates",
                        json.dumps(
                            {
                                "type": "crawl_job_completed",
                                "job_id": crawl_job_id,
                                "user_id": user_id,
                                "total": total,
                                "total_found": total_found,
                            }
                        ),
                    )
                    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ) as e:
        logger.error(f"OpenRouter API error in analyze_job_task for Job {job_id}: {e}")
        db.rollback()
        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            try:
                import requests as _req

                SCRAPER_URL = os.getenv(
                    "SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper"
                )
                _req.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "error_message": str(e),
                    },
                    timeout=5,
                )
            except Exception as cleanup_e:
                logger.error(f"Failed to trigger cleanup: {cleanup_e}")
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
def generate_application_task(job_id, user_id=None, improvement_notes=None):
    logger.info(
        f"[TASK] Generating application letter for Job ID: {job_id}, User ID: {user_id}"
    )
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job ID {job_id} not found in DB.")
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
            error_msg = "Profile incomplete. Please add your resume in the settings."
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

        logger.info(f"Data loaded. Job: {job.title}, User: {profile.role}")

        user_language = getattr(profile, "language", "de") if profile else "de"
        cv_text = format_cv_for_prompt(profile.cv_data)

        logger.info(" Sende Anfrage an OpenAI für Anschreiben...")
        model = get_model(db)
        api_key = get_api_key(db)
        application_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=job.description[:10000],
            profile_role=profile.role,
            cv_text=cv_text,
            user_language=user_language,
            model=model,
            api_key=api_key,
            improvement_notes=improvement_notes,
        )
        logger.info("Received AI response for application letter.")

        # Check if job was cancelled before saving
        db.refresh(job)
        if job.status != "GENERATING":
            logger.info(
                f"Job {job_id} was cancelled (status: {job.status}), discarding generated result."
            )
            return

        job.application_draft = application_text
        job.status = "COMPLETED"
        db.commit()
        logger.info(f"Application letter for job {job_id} saved to DB.")
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
        logger.info(f" WebSocket Event 'job_update' für {job.id} gesendet.")

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ) as e:
        logger.error(
            f"OpenRouter API error in generate_application_task for Job {job_id}: {e}"
        )
        db.rollback()
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = "OpenRouter model not found (404)"
                db.commit()
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_update",
                            "job_id": job.id,
                            "status": "FAILED",
                            "error": "OpenRouter model not found (404)",
                            "user_id": job.user_id,
                        }
                    ),
                )
        except Exception as db_e:
            logger.error(f"Failed to save 404 error status: {db_e}")
    except Exception as e:
        logger.error(f"Generation failed for job {job_id}: {e}", exc_info=True)
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


@celery_app.task(name="worker.generate_interview_prep_task", bind=True, max_retries=2)
def generate_interview_prep_task(self, job_id: str, user_id: int):
    """Generiert Interview-Vorbereitung für einen Job via AI."""
    from intelligence_service import generate_interview_prep

    db = SessionLocal()
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found for interview prep")
            return

        user_profile = (
            db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        )
        cv_summary = ""
        user_language = "de"
        if user_profile:
            if user_profile.cv_data:
                cv_summary = format_cv_for_prompt(user_profile.cv_data)
            user_language = getattr(user_profile, "language", "de") or "de"

        model = get_model(db)
        api_key = get_api_key(db)

        prep_data = generate_interview_prep(
            job_title=job.title,
            company_name=job.company,
            job_description=job.description or "",
            cv_summary=cv_summary,
            model=model,
            api_key=api_key,
            language=user_language,
        )

        logger.info(f"Interview prep data generated: {len(str(prep_data))} chars")

        job.interview_prep_material = json.dumps(prep_data, ensure_ascii=False)
        db.commit()

        # Notify via Redis pub/sub
        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        r.publish(
            "job_updates",
            json.dumps({"type": "interview_prep_ready", "job_id": job_id}),
        )

        logger.info(f"Interview prep generated for job {job_id}")
        return {"status": "success", "job_id": job_id}

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ):
        # store_ai_404_error already called inside intelligence_service
        logger.error(
            f"OpenRouter API error in generate_interview_prep_task for {job_id}, not retrying."
        )
        db.rollback()
        return {"status": "failed", "reason": "api_error"}
    except Exception as e:
        logger.error(f"Interview prep generation failed for {job_id}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


@celery_app.task(name="worker.generate_company_profile", bind=True, max_retries=2)
def generate_company_profile(self, domain: str, user_id: int):
    """Generiert ein Firmenprofil inkl. Gehaltsdaten."""
    from intelligence_service import generate_company_profile_summary
    from api_clients.review_api import get_salary_data
    from database import CompanyProfile
    from datetime import datetime, timezone as tz

    db = SessionLocal()
    try:
        # Gather job info for this company domain
        jobs = (
            db.query(JobEntry).filter(JobEntry.company_domain == domain).limit(3).all()
        )

        raw_info = f"Domain: {domain}\n"
        company_name = domain
        if jobs:
            company_name = jobs[0].company or domain
            raw_info += f"Company name: {company_name}\n"

        # Web research phase: fetch real online content about the company
        try:
            from scraper_worker import get_html_with_browser, get_clean_content
            from urllib.parse import quote_plus
            from bs4 import BeautifulSoup as _BS

            # 1. Search DuckDuckGo for company info pages
            search_q = quote_plus(
                f"{company_name} Unternehmen Über uns Investor Relations Geschichte"
            )
            search_html = get_html_with_browser(
                f"https://html.duckduckgo.com/html/?q={search_q}"
            )

            candidate_urls: list[str] = []
            if search_html:
                soup = _BS(search_html, "html.parser")
                for link in soup.select("a.result__a"):
                    href = link.get("href", "")
                    if href.startswith("http") and any(
                        kw in href.lower()
                        for kw in [
                            "about",
                            "investor",
                            "history",
                            "ueber",
                            "unternehmen",
                            "company",
                            "konzern",
                        ]
                    ):
                        candidate_urls.append(href)

            # 2. Always try common company pages directly
            for path in [
                "/about",
                "/about-us",
                "/ueber-uns",
                "/investor-relations",
                "/company",
                "/unternehmen",
            ]:
                candidate_urls.insert(0, f"https://{domain}{path}")

            # 3. Fetch and clean up to 3 pages
            pages_fetched = 0
            seen: set[str] = set()
            for url in candidate_urls[:8]:
                if pages_fetched >= 3 or url in seen:
                    continue
                seen.add(url)
                try:
                    html = get_html_with_browser(url)
                    if html:
                        clean = get_clean_content(html)
                        if clean and len(clean) > 300:
                            raw_info += (
                                f"\n\n--- Webinhalt: {url} ---\n{clean[:6000]}\n"
                            )
                            pages_fetched += 1
                except Exception as _fe:
                    logger.warning(f"Web fetch failed for {url}: {_fe}")

            logger.info(
                f"Web research: fetched {pages_fetched} page(s) for {company_name}"
            )
        except Exception as web_err:
            logger.warning(f"Web research skipped for {domain}: {web_err}")

        model = get_model(db)
        api_key = get_api_key(db)

        user_profile = (
            db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        )
        user_language = (
            getattr(user_profile, "language", "de") if user_profile else "de"
        )

        profile_data = generate_company_profile_summary(
            domain=domain,
            company_name=company_name,
            raw_info=raw_info,
            model=model,
            api_key=api_key,
            language=user_language,
        )

        # Get salary data
        job_title = jobs[0].title if jobs else "Software Engineer"
        salary_data = get_salary_data(job_title)

        # Upsert company profile
        company = (
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
        )
        if not company:
            company = CompanyProfile(domain=domain)
            db.add(company)

        company.name = company_name
        company.description = profile_data.get("description")
        company.culture_summary = profile_data.get("culture_summary")
        company.tech_stack = profile_data.get("tech_stack", [])
        company.salary_benchmark = salary_data
        company.raw_data = profile_data
        company.analyzed_at = datetime.now(tz.utc)

        db.commit()

        # Notify
        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        r.publish(
            "job_updates",
            json.dumps({"type": "company_profile_ready", "domain": domain}),
        )

        logger.info(f"Company profile generated for {domain}")
        return {"status": "success", "domain": domain}

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ):
        # store_ai_404_error already called inside intelligence_service
        logger.error(
            f"OpenRouter API error in generate_company_profile for {domain}, not retrying."
        )
        db.rollback()
        return {"status": "failed", "reason": "api_error"}
    except Exception as e:
        logger.error(f"Company profile generation failed for {domain}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task(name="worker.check_follow_ups")
def check_follow_ups():
    """
    Periodischer Task: Prüft fällige Follow-ups und sendet Benachrichtigungen.
    Wird von Celery Beat ausgeführt (z.B. alle 6 Stunden).
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due_jobs = (
            db.query(JobEntry)
            .filter(
                JobEntry.next_follow_up_at <= now,
                JobEntry.status.in_(["APPLIED", "INTERVIEW"]),
            )
            .all()
        )

        notified_count = 0
        for job in due_jobs:
            user_profile = (
                db.query(UserProfile).filter(UserProfile.user_id == job.user_id).first()
            )
            if not user_profile:
                continue

            message = f"Follow-up due: {job.title} at {job.company}"

            # Use existing notification adapters (same pattern as worker.py)
            if (
                user_profile.active_notification_service == "PUSHOVER"
                and user_profile.pushover_user_key
            ):
                try:
                    resp = requests.post(
                        "https://api.pushover.net/1/messages.json",
                        data={
                            "token": user_profile.pushover_api_token,
                            "user": user_profile.pushover_user_key,
                            "message": message,
                            "title": "Job Follow-up Reminder",
                        },
                    )
                    if resp.status_code == 200:
                        notified_count += 1
                    else:
                        logger.error(f"Pushover notification failed: {resp.text}")
                except Exception as e:
                    logger.error(f"Pushover notification failed: {e}")

            # Clear follow_up after notifying (so it doesn't repeat)
            job.next_follow_up_at = None

        db.commit()
        logger.info(f"Follow-up check complete: {notified_count} notifications sent")
        return {"notified": notified_count, "due_jobs": len(due_jobs)}

    finally:
        db.close()


@celery_app.task(name="ai.check_platforms_for_crawl")
def check_platforms_for_crawl():
    logger.info(" Checking platforms for scheduled crawls...")
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import or_
        from database import JobPlatform
        import requests

        import zoneinfo
        now_utc = datetime.now(timezone.utc)

        # Load platforms that are active and either never crawled or interval passed
        platforms = db.query(JobPlatform).filter(JobPlatform.is_active == True).all()

        triggered_count = 0
        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:80/scraper")

        for p in platforms:
            is_due = False

            # Resolve user timezone for this platform
            user_tz_str = "Europe/Berlin"
            try:
                user_profile = db.query(UserProfile).filter(UserProfile.user_id == p.user_id).first()
                if user_profile and user_profile.timezone:
                    user_tz_str = user_profile.timezone
            except Exception:
                pass
            try:
                user_tz = zoneinfo.ZoneInfo(user_tz_str)
            except Exception:
                user_tz = zoneinfo.ZoneInfo("Europe/Berlin")

            now_local = now_utc.astimezone(user_tz)

            logger.info(
                f"[SCHEDULE] Checking '{p.name}' (id={p.id}) | tz={user_tz_str} | "
                f"now_local={now_local.strftime('%H:%M')} | "
                f"schedule_time={p.schedule_time!r} schedule_days={p.schedule_days!r} | "
                f"last_crawl_at={p.last_crawl_at!r}"
            )

            if p.schedule_time and p.schedule_days is not None:
                today_weekday = now_local.weekday()  # 0=Mon, 6=Sun
                if today_weekday in p.schedule_days:
                    try:
                        h, m = map(int, p.schedule_time.split(":"))
                        scheduled_local = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
                        if now_local >= scheduled_local:
                            if not p.last_crawl_at:
                                is_due = True
                            else:
                                last_local = p.last_crawl_at.replace(tzinfo=timezone.utc).astimezone(user_tz)
                                if last_local < scheduled_local:
                                    is_due = True
                                else:
                                    logger.info(f"[SCHEDULE] Skipped: already crawled today at {last_local.strftime('%H:%M')} (after scheduled {p.schedule_time})")
                        else:
                            logger.info(f"[SCHEDULE] Skipped: {p.schedule_time} not yet reached (now_local={now_local.strftime('%H:%M')})")
                    except (ValueError, AttributeError) as e:
                        logger.error(f"[SCHEDULE] Error parsing schedule for {p.name}: {e}")
                else:
                    logger.info(f"[SCHEDULE] Skipped: today={today_weekday} not in {p.schedule_days}")
            elif not p.last_crawl_at:
                is_due = True
            else:
                diff = now_utc - p.last_crawl_at.replace(tzinfo=timezone.utc)
                elapsed_min = diff.total_seconds() / 60
                if elapsed_min >= p.crawl_interval_minutes:
                    is_due = True
                else:
                    logger.info(f"[SCHEDULE] Skipped (interval): {elapsed_min:.1f}/{p.crawl_interval_minutes} min elapsed")

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
                        p.last_crawl_at = now_utc
                        triggered_count += 1
                    else:
                        logger.error(
                            f"Failed to trigger crawl for {p.name}: {resp.status_code}"
                        )
                except Exception as e:
                    logger.error(f"Error triggering periodic crawl for {p.name}: {e}")

        if triggered_count > 0:
            db.commit()
            logger.info(f" Triggered {triggered_count} periodic crawls.")
        else:
            logger.info("No platforms due for crawl.")

    except Exception as e:
        logger.error(f"Error in check_periodic_crawls_task: {e}")
    finally:
        db.close()
