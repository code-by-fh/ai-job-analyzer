import os
import json
import uuid
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import redis

from core.scraper_celery_config import celery_app, REDIS_URL
from intelligence.service import extract_job_details, get_model, get_api_key
from database.core import SessionLocal, UserProfile, JobEntry
from services import render_client

# Logging Setup
from core.logger import get_logger

logger = get_logger(__name__)


def _is_cancelled(r, job_id):
    """Return True if the crawl job was cancelled or its tracking state is gone.

    Checks a dedicated cancellation marker that — unlike the main crawl_job hash —
    is never recreated by hincrby/hset/lpush. This makes the check robust against
    a late-finishing task resurrecting the deleted job key.
    """
    if not job_id:
        return False
    try:
        if r.exists(f"crawl_job:{job_id}:cancelled"):
            return True
        return not r.exists(f"crawl_job:{job_id}")
    except Exception:
        return False


_PRIVATE_RANGES = [
    # loopback
    (0x7F000000, 0x7FFFFFFF),
    # RFC 1918
    (0x0A000000, 0x0AFFFFFF),
    (0xAC100000, 0xAC1FFFFF),
    (0xC0A80000, 0xC0A8FFFF),
    # link-local
    (0xA9FE0000, 0xA9FEFFFF),
]


def _is_safe_url(url: str) -> bool:
    """Return True only if the URL is http(s) and does not point to a private/loopback address."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname or ""
        if hostname.lower() in ("localhost",):
            return False
        import socket

        try:
            ip_str = socket.gethostbyname(hostname)
        except Exception:
            return False
        parts = ip_str.split(".")
        if len(parts) != 4:
            return False
        ip_int = (
            (int(parts[0]) << 24)
            | (int(parts[1]) << 16)
            | (int(parts[2]) << 8)
            | int(parts[3])
        )
        for lo, hi in _PRIVATE_RANGES:
            if lo <= ip_int <= hi:
                return False
        return True
    except Exception:
        return False


def get_html(url: str) -> str | None:
    """Fetch page HTML using the render API."""
    return get_html_with_browser(url)


def get_html_with_browser(url: str) -> str | None:
    if not _is_safe_url(url):
        logger.warning(f"Blocked SSRF attempt for URL: {url}")
        return None
    logger.info(f"[RenderClient] Fetching: {url}")
    html = render_client.fetch_html(url)
    if html:
        logger.info(f"[RenderClient] Fetched {len(html)} bytes from {url}")
    else:
        logger.warning(f"[RenderClient] Empty response for {url}")
    return html


def get_clean_content(html):
    import markdownify
    import re

    try:
        soup = BeautifulSoup(html, "html.parser")

        for tag in soup(
            [
                "script",
                "style",
                "nav",
                "footer",
                "header",
                "iframe",
                "noscript",
                "button",
                "form",
            ]
        ):
            tag.decompose()

        for text_junk in [
            "Cookies",
            "Privatsphäre",
            "Datenschutz",
            "consent",
            "Partner",
        ]:
            for tag in soup.find_all(["div", "section"]):
                if re.search(text_junk, tag.get_text(), re.I):
                    tag.decompose()

        text = markdownify.markdownify(
            str(soup), heading_style="ATX", strip=["img", "a"]
        )

        text = re.sub(r"\n{3,}", "\n\n", text)
        clean_text = text.strip()
        logger.debug(f"Cleaned content length: {len(clean_text)} chars")
        return clean_text
    except Exception as e:
        logger.error(f"Error cleaning content: {e}", exc_info=True)
        return ""


@celery_app.task(name="scraper.fetch_links")
def fetch_links_task(start_url, user_id=1, job_id=None, platform_id=None):
    logger.info(
        f"[TASK] Fetching links started for: {start_url} (User: {user_id}, Job: {job_id})"
    )

    r = redis.from_url(REDIS_URL)

    try:
        if job_id:
            r.hset(f"crawl_job:{job_id}", "status", "fetching_links")
            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "crawl_job_started",
                        "job_id": job_id,
                        "user_id": user_id,
                        "platform": start_url,
                        "started_at": str(int(time.time() * 1000)),
                    }
                ),
            )

        if _is_cancelled(r, job_id):
            logger.info(f"[fetch_links] Job {job_id} was cancelled — skipping.")
            r.delete("system:crawling")
            return None

        r.setex("system:crawling", 600, "true")

        html = get_html(start_url)
        if not html:
            logger.warning(f"Failed to fetch content from {start_url}. Aborting crawl.")
            if job_id:
                from scraper_api import fail_crawl_job

                fail_crawl_job(
                    job_id,
                    user_id,
                    error_message=f"Failed to fetch content from {start_url}",
                )
            else:
                r.delete("system:crawling")
                r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
            return None

        soup = BeautifulSoup(html, "html.parser")
        all_links = set()
        base_domain = urlparse(start_url).netloc

        for a in soup.find_all("a", href=True):
            full_url = urljoin(start_url, a["href"])
            if urlparse(full_url).netloc != base_domain:
                continue
            if any(
                full_url.lower().endswith(x)
                for x in [".pdf", ".jpg", ".png", ".css", ".js"]
            ):
                continue
            all_links.add(full_url)

        logger.info(f"Found {len(all_links)} internal links on {start_url}")
        if all_links:
            sample = list(all_links)[:20]
            logger.info(f"[fetch_links] Sample links (up to 20): {sample}")
        else:
            logger.warning(f"[fetch_links] No internal <a href> links found — page may be SPA-rendered without href attributes")
        return [start_url, list(all_links), user_id, job_id, platform_id]

    except Exception as e:
        logger.error(f"Error in fetch_links_task for {start_url}: {e}", exc_info=True)
        if job_id:
            from scraper_api import fail_crawl_job

            fail_crawl_job(job_id, user_id, error_message=str(e))
        else:
            r.delete("system:crawling")
            r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
        return None


@celery_app.task(name="scraper.schedule_crawls")
def schedule_crawls_task(args):
    if not args or len(args) < 2:
        logger.error("Invalid args for schedule_crawls_task")
        return

    job_id = None
    platform_id = None
    user_id = 1

    try:
        r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

        if len(args) >= 3:
            filtered_links, user_id = args[0], args[1]
            job_id = args[2] if len(args) > 2 else None
            platform_id = args[3] if len(args) > 3 else None
        else:
            filtered_links, user_id = args

        if _is_cancelled(r, job_id):
            logger.info(f"[schedule_crawls] Job {job_id} was cancelled — skipping.")
            r.delete("system:crawling")
            return

        if not filtered_links:
            logger.info("Keine relevanten Links gefunden (filtered_links is empty.")

            if job_id:
                total_found_bytes = r.hget(f"crawl_job:{job_id}", "total_found")
                total_found = (
                    int(total_found_bytes.decode("utf-8")) if total_found_bytes else 0
                )

                r.hset(f"crawl_job:{job_id}", "status", "completed")
                r.srem(f"user:{user_id}:active_crawls", job_id)
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "crawl_job_completed",
                            "job_id": job_id,
                            "user_id": user_id,
                            "total": 0,
                            "total_found": total_found,
                        }
                    ),
                )

            r.delete("system:crawling")
            r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
            return

        logger.info(
            f"Scheduling {len(filtered_links)} detailed crawls for User {user_id}..."
        )

        if job_id:
            # Use total_found already set by dedup step, or fall back to len(filtered_links)
            existing_total_found = r.hget(f"crawl_job:{job_id}", "total_found")
            total_found = (
                int(existing_total_found)
                if existing_total_found is not None
                else len(filtered_links)
            )
            r.hset(
                f"crawl_job:{job_id}",
                mapping={
                    "total": len(filtered_links),
                    "total_found": total_found,
                    "completed": 0,
                    "status": "crawling",
                },
            )

            platform_url = r.hget(f"crawl_job:{job_id}", "platform_url")
            platform_url = platform_url.decode("utf-8") if platform_url else "Unknown"

            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "crawl_job_progress",
                        "job_id": job_id,
                        "user_id": user_id,
                        "platform": platform_url,
                        "total": len(filtered_links),
                        "total_found": total_found,
                        "completed": 0,
                    }
                ),
            )

        # First-run: just store the found URLs as deduplication placeholders.
        # No detail scraping or AI analysis — subsequent runs will only process NEW URLs.
        is_initial_flag = (
            r.hget(f"crawl_job:{job_id}", "is_initial_run") if job_id else None
        )
        is_initial_run = is_initial_flag is not None and int(is_initial_flag) == 1

        if is_initial_run:
            db = SessionLocal()
            try:
                stored = 0
                for link in filtered_links:
                    entry_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{link}"))
                    if not db.query(JobEntry).filter(JobEntry.id == entry_id).first():
                        db.add(
                            JobEntry(
                                id=entry_id,
                                url=link,
                                title="",
                                company="",
                                description="",
                                match_score=0.0,
                                reasoning="",
                                status="SEEN",
                                user_id=user_id,
                                platform_id=platform_id,
                            )
                        )
                        stored += 1
                db.commit()
                logger.info(
                    f"Initial run: stored {stored} URL placeholders for job {job_id}."
                )
            except Exception as db_e:
                logger.error(f"Error storing initial URLs for job {job_id}: {db_e}")
                db.rollback()
            finally:
                db.close()

            if job_id:
                n = len(filtered_links)
                r.hset(
                    f"crawl_job:{job_id}",
                    mapping={
                        "total": n,
                        "scraping_completed": n,
                        "jobs_saved": stored,
                        "status": "completed",
                    },
                )
                r.srem(f"user:{user_id}:active_crawls", job_id)
                r.delete("system:crawling")
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "crawl_job_completed",
                            "job_id": job_id,
                            "user_id": user_id,
                            "total": n,
                            "total_found": total_found,
                        }
                    ),
                )
                r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
            return

        # Re-check right before dispatch: a cancel may have arrived while we
        # were setting up Redis state above.
        if _is_cancelled(r, job_id):
            logger.info(f"[schedule_crawls] Job {job_id} cancelled before dispatch — skipping.")
            r.delete("system:crawling")
            return

        for link in filtered_links:
            result = celery_app.send_task(
                "scraper.scrape_detail",
                args=[link, user_id, job_id, platform_id],
                queue="scraper_queue",
            )
            # Track the real Celery task id so a cancel can revoke queued tasks.
            if job_id:
                r.sadd(f"crawl_job:{job_id}:task_ids", result.id)
        if job_id:
            r.expire(f"crawl_job:{job_id}:task_ids", 3600)

        logger.info(f"All {len(filtered_links)} tasks scheduled.")

    except Exception as e:
        logger.error(f"Error in schedule_crawls_task: {e}", exc_info=True)
        if job_id:
            from scraper_api import fail_crawl_job

            fail_crawl_job(job_id, user_id, error_message=str(e))


def _mark_scrape_failed(r, job_id, user_id):
    """
    Account for a URL that failed to scrape in the completion tracking.
    Increments jobs_skipped and publishes crawl_job_completed if all URLs are done.
    """
    if not job_id:
        return
    # Increment first, then read fresh state to avoid stale reads
    jobs_skipped = int(r.hincrby(f"crawl_job:{job_id}", "jobs_skipped", 1))
    job_hash = r.hgetall(f"crawl_job:{job_id}")
    if not job_hash:
        return
    jobs_saved = int(job_hash.get(b"jobs_saved", 0))
    total = int(job_hash.get(b"total", 0))
    if total > 0 and (jobs_saved + jobs_skipped) >= total:
        stored_user_id = int(job_hash.get(b"user_id", user_id or 0))
        total_found_raw = job_hash.get(b"total_found")
        total_found = int(total_found_raw) if total_found_raw else total
        r.hset(f"crawl_job:{job_id}", "status", "completed")
        r.srem(f"user:{stored_user_id}:active_crawls", job_id)
        r.delete("system:crawling")
        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "crawl_job_completed",
                    "job_id": job_id,
                    "user_id": stored_user_id,
                    "total": total,
                    "total_found": total_found,
                }
            ),
        )
        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))


@celery_app.task(name="scraper.scrape_detail")
def scrape_job_detail_task(url, user_id=1, job_id=None, platform_id=None, force_browser=False):
    logger.info(f"[TASK] Scraping Detail for: {url} (User: {user_id}, Job: {job_id})")

    r = redis.from_url(REDIS_URL)
    db = SessionLocal()

    try:
        # Bail out immediately if the crawl job was cancelled
        if _is_cancelled(r, job_id):
            logger.info(f"[TASK] Crawl job {job_id} cancelled — skipping {url}")
            return

        html = get_html(url)

        # Second checkpoint: the browser load can take 30-60s. If a cancel arrived
        # in the meantime, stop here — before any AI work, DB writes or hincrby that
        # would resurrect the deleted crawl job and keep the pipeline alive.
        if _is_cancelled(r, job_id):
            logger.info(f"[TASK] Crawl job {job_id} cancelled during fetch — discarding {url}")
            return

        if not html:
            logger.warning(f"Skipping {url} due to download failure.")
            if job_id:
                r.hset(f"crawl_job:{job_id}", "status", "failed")
                r.hset(
                    f"crawl_job:{job_id}",
                    "error_message",
                    "URL konnte nicht erreicht werden",
                )
                r.srem(f"user:{user_id}:active_crawls", job_id)
                r.delete("system:crawling")
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "crawl_job_failed",
                            "job_id": job_id,
                            "user_id": user_id,
                            "reason": "error",
                            "error_message": "URL konnte nicht erreicht werden",
                        }
                    ),
                )
            return

        content = get_clean_content(html)
        if not content:
            logger.warning(f"No clean content extracted from {url}")

        # Intelligent extraction of job details using AI
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        user_language = getattr(profile, "language", "de") if profile else "de"
        model = get_model(db)
        api_key = get_api_key(db)

        if job_id:
            extracting_count = int(
                r.hincrby(f"crawl_job:{job_id}", "extracting_count", 1)
            )
            total_bytes = r.hget(f"crawl_job:{job_id}", "total")
            extr_total = int(total_bytes.decode("utf-8")) if total_bytes else 0
            platform_bytes = r.hget(f"crawl_job:{job_id}", "platform_url")
            extr_platform = (
                platform_bytes.decode("utf-8") if platform_bytes else "Unknown"
            )
            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "crawl_job_extracting",
                        "job_id": job_id,
                        "user_id": user_id,
                        "platform": extr_platform,
                        "extracting_count": extracting_count,
                        "total": extr_total,
                    }
                ),
            )

        logger.info(f"Extracting job details intelligently for {url}...")
        intelligent_content = extract_job_details(
            content, model=model, api_key=api_key, language=user_language
        )

        # Use intelligent_content as the new description, truncated to 4000 characters
        # for initial storage (analyze_job will get the full data if needed or stay within limits)
        final_description = (intelligent_content or content)[:10000]

        soup = BeautifulSoup(html, "html.parser")
        title = (
            soup.find("h1").get_text().strip() if soup.find("h1") else "Job Position"
        )

        extracted_job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{url}"))
        logger.info(f"Extracted Job: '{title}' (ID: {extracted_job_id}) from {url}")

        job_data = {
            "id": extracted_job_id,
            "title": title,
            "company": urlparse(url).netloc,
            "description": final_description,
            "url": url,
            "user_id": user_id,
            "crawl_job_id": job_id,
            "platform_id": platform_id,
        }

        celery_app.send_task("ai.analyze_job", args=[job_data], queue="ai_queue")
        logger.info(f"Triggered ai.analyze_job for {extracted_job_id}")

        if job_id:
            scraping_completed = int(
                r.hincrby(f"crawl_job:{job_id}", "scraping_completed", 1)
            )
            total_bytes = r.hget(f"crawl_job:{job_id}", "total")
            total = int(total_bytes.decode("utf-8")) if total_bytes else 0

            total_found_bytes = r.hget(f"crawl_job:{job_id}", "total_found")
            total_found = (
                int(total_found_bytes.decode("utf-8")) if total_found_bytes else total
            )

            platform_bytes = r.hget(f"crawl_job:{job_id}", "platform_url")
            platform_url = (
                platform_bytes.decode("utf-8") if platform_bytes else "Unknown"
            )

            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "crawl_job_progress",
                        "job_id": job_id,
                        "user_id": user_id,
                        "platform": platform_url,
                        "total": total,
                        "total_found": total_found,
                        "scraping_completed": scraping_completed,
                    }
                ),
            )

    except Exception as e:
        logger.error(f"Error in scrape_job_detail_task for {url}: {e}", exc_info=True)
        _mark_scrape_failed(r, job_id, user_id)
    finally:
        db.close()
