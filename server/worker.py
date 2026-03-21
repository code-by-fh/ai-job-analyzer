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

_RESEND_DEFAULT_JOB_ROW = """
<div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
  <h3 style="margin:0 0 4px">{title} &ndash; {company}</h3>
  <p style="margin:0;color:#64748b">Match Score: <strong>{match_score}%</strong></p>
  <p style="margin:8px 0;font-size:14px;color:#334155">{reasoning}</p>
  {url_link}
</div>
"""

_RESEND_DEFAULT_HTML = """<html><body>
<p>Hi {userName},</p>
<h2>{count} new job match{plural} from {platform_name}</h2>
{job_rows}
<p style="color:#94a3b8;font-size:12px;">Sent by Job Agent</p>
</body></html>"""


def _send_via_resend_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via Resend API. Returns True on success."""
    if not profile.resend_api_key or not profile.resend_from_email:
        logger.warning("Resend batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "resend_recipients", None) or []) if platform else []
    if not recipients:
        logger.warning("Resend: no recipients configured for platform.")
        return False

    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"
    count = len(jobs)

    # Build job rows HTML
    job_rows_html = ""
    for j in jobs:
        score = str(int(j.match_score)) if j.match_score else "0"
        url_link = f'<a href="{j.url}">Details anzeigen</a>' if j.url else ""
        job_rows_html += _RESEND_DEFAULT_JOB_ROW.format(
            title=j.title or "",
            company=j.company or "",
            match_score=score,
            reasoning=(j.reasoning or "")[:300],
            url_link=url_link,
        )

    # Custom template support
    raw_template = (getattr(platform, "resend_template", None) or "") if platform else ""
    if raw_template:
        if "{{#jobs}}" in raw_template:
            # Mustache-style loop: render block between {{#jobs}} and {{/jobs}} for each job
            import re
            loop_match = re.search(r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", raw_template, re.DOTALL)
            if loop_match:
                loop_block = loop_match.group(1)
                rendered_jobs = ""
                for j in jobs:
                    score = str(int(j.match_score)) if j.match_score else "0"
                    rendered_jobs += loop_block\
                        .replace("$title", j.title or "")\
                        .replace("$company", j.company or "")\
                        .replace("$match_score", score)\
                        .replace("$reasoning", (j.reasoning or "")[:300])\
                        .replace("$url", j.url or "#")
                html = re.sub(r"\{\{#jobs\}\}.*?\{\{/jobs\}\}", rendered_jobs, raw_template, flags=re.DOTALL)
            else:
                html = raw_template
            html = html\
                .replace("$userName", userName)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)
        elif "$jobs_html" in raw_template:
            html = raw_template\
                .replace("$jobs_html", job_rows_html)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)\
                .replace("$userName", userName)
        else:
            html = raw_template  # treat as fully custom HTML
    else:
        html = _RESEND_DEFAULT_HTML.format(
            userName=userName,
            count=count,
            plural="es" if count != 1 else "",
            platform_name=platform_name,
            job_rows=job_rows_html,
        )

    subject = f"[Job Agent] {count} neue{'r' if count == 1 else ''} Job-Match{'es' if count != 1 else ''} von {platform_name}"
    payload = {
        "from": profile.resend_from_email,
        "to": recipients if isinstance(recipients, list) else [recipients],
        "subject": subject,
        "html": html,
    }

    resp = requests.post(
        "https://api.resend.com/emails",
        json=payload,
        headers={"Authorization": f"Bearer {profile.resend_api_key}"},
        timeout=15,
    )
    if resp.status_code in (200, 201):
        logger.info(f" Resend digest sent: {count} jobs → {recipients} (platform: {platform_name})")
        return True
    else:
        logger.error(f"Resend API error {resp.status_code}: {resp.text}")
        return False


def _flush_resend_digest(crawl_job_id, user_id, db, r):
    """Send batched Resend digest for all jobs queued during a crawl, if any."""
    key = f"crawl:{crawl_job_id}:pending_resend"
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
    if not profile or not profile.resend_api_key:
        return

    user = db.query(User).filter(User.id == user_id).first()
    userName = user.username if user else "Candidate"

    platform = None
    if jobs[0].platform_id:
        platform = db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()

    try:
        _send_via_resend_batch(jobs, profile, platform=platform, userName=userName)
    except Exception as e:
        logger.error(f"Resend digest failed: {e}")


def _send_via_mailjet_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via Mailjet API. Returns True on success."""
    if not profile.mailjet_api_key or not profile.mailjet_secret_key or not profile.mailjet_from_email:
        logger.warning("Mailjet batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "mailjet_recipients", None) or []) if platform else []
    if not recipients:
        logger.warning("Mailjet: no recipients configured for platform.")
        return False

    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"
    count = len(jobs)

    # Build job rows HTML (reuse Resend default row template)
    job_rows_html = ""
    for j in jobs:
        score = str(int(j.match_score)) if j.match_score else "0"
        url_link = f'<a href="{j.url}">Details anzeigen</a>' if j.url else ""
        job_rows_html += _RESEND_DEFAULT_JOB_ROW.format(
            title=j.title or "",
            company=j.company or "",
            match_score=score,
            reasoning=(j.reasoning or "")[:300],
            url_link=url_link,
        )

    # Custom template support (same syntax as Resend)
    raw_template = (getattr(platform, "mailjet_template", None) or "") if platform else ""
    if raw_template:
        if "{{#jobs}}" in raw_template:
            import re
            loop_match = re.search(r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", raw_template, re.DOTALL)
            if loop_match:
                loop_block = loop_match.group(1)
                rendered_jobs = ""
                for j in jobs:
                    score = str(int(j.match_score)) if j.match_score else "0"
                    rendered_jobs += loop_block\
                        .replace("$title", j.title or "")\
                        .replace("$company", j.company or "")\
                        .replace("$match_score", score)\
                        .replace("$reasoning", (j.reasoning or "")[:300])\
                        .replace("$url", j.url or "#")
                html = re.sub(r"\{\{#jobs\}\}.*?\{\{/jobs\}\}", rendered_jobs, raw_template, flags=re.DOTALL)
            else:
                html = raw_template
            html = html\
                .replace("$userName", userName)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)
        elif "$jobs_html" in raw_template:
            html = raw_template\
                .replace("$jobs_html", job_rows_html)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)\
                .replace("$userName", userName)
        else:
            html = raw_template
    else:
        html = _RESEND_DEFAULT_HTML.format(
            userName=userName,
            count=count,
            plural="es" if count != 1 else "",
            platform_name=platform_name,
            job_rows=job_rows_html,
        )

    subject = f"[Job Agent] {count} neue{'r' if count == 1 else ''} Job-Match{'es' if count != 1 else ''} von {platform_name}"
    to_list = [{"Email": r} for r in (recipients if isinstance(recipients, list) else [recipients])]
    payload = {
        "Messages": [{
            "From": {"Email": profile.mailjet_from_email, "Name": "Job Agent"},
            "To": to_list,
            "Subject": subject,
            "HTMLPart": html,
        }]
    }

    resp = requests.post(
        "https://api.mailjet.com/v3.1/send",
        json=payload,
        auth=(profile.mailjet_api_key, profile.mailjet_secret_key),
        timeout=15,
    )
    if resp.status_code in (200, 201):
        logger.info(f" Mailjet digest sent: {count} jobs → {recipients} (platform: {platform_name})")
        return True
    else:
        logger.error(f"Mailjet API error {resp.status_code}: {resp.text}")
        return False


