import os
import json
import uuid
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import redis

from core.scraper_celery_config import celery_app, REDIS_URL
from intelligence.service import extract_job_details, get_client_and_model
from database.core import SessionLocal, UserProfile, JobEntry
from services import page_rendering

# Logging Setup
from core.crawl_progress import LINKS_FOUND_FIELD, PAGES_FAILED_FIELD, read_crawl_progress
from core.crawl_registry import touch_crawl_progress
from core.logger import get_logger
from workers.crawl_control import INTERNAL_FAILURE, UNREACHABLE_FAILURE, fail_crawl_job
from core.url_safety import canonical_http_url, host_for_log, is_public_http_url
from workers.tasks.platform_runs import record_platform_run

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


def _is_safe_url(url: str) -> bool:
    """http(s) to public addresses only (core/url_safety.py); the name stays because tests patch it.

    Runs right before every render call, so a name re-pointed since the API check is refused; the
    render service still resolves again itself and must guard that itself (see core/url_safety.py).
    """
    return is_public_http_url(url)


def get_html(url: str) -> str | None:
    """Fetch page HTML using the render API."""
    return get_html_with_browser(url)


def get_html_with_browser(url: str) -> str | None:
    host = host_for_log(url)
    target = canonical_http_url(url)
    if target is None or not _is_safe_url(target):
        logger.warning(f"Blocked SSRF attempt for host: {host}")
        return None
    # Render the canonical form: it names exactly the host the check above resolved.
    logger.info(f"[RenderClient] Fetching from host: {host}")
    html = page_rendering.fetch_html(target)
    if html:
        logger.info(f"[RenderClient] Fetched {len(html)} bytes from host {host}")
    else:
        logger.warning(f"[RenderClient] Empty response from host {host}")
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
def fetch_links_task(start_url, user_id, job_id=None, platform_id=None):
    logger.info(
        f"[TASK] Fetching links started for host: {host_for_log(start_url)} (User: {user_id}, Job: {job_id})"
    )

    r = redis.from_url(REDIS_URL)

    try:
        # Before the first write: a reaped or cancelled crawl has no hash, and hset would recreate it unlocked.
        if _is_cancelled(r, job_id):
            logger.info(f"[fetch_links] Job {job_id} was cancelled — skipping.")
            r.delete("system:crawling")
            return None

        if job_id:
            touch_crawl_progress(r, job_id)
            r.hset(f"crawl_job:{job_id}", "status", "fetching_links")
            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "crawl_job_started",
                        "job_id": job_id,
                        "user_id": user_id,
                        "platform": start_url,
                        "platform_id": platform_id,
                        "started_at": str(int(time.time() * 1000)),
                        "progress": read_crawl_progress(r, job_id),
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
            logger.warning(f"Failed to fetch content from host {host_for_log(start_url)}. Aborting crawl.")
            if job_id:
                # Fixed text: it reaches the user's crawl error and must not carry the URL.
                fail_crawl_job(r, job_id, user_id, failure=UNREACHABLE_FAILURE)
            else:
                r.delete("system:crawling")
                r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": user_id}))
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

        logger.info(f"Found {len(all_links)} internal links on host {host_for_log(start_url)}")
        # The render can take a minute: a crawl cancelled meanwhile must not get its hash back.
        if job_id and not _is_cancelled(r, job_id):
            _report_links_found(r, job_id, user_id, start_url, len(all_links))
        if not all_links:
            logger.warning(f"[fetch_links] No internal <a href> links found — page may be SPA-rendered without href attributes")
        return [start_url, list(all_links), user_id, job_id, platform_id]

    except Exception as e:
        logger.error(f"Error in fetch_links_task for host {host_for_log(start_url)}: {e}", exc_info=True)
        if job_id:
            fail_crawl_job(r, job_id, user_id, failure=INTERNAL_FAILURE)
        else:
            r.delete("system:crawling")
            r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": user_id}))
        return None


def _report_links_found(r, job_id, user_id, start_url, links_found):
    """Store the start page's link count; the crawl is filtering them now (no new links known yet, total 0)."""
    touch_crawl_progress(r, job_id)
    r.hset(f"crawl_job:{job_id}", LINKS_FOUND_FIELD, links_found)
    r.publish(
        "job_updates",
        json.dumps(
            {
                "type": "crawl_job_progress",
                "job_id": job_id,
                "user_id": user_id,
                "platform": start_url,
                "total": 0,
                "progress": read_crawl_progress(r, job_id),
            }
        ),
    )


