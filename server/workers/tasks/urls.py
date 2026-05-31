"""Celery task: filter scraped URLs down to job-detail pages."""

import os
from datetime import datetime, timezone
from urllib.parse import urlparse

import redis
import requests

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, DomainUrlPattern
from intelligence.service import get_model, get_api_key, detect_url_pattern_with_ai

logger = get_logger(__name__)


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
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:8081"
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
