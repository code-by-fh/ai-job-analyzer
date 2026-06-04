"""Celery task: filter scraped URLs down to job-detail pages using the platform's stored url_pattern."""

import os
from urllib.parse import urlparse

import redis
import requests

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, JobPlatform

logger = get_logger(__name__)


@celery_app.task(name="ai.filter_urls")
def filter_urls_task(args):
    if not args:
        logger.warning("filter_urls_task called with empty args")
        return []

    job_id = None
    user_id = 1
    platform_id = None

    try:
        if len(args) == 5:
            base_url, urls_list, user_id, job_id, platform_id = args
        elif len(args) == 4:
            base_url, urls_list, user_id, job_id = args
        elif len(args) == 3:
            base_url, urls_list, user_id = args
        else:
            base_url, urls_list = args
    except ValueError:
        logger.error(f"Invalid args unpacking in filter_urls: {args}")
        return []

    r_check = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    if job_id and (
        r_check.exists(f"crawl_job:{job_id}:cancelled")
        or not r_check.exists(f"crawl_job:{job_id}")
    ):
        logger.info(f"[filter_urls] Job {job_id} was cancelled — skipping.")
        return [[], user_id, job_id, platform_id]

    logger.info(f"Filtering URLs — input: {len(urls_list)}, platform_id: {platform_id}")

    db = SessionLocal()
    try:
        url_pattern = None
        if platform_id:
            platform = db.query(JobPlatform).filter(JobPlatform.id == platform_id).first()
            if platform:
                url_pattern = platform.url_pattern

        if not url_pattern:
            logger.warning(f"No url_pattern set for platform {platform_id}, skipping all URLs")
            return [[], user_id, job_id, platform_id]

        filtered_urls = [url for url in urls_list if url_pattern in url]
        logger.info(f"Pattern '{url_pattern}' matched {len(filtered_urls)} of {len(urls_list)} URLs")

        # Deduplicate against already-scraped URLs for this user
        if filtered_urls and user_id:
            try:
                def _normalize(u):
                    return u.rstrip("/").split("#")[0]

                existing_urls = {
                    _normalize(url)
                    for (url,) in db.query(JobEntry.url)
                    .filter(JobEntry.user_id == user_id, JobEntry.url.isnot(None))
                    .all()
                }
                before = len(filtered_urls)
                filtered_urls = [url for url in filtered_urls if _normalize(url) not in existing_urls]
                skipped = before - len(filtered_urls)
                if skipped > 0:
                    logger.info(f"Deduplication: {skipped} already-known URLs removed.")
                    if job_id:
                        r_dedup = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
                        r_dedup.hset(f"crawl_job:{job_id}", "total_found", before)
            except Exception as dedup_e:
                logger.error(f"Deduplication error: {dedup_e}")

        logger.info(f"Final: {len(filtered_urls)} new URLs to scrape.")
        return [filtered_urls, user_id, job_id, platform_id]

    except Exception as e:
        logger.error(f"Filter error for {base_url}: {e}", exc_info=True)
        if job_id:
            SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
            try:
                requests.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={"job_id": job_id, "user_id": user_id, "error_message": str(e)},
                    timeout=5,
                )
            except Exception:
                pass
        return []
    finally:
        db.close()