def _flush_mailjet_digest(crawl_job_id, user_id, db, r):
    """Send batched Mailjet digest for all jobs queued during a crawl, if any."""
    key = f"crawl:{crawl_job_id}:pending_mailjet"
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
    if not profile or not profile.mailjet_api_key:
        return

    user = db.query(User).filter(User.id == user_id).first()
    userName = user.username if user else "Candidate"

    platform = None
    if jobs[0].platform_id:
        platform = db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()

    try:
        _send_via_mailjet_batch(jobs, profile, platform=platform, userName=userName)
    except Exception as e:
        logger.error(f"Mailjet digest failed: {e}")


def _send_via_smtp_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via SMTP (port 587, STARTTLS). Returns True on success."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    if not profile.smtp_host or not profile.smtp_user or not profile.smtp_password:
        logger.warning("SMTP batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "smtp_recipients", None) or []) if platform else []
    if not recipients:
        logger.warning("SMTP: no recipients configured for platform.")
        return False

    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"
    smtp_port = getattr(profile, "smtp_port", None) or 587
    from_email = getattr(profile, "smtp_from_email", None) or profile.smtp_user
    count = len(jobs)

    # Build job rows HTML
    job_rows_html = ""
    for j in jobs:
        score = str(int(j.match_score)) if j.match_score else "0"
        url_link = f'<a href="{j.url}">Details anzeigen</a>' if j.url else ""
        job_rows_html += _RESEND_DEFAULT_JOB_ROW.format(
            title=j.title or "",
            company=j.company or "",
            match_score=score,
            reasoning=(j.reasoning or "")[:300],
            url_link=url_link,
        )

    # Custom template support (same syntax as Resend/Mailjet)
    raw_template = (getattr(platform, "smtp_template", None) or "") if platform else ""
    if raw_template:
        if "{{#jobs}}" in raw_template:
            import re
            loop_match = re.search(r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", raw_template, re.DOTALL)
            if loop_match:
                loop_block = loop_match.group(1)
                rendered_jobs = ""
                for j in jobs:
                    score = str(int(j.match_score)) if j.match_score else "0"
                    rendered_jobs += loop_block\
                        .replace("$title", j.title or "")\
                        .replace("$company", j.company or "")\
                        .replace("$match_score", score)\
                        .replace("$reasoning", (j.reasoning or "")[:300])\
                        .replace("$url", j.url or "#")
                html = re.sub(r"\{\{#jobs\}\}.*?\{\{/jobs\}\}", rendered_jobs, raw_template, flags=re.DOTALL)
            else:
                html = raw_template
            html = html\
                .replace("$userName", userName)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)
        elif "$jobs_html" in raw_template:
            html = raw_template\
                .replace("$jobs_html", job_rows_html)\
                .replace("$jobCount", str(count))\
                .replace("$count", str(count))\
                .replace("$platform_name", platform_name)\
                .replace("$userName", userName)
        else:
            html = raw_template
    else:
        html = _RESEND_DEFAULT_HTML.format(
            userName=userName,
            count=count,
            plural="es" if count != 1 else "",
            platform_name=platform_name,
            job_rows=job_rows_html,
        )

    subject = f"[Job Agent] {count} neue{'r' if count == 1 else ''} Job-Match{'es' if count != 1 else ''} von {platform_name}"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = ", ".join(recipients if isinstance(recipients, list) else [recipients])
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(profile.smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(profile.smtp_user, profile.smtp_password)
            server.sendmail(from_email, recipients if isinstance(recipients, list) else [recipients], msg.as_string())

        logger.info(f" SMTP digest sent: {count} jobs → {recipients} (platform: {platform_name})")
        return True
    except Exception as e:
        logger.error(f"SMTP error: {e}")
        return False


def _flush_smtp_digest(crawl_job_id, user_id, db, r):
    """Send batched SMTP digest for all jobs queued during a crawl, if any."""
    key = f"crawl:{crawl_job_id}:pending_smtp"
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
    if not profile or not profile.smtp_host:
        return

    user = db.query(User).filter(User.id == user_id).first()
    userName = user.username if user else "Candidate"

    platform = None
    if jobs[0].platform_id:
        platform = db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()

    try:
        _send_via_smtp_batch(jobs, profile, platform=platform, userName=userName)
    except Exception as e:
        logger.error(f"SMTP digest failed: {e}")


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
    Sends notifications via the specified adapters (e.g. ['PUSHOVER']).
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
        "PUSHOVER": lambda j, p: _send_via_pushover(j, p, platform=platform),
    }

    # Determine which adapters to use
    if adapters:
        services = [a.upper() for a in adapters if a.upper() in _adapter_fns]
    else:
        # Fallback: use all adapters that have credentials configured
        services = []
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
                def _normalize(u):
                    """Strip trailing slash and fragment for reliable comparison."""
                    return u.rstrip("/").split("#")[0]

                existing_urls = {
                    _normalize(url)
                    for (url,) in db.query(JobEntry.url)
                    .filter(JobEntry.user_id == user_id, JobEntry.url.isnot(None))
                    .all()
                }
                before = len(filtered_urls)
                filtered_urls = [
                    url for url in filtered_urls if _normalize(url) not in existing_urls
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

    force_reanalyze = job_data.get("force_reanalyze", False)

    try:
        existing_job = db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first()
        # Fallback: check by URL in case UUID differs due to URL normalization
        if not existing_job and job_data.get("url") and user_id:
            existing_job = (
                db.query(JobEntry)
                .filter(JobEntry.user_id == user_id, JobEntry.url == job_data["url"])
                .first()
            )
            if existing_job:
                logger.info(
                    f"Job {job_id} matched by URL (ID mismatch). Skipping re-analysis."
                )
        if existing_job and not force_reanalyze:
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
                        _flush_resend_digest(crawl_job_id, user_id, db, r)
                        _flush_mailjet_digest(crawl_job_id, user_id, db, r)
                        _flush_smtp_digest(crawl_job_id, user_id, db, r)
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

        if existing_job and force_reanalyze:
            existing_job.match_score = float(data.get("score", 0))
            existing_job.reasoning = data.get("reasoning", "")
            db.commit()
            db.refresh(existing_job)
            db_job = existing_job
            logger.info(f"Job {job_id} re-analyzed and updated in database.")
        else:
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

        event_type = "job_updated" if (existing_job and force_reanalyze) else "new_job"
        payload = json.dumps(
            {
                "type": event_type,
                "crawl_job_id": crawl_job_id,
                "job": {
                    "id": db_job.id,
                    "title": db_job.title,
                    "company": db_job.company,
                    "description": db_job.description,
                    "match_score": db_job.match_score,
                    "reasoning": db_job.reasoning,
                    "url": db_job.url,
                    "status": db_job.status,
                    "created_at": (
                        db_job.created_at.isoformat() if db_job.created_at else None
                    ),
                    "user_id": user_id,
                },
            }
        )

        r.publish("job_updates", payload)
        logger.info(f" WebSocket Event '{event_type}' published for {db_job.title}")

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
                        non_batch = [a for a in platform_adapters if a not in ("RESEND", "MAILJET", "SMTP")]
                        has_resend = "RESEND" in platform_adapters
                        has_mailjet = "MAILJET" in platform_adapters
                        has_smtp = "SMTP" in platform_adapters

                        sent = False
                        if non_batch:
                            sent = send_notification(
                                db_job,
                                settings_profile,
                                db,
                                adapters=non_batch,
                                platform=platform,
                            )

                        # Resend: queue per-job for batch digest at crawl completion
                        if has_resend:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_resend", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_resend", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_resend_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        # Mailjet: same batch pattern
                        if has_mailjet:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_mailjet", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_mailjet", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_mailjet_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        # SMTP: same batch pattern
                        if has_smtp:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_smtp", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_smtp", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_smtp_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        if sent or has_resend or has_mailjet or has_smtp:
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
                    _flush_resend_digest(crawl_job_id, user_id, db, r)
                    _flush_mailjet_digest(crawl_job_id, user_id, db, r)
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


@celery_app.task(name="ai.save_job_basic")
def save_job_basic_task(job_data):
    """Save a job to DB without AI analysis (used for initial platform run)."""
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    crawl_job_id = job_data.get("crawl_job_id")

    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    try:
        if crawl_job_id:
            analysis_completed = int(
                r.hincrby(f"crawl_job:{crawl_job_id}", "analysis_completed", 1)
            )
            r.lpush(f"crawl_job:{crawl_job_id}:all_job_titles", job_title)
            r.publish(
                "job_updates",
                json.dumps({
                    "type": "job_analysis_started",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "analysis_completed": analysis_completed,
                }),
            )

        if db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first():
            logger.info(f"Job {job_id} already exists. Skipping basic save.")
            if crawl_job_id:
                jobs_skipped = int(
                    r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_skipped", 1)
                )
                r.publish(
                    "job_updates",
                    json.dumps({
                        "type": "job_skipped",
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "job_title": job_title,
                        "jobs_skipped": jobs_skipped,
                    }),
                )
                job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
                if job_hash:
                    total = int(job_hash.get(b"total", 0))
                    jobs_saved = int(job_hash.get(b"jobs_saved", 0))
                    if (jobs_saved + jobs_skipped) >= total and total > 0:
                        r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                        r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                        r.delete("system:crawling")
                        total_found_raw = job_hash.get(b"total_found")
                        total_found = int(total_found_raw) if total_found_raw else total
                        r.publish("job_updates", json.dumps({
                            "type": "crawl_job_completed",
                            "job_id": crawl_job_id,
                            "user_id": user_id,
                            "total": total,
                            "total_found": total_found,
                        }))
                        _flush_resend_digest(crawl_job_id, user_id, db, r)
                        _flush_mailjet_digest(crawl_job_id, user_id, db, r)
                        _flush_smtp_digest(crawl_job_id, user_id, db, r)
                        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
            return

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
            match_score=0.0,
            url=job_url,
            reasoning="",
            application_draft=None,
            status="OPEN",
            user_id=user_id,
            platform_id=job_data.get("platform_id"),
            company_domain=company_domain,
        )
        db.add(db_job)
        db.commit()
        logger.info(f"Job {job_id} saved (no AI analysis) to database.")

        r.publish(
            "job_updates",
            json.dumps({
                "type": "new_job",
                "crawl_job_id": crawl_job_id,
                "job": {
                    "id": db_job.id,
                    "title": db_job.title,
                    "company": db_job.company,
                    "description": db_job.description,
                    "match_score": 0.0,
                    "reasoning": "",
                    "url": db_job.url,
                    "status": "OPEN",
                    "created_at": (
                        db_job.created_at.isoformat() if db_job.created_at else None
                    ),
                    "user_id": user_id,
                },
            }),
        )

        if crawl_job_id:
            jobs_saved = int(
                r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1)
            )
            r.publish(
                "job_updates",
                json.dumps({
                    "type": "job_analysis_finished",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "jobs_saved": jobs_saved,
                }),
            )
            job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
            if job_hash:
                total = int(job_hash.get(b"total", 0))
                jobs_skipped = int(job_hash.get(b"jobs_skipped", 0))
                if (jobs_saved + jobs_skipped) >= total and total > 0:
                    r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
                    r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
                    r.delete("system:crawling")
                    total_found_raw = job_hash.get(b"total_found")
                    total_found = int(total_found_raw) if total_found_raw else total
                    r.publish("job_updates", json.dumps({
                        "type": "crawl_job_completed",
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "total": total,
                        "total_found": total_found,
                    }))
                    _flush_resend_digest(crawl_job_id, user_id, db, r)
                    _flush_mailjet_digest(crawl_job_id, user_id, db, r)
                    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

    except Exception as e:
        logger.error(f"Error in save_job_basic_task for {job_id}: {e}", exc_info=True)
        db.rollback()
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
        job.status = "DRAFTED"
        db.commit()
        logger.info(f"Application letter for job {job_id} saved to DB.")
        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_update",
                    "job_id": job.id,
                    "status": "DRAFTED",
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
            else:
                logger.info(f"[SCHEDULE] Skipped '{p.name}': no schedule defined")

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


