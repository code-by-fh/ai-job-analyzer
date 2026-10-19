import os
import time
from typing import NamedTuple, Optional
import logging
import uuid
import json
from celery import chain
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from core.scraper_celery_config import celery_app
import redis
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from database.core import User
from core.crawl_errors import CRAWL_INTERNAL_ERROR_MESSAGE
from core.crawl_progress import crawl_progress, read_crawl_progress
from core.crawl_registry import (
    ALREADY_RUNNING,
    CRAWL_TTL_SECONDS,
    PROGRESS_FIELD,
    QUEUED_STATUS,
    acquire_crawl_lock,
    active_crawl_for_platform,
    release_crawl_lock,
)
from core.logger import get_logger
from core.profile_rules import PROFILE_REQUIRED, user_profile_complete
from core.url_safety import public_http_url
from workers.crawl_control import CrawlFailure, cleanup_crawl_job, crawl_failed_event, fail_crawl_job
from workers.tasks.platform_runs import ERROR_FAILED, record_platform_run

logger = get_logger(__name__)


REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
r = redis.from_url(REDIS_URL)


def _clear_stale_job(user_key, job_id: str, job_data: dict) -> None:
    """Record the interrupted run (it frees the platform lock by token), drop the crawl and tell the web it ended."""
    record_platform_run(r, job_id, error=ERROR_FAILED)
    stored_user_id = int(job_data.get(b"user_id", b"0"))
    r.srem(user_key, job_id)
    r.delete(f"crawl_job:{job_id}")
    r.delete(f"crawl_job:{job_id}:all_job_titles")
    r.delete(f"crawl_job:{job_id}:task_ids")
    r.delete(f"crawl_job:{job_id}:cancelled")
    # The web learns of a crawl end only from events, so a silent removal would leave the row running.
    r.publish("job_updates", json.dumps(crawl_failed_event(job_id, stored_user_id)))
    logger.info(f"Cleared job {job_id} (user {stored_user_id})")