@celery_app.task(name="scraper.schedule_crawls")
def schedule_crawls_task(args):
    if not args or len(args) < 2:
        logger.error("Invalid args for schedule_crawls_task")
        return

    job_id = None
    platform_id = None
    user_id = 1

    try:
        r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))

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
                record_platform_run(r, job_id)
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
                            "progress": read_crawl_progress(r, job_id),
                        }
                    ),
                )

            r.delete("system:crawling")
            r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": user_id}))
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
            touch_crawl_progress(r, job_id)
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
                        "progress": read_crawl_progress(r, job_id),
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
                touch_crawl_progress(r, job_id)
                r.hset(
                    f"crawl_job:{job_id}",
                    mapping={
                        "total": n,
                        "scraping_completed": n,
                        "jobs_saved": stored,
                        "status": "completed",
                    },
                )
                record_platform_run(r, job_id)
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
                            "progress": read_crawl_progress(r, job_id),
                        }
                    ),
                )
                r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": user_id}))
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
            fail_crawl_job(r, job_id, user_id, failure=INTERNAL_FAILURE)


def _mark_scrape_failed(r, job_id, user_id):
    """
    Account for a URL that failed to scrape in the completion tracking.
    Increments jobs_skipped and publishes crawl_job_completed if all URLs are done.
    """
    if not job_id:
        return
    # Increment first, then read fresh state to avoid stale reads
    touch_crawl_progress(r, job_id)
    r.hincrby(f"crawl_job:{job_id}", PAGES_FAILED_FIELD, 1)
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
        record_platform_run(r, job_id)
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
                    "progress": read_crawl_progress(r, job_id),
                }
            ),
        )
        r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": stored_user_id}))


@celery_app.task(name="scraper.scrape_detail")
def scrape_job_detail_task(url, user_id, job_id=None, platform_id=None, force_browser=False):
    host = host_for_log(url)
    logger.info(f"[TASK] Scraping Detail for host: {host} (User: {user_id}, Job: {job_id})")

    r = redis.from_url(REDIS_URL)
    db = SessionLocal()

    try:
        # Bail out immediately if the crawl job was cancelled
        if _is_cancelled(r, job_id):
            logger.info(f"[TASK] Crawl job {job_id} cancelled — skipping a page on {host}")
            return

        html = get_html(url)

        # Second checkpoint: the browser load can take 30-60s. If a cancel arrived
        # in the meantime, stop here — before any AI work, DB writes or hincrby that
        # would resurrect the deleted crawl job and keep the pipeline alive.
        if _is_cancelled(r, job_id):
            logger.info(f"[TASK] Crawl job {job_id} cancelled during fetch — discarding a page on {host}")
            return

        if not html:
            logger.warning(f"Failing the crawl: a page on {host} could not be downloaded.")
            if job_id:
                # A dead detail link fails the whole run (stored as unreachable); see the tracker's Open Questions.
                fail_crawl_job(r, job_id, user_id, failure=UNREACHABLE_FAILURE)
            return

        content = get_clean_content(html)
        if not content:
            logger.warning(f"No clean content extracted from a page on {host}")

        # Intelligent extraction of job details using AI
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()

        user_language = getattr(profile, "language", "de") if profile else "de"
        client, model = get_client_and_model("extract_job_details", db)

        if job_id:
            touch_crawl_progress(r, job_id)
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
                        "progress": read_crawl_progress(r, job_id),
                    }
                ),
            )

        logger.info(f"Extracting job details intelligently for a page on {host}...")
        intelligent_content = extract_job_details(
            content, model=model, client=client, language=user_language
        )

        # Use intelligent_content as the new description, truncated to 4000 characters
        # for initial storage (analyze_job will get the full data if needed or stay within limits)
        final_description = (intelligent_content or content)[:10000]

        soup = BeautifulSoup(html, "html.parser")
        title = (
            soup.find("h1").get_text().strip() if soup.find("h1") else "Job Position"
        )

        extracted_job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{url}"))
        logger.info(f"Extracted Job: '{title}' (ID: {extracted_job_id}) from {host}")

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
            touch_crawl_progress(r, job_id)
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
                        "progress": read_crawl_progress(r, job_id),
                    }
                ),
            )

    except Exception as e:
        logger.error(f"Error in scrape_job_detail_task for host {host}: {e}", exc_info=True)
        _mark_scrape_failed(r, job_id, user_id)
    finally:
        db.close()