@celery_app.task(name="ai.cleanup_stale_redis_jobs")
def cleanup_stale_redis_jobs():
    """Remove crawl jobs from Redis that have been running for more than 5 minutes."""
    import time as time_module

    STALE_THRESHOLD_MS = 5 * 60 * 1000  # 5 minutes in milliseconds
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    r = redis.from_url(redis_url, decode_responses=True)

    now_ms = int(time_module.time() * 1000)
    removed = 0

    try:
        job_keys = r.keys("crawl_job:*")
        # Filter out sub-keys like crawl_job:{id}:all_job_titles
        job_keys = [k for k in job_keys if k.count(":") == 1]

        for key in job_keys:
            job_data = r.hgetall(key)
            if not job_data:
                continue

            started_at = job_data.get("started_at")
            if not started_at:
                continue

            age_ms = now_ms - int(started_at)
            if age_ms < STALE_THRESHOLD_MS:
                continue

            job_id = key.split(":", 1)[1]
            user_id = job_data.get("user_id")
            status = job_data.get("status", "")

            # Skip jobs that are already completed (they have their own TTL)
            if status == "completed":
                continue

            logger.info(
                f"🧹 Removing stale Redis job {job_id} (age={age_ms // 1000}s, status={status})"
            )
            r.delete(key)
            r.delete(f"crawl_job:{job_id}:all_job_titles")
            if user_id:
                r.srem(f"user:{user_id}:active_crawls", job_id)
            removed += 1

        if removed:
            r.delete("system:crawling")
            logger.info(f" Removed {removed} stale Redis crawl job(s).")
        else:
            logger.debug("No stale Redis crawl jobs found.")

        return {"removed": removed}

    except Exception as e:
        logger.error(f"Error during stale Redis job cleanup: {e}")
        return {"removed": 0, "error": str(e)}
