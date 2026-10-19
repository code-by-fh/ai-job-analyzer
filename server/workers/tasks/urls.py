"""Celery task: filter scraped URLs down to job-detail pages using the platform's stored url_pattern."""

import os
from urllib.parse import urlparse

import redis

from core.celery_config import celery_app
from core.crawl_progress import LINKS_MATCHED_FIELD
from core.logger import get_logger
from core.platform_rules import url_matches_pattern
from core.url_safety import host_for_log
from database.core import SessionLocal, JobEntry, JobPlatform
from workers.crawl_control import INTERNAL_FAILURE, fail_crawl_job

logger = get_logger(__name__)


def _own_url_pattern(db, platform_id, user_id):
    """The platform's url_pattern, only for the crawl's owner: the platform id reaches /scraper/search from the client."""
    if not platform_id:
        return None
    platform = db.query(JobPlatform).filter(JobPlatform.id == platform_id, JobPlatform.user_id == user_id).first()
    return platform.url_pattern if platform else None


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
        # The count only: the args hold the start URL and every page link with path and query.
        logger.error(f"Invalid args unpacking in filter_urls: {len(args)} items")
        return []

    r_check = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))
    if job_id and (
        r_check.exists(f"crawl_job:{job_id}:cancelled")
        or not r_check.exists(f"crawl_job:{job_id}")
    ):
        logger.info(f"[filter_urls] Job {job_id} was cancelled — skipping.")
        return [[], user_id, job_id, platform_id]

    logger.info(f"Filtering URLs — input: {len(urls_list)}, platform_id: {platform_id}")

    db = SessionLocal()
    try:
        url_pattern = _own_url_pattern(db, platform_id, user_id)

        if not url_pattern:
            logger.warning(f"No url_pattern set for platform {platform_id}, skipping all URLs")
            return [[], user_id, job_id, platform_id]

        filtered_urls = [url for url in urls_list if url_matches_pattern(url, url_pattern)]
        logger.info(f"Pattern '{url_pattern}' matched {len(filtered_urls)} of {len(urls_list)} URLs")
        # hset would recreate the hash of a crawl cancelled meanwhile.
        if job_id and r_check.exists(f"crawl_job:{job_id}"):
            r_check.hset(f"crawl_job:{job_id}", LINKS_MATCHED_FIELD, len(filtered_urls))

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
                        r_dedup = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))
                        r_dedup.hset(f"crawl_job:{job_id}", "total_found", before)
            except Exception as dedup_e:
                logger.error(f"Deduplication error: {dedup_e}")

        logger.info(f"Final: {len(filtered_urls)} new URLs to scrape.")
        return [filtered_urls, user_id, job_id, platform_id]

    except Exception as e:
        logger.error(f"Filter error for host {host_for_log(base_url)}: {e}", exc_info=True)
        if job_id:
            # Direct call: the worker has no session cookie for the scraper's /fail-crawl endpoint.
            fail_crawl_job(r_check, job_id, user_id, failure=INTERNAL_FAILURE)
        return []
    finally:
        db.close()