def cleanup_stale_jobs():
    """Remove all in-flight and completed crawl jobs on startup.

    Any job that was running when the server/worker last stopped is now
    orphaned — Celery workers have restarted and will never finish them.
    Clean them all up so the frontend starts with a blank slate.
    """
    logger.info("Cleaning up stale crawl jobs from Redis...")
    total_removed = 0
    for user_key in r.keys("user:*:active_crawls"):
        for job_id_bytes in r.smembers(user_key):
            job_id = job_id_bytes.decode("utf-8")
            job_data = r.hgetall(f"crawl_job:{job_id}")
            # Every job goes regardless of status: workers restarted, so an in-flight job never completes.
            if job_data:
                _clear_stale_job(user_key, job_id, job_data)
            else:
                r.srem(user_key, job_id)
            total_removed += 1
    r.delete("system:crawling")
    logger.info(f"Cleanup complete. Removed {total_removed} stale jobs.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Clear orphaned crawls when the scraper API starts, never at import: Celery workers import this module too.

    Crawl locks are left alone; their TTL and the end-of-crawl release free orphans.
    """
    try:
        cleanup_stale_jobs()
    except Exception as e:
        logger.warning(f"Startup cleanup skipped (Redis not ready): {e}")
    yield


app = FastAPI(lifespan=lifespan)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Fixed text: the refusal never echoes the URL or what it resolved to.
URL_REFUSED_MESSAGE = "URL muss mit http(s) beginnen und auf eine öffentliche Adresse zeigen."


class JobSearch(BaseModel):
    query: str
    location: str
    platform_id: Optional[int] = None
    is_initial_run: bool = False


def _fetchable_url(url: str) -> Optional[str]:
    """The canonical URL to queue, or None for a private target; the worker checks again before fetching.

    Resolves DNS (blocking, bounded): async endpoints call it through run_in_threadpool.
    """
    return public_http_url(url)


def _init_crawl_job(job_id: str, user_id: int, platform_url: str, total: int, is_initial_run: bool) -> None:
    started_at = str(int(time.time() * 1000))
    r.hset(
        f"crawl_job:{job_id}",
        mapping={
            "user_id": user_id,
            "platform_url": platform_url,
            "total": total,
            "scraping_completed": 0,
            "analysis_completed": 0,
            "jobs_saved": 0,
            "status": QUEUED_STATUS,
            "started_at": started_at,
            PROGRESS_FIELD: started_at,
            "is_initial_run": int(is_initial_run),
        },
    )
    r.expire(f"crawl_job:{job_id}", CRAWL_TTL_SECONDS)
    r.sadd(f"user:{user_id}:active_crawls", job_id)


def _remember_platform(job_id: str, platform_id: Optional[int]) -> None:
    """Keep the platform on the crawl hash so the finished run can be summarised on it."""
    if platform_id is not None:
        r.hset(f"crawl_job:{job_id}", "platform_id", platform_id)


def _claim_platform(user_id: int, platform_id: int, job_id: str) -> bool:
    """One crawl per source: a second would double every job and race the first one's summary.

    The registry read refuses a crawl started before the lock existed; the SET NX lock makes the claim atomic.
    """
    if active_crawl_for_platform(r, user_id, platform_id):
        return False
    return acquire_crawl_lock(r, user_id, platform_id, job_id)


class CrawlStart(NamedTuple):
    search: "JobSearch"
    user_id: int
    job_id: str
    query_url: str


def _queue_crawl(start: CrawlStart) -> None:
    search, user_id, job_id, query_url = start
    _init_crawl_job(job_id, user_id, query_url, total=0, is_initial_run=search.is_initial_run)
    _remember_platform(job_id, search.platform_id)

    workflow = chain(
        celery_app.signature(
            "scraper.fetch_links",
            args=[query_url, user_id, job_id, search.platform_id],
            queue="scraper_queue",
        ),
        celery_app.signature("ai.filter_urls", queue="ai_queue"),
        celery_app.signature("scraper.schedule_crawls", queue="scraper_queue"),
    )
    workflow.apply_async()


@app.post("/search")
async def search_jobs(
    search: JobSearch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The public API gates its own starts; this guards the /scraper/* proxy, which reaches here directly.
    if not user_profile_complete(db, current_user.id):
        raise HTTPException(status_code=409, detail=PROFILE_REQUIRED)
    query_url = await run_in_threadpool(_fetchable_url, search.query)
    if query_url is None:
        return {"status": "Error", "message": URL_REFUSED_MESSAGE}

    user_id = current_user.id
    job_id = str(uuid.uuid4())
    if search.platform_id is not None and not _claim_platform(user_id, search.platform_id, job_id):
        return {"status": "Error", "code": ALREADY_RUNNING, "message": "Crawl already running."}

    try:
        _queue_crawl(CrawlStart(search, user_id, job_id, query_url))
    except Exception:
        # The claim is made before queueing; a start that never got queued must not block the source for an hour.
        if search.platform_id is not None:
            release_crawl_lock(r, user_id, search.platform_id, job_id)
        raise
    return {"status": "Started", "job_id": job_id}


class JobImport(BaseModel):
    url: str


@app.post("/import-job")
async def import_job(data: JobImport, current_user: User = Depends(get_current_user)):
    job_url = await run_in_threadpool(_fetchable_url, data.url)
    if job_url is None:
        return {"status": "Error", "message": URL_REFUSED_MESSAGE}

    user_id = current_user.id
    job_id = str(uuid.uuid4())

    _init_crawl_job(job_id, user_id, job_url, total=1, is_initial_run=False)

    # Notify frontend that crawl job started
    r.publish("job_updates", json.dumps({
        "type": "crawl_job_started",
        "job_id": job_id,
        "user_id": user_id,
        "platform": job_url,
        "started_at": str(int(time.time() * 1000)),
        "progress": read_crawl_progress(r, job_id),
    }))

    celery_app.send_task(
        "scraper.scrape_detail",
        args=[job_url, user_id, job_id, None],
        queue="scraper_queue",
    )
    return {"status": "Started", "job_id": job_id}


def _optional_int(raw) -> Optional[int]:
    return int(raw) if raw not in (None, b"", "") else None


@app.get("/crawl-status")
async def get_crawl_status(current_user: User = Depends(get_current_user)):
    user_id = current_user.id
    job_ids = r.smembers(f"user:{user_id}:active_crawls")
    jobs = []

    for job_id_bytes in job_ids:
        job_id = job_id_bytes.decode("utf-8")
        job_data = r.hgetall(f"crawl_job:{job_id}")

        if job_data:
            all_job_titles_bytes = r.lrange(f"crawl_job:{job_id}:all_job_titles", 0, -1)
            all_job_titles = [title.decode("utf-8") for title in all_job_titles_bytes]
            logger.info(
                f"Crawl status for {job_id}: Retrieved {len(all_job_titles)} job titles from Redis"
            )

            total = int(job_data.get(b"total", 0))
            total_found_raw = job_data.get(b"total_found", None)
            total_found = int(total_found_raw) if total_found_raw is not None else total
            jobs.append(
                {
                    "job_id": job_id,
                    "platform": job_data.get(b"platform_url", b"").decode("utf-8"),
                    "platform_id": _optional_int(job_data.get(b"platform_id")),
                    "total": total,
                    "total_found": total_found,
                    "scraping_completed": int(job_data.get(b"scraping_completed", 0)),
                    "analysis_completed": int(job_data.get(b"analysis_completed", 0)),
                    "jobs_saved": int(job_data.get(b"jobs_saved", 0)),
                    "status": job_data.get(b"status", b"unknown").decode("utf-8"),
                    "error_message": job_data.get(b"error_message", b"").decode(
                        "utf-8"
                    ),
                    "started_at": job_data.get(b"started_at", b"").decode("utf-8"),
                    "all_job_titles": all_job_titles,
                    "progress": crawl_progress(job_data),
                }
            )

    return {"jobs": jobs}


class CancelCrawlRequest(BaseModel):
    job_id: str


@app.post("/cancel-crawl")
async def cancel_crawl(request: CancelCrawlRequest, current_user: User = Depends(get_current_user)):
    user_id = current_user.id
    logger.info(f"Cancelling crawl job {request.job_id} for user {user_id}")

    job_data = r.hgetall(f"crawl_job:{request.job_id}")
    if not job_data:
        return {"status": "error", "message": "Job not found"}

    stored_user_id = int(job_data.get(b"user_id", 0))
    if stored_user_id != user_id:
        return {"status": "error", "message": "Unauthorized"}

    try:
        cleanup_crawl_job(r, request.job_id, user_id, reason="cancelled")
        logger.info(f"Successfully cancelled crawl job {request.job_id}")
        return {"status": "success", "message": "Crawl job cancelled"}
    except Exception as e:
        logger.error(f"Error cancelling job {request.job_id}: {e}", exc_info=True)
        return {"status": "error", "message": CRAWL_INTERNAL_ERROR_MESSAGE}


@app.post("/cancel-all-crawls")
async def cancel_all_crawls(current_user: User = Depends(get_current_user)):
    user_id = current_user.id
    job_ids_bytes = r.smembers(f"user:{user_id}:active_crawls")
    cancelled = []

    for job_id_bytes in job_ids_bytes:
        job_id = job_id_bytes.decode("utf-8")
        cleanup_crawl_job(r, job_id, user_id, reason="cancelled")
        cancelled.append(job_id)

    logger.info(f"Cancelled all {len(cancelled)} crawl jobs for user {user_id}")
    return {"status": "success", "cancelled": cancelled}


class PreviewLinksRequest(BaseModel):
    url: str


@app.post("/preview-links")
def preview_links(request: PreviewLinksRequest, current_user: User = Depends(get_current_user)):
    page_url = _fetchable_url(request.url)
    if page_url is None:
        return {"links": []}

    from workers.scraper_worker import get_html_with_browser
    from bs4 import BeautifulSoup
    from urllib.parse import urlparse, urljoin

    html = get_html_with_browser(page_url)
    if not html:
        return {"links": []}

    soup = BeautifulSoup(html, "html.parser")
    links: set = set()
    base_domain = urlparse(page_url).netloc

    link_map: dict = {}
    for a in soup.find_all("a", href=True):
        full_url = urljoin(page_url, a["href"])
        if urlparse(full_url).netloc != base_domain:
            continue
        if any(full_url.lower().endswith(x) for x in [".pdf", ".jpg", ".png", ".css", ".js"]):
            continue
        text = a.get_text(strip=True)[:120]
        if full_url not in link_map or (text and not link_map[full_url]["text"]):
            link_map[full_url] = {"url": full_url, "text": text}

    links_sorted = sorted(link_map.values(), key=lambda x: x["url"])
    return {"links": links_sorted}


class FailCrawlRequest(BaseModel):
    job_id: str
    error_message: str


@app.post("/fail-crawl")
async def fail_crawl(request: FailCrawlRequest, current_user: User = Depends(get_current_user)):
    user_id = current_user.id
    logger.info(
        f"Failing crawl job {request.job_id} for user {user_id}: {request.error_message}"
    )

    job_data = r.hgetall(f"crawl_job:{request.job_id}")
    if not job_data:
        return {"status": "error", "message": "Job not found"}

    stored_user_id = int(job_data.get(b"user_id", 0))
    if stored_user_id != user_id:
        return {"status": "error", "message": "Unauthorized"}

    try:
        logger.info(f"Job {request.job_id} failed due to: {request.error_message}")

        # Broadcast error event, then clean up immediately
        fail_crawl_job(r, request.job_id, user_id, CrawlFailure(request.error_message, ERROR_FAILED))

        return {"status": "success", "message": "Crawl job failed"}
    except Exception as e:
        logger.error(f"Error failing job {request.job_id}: {e}", exc_info=True)
        return {"status": "error", "message": CRAWL_INTERNAL_ERROR_MESSAGE}
