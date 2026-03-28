import os
import time
from typing import Optional
import logging
import uuid
import json
from celery import chain
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from core.scraper_celery_config import celery_app
import redis

from core.auth import get_current_user
from database.core import User
from core.logger import get_logger

logger = get_logger(__name__)

app = FastAPI()
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
r = redis.from_url(REDIS_URL)


def cleanup_stale_jobs():
    """Remove stale/completed jobs from Redis on startup"""
    logger.info("🧹 Cleaning up stale crawl jobs from Redis...")

    # Get all user active_crawls sets
    user_keys = r.keys("user:*:active_crawls")
    total_removed = 0

    for user_key in user_keys:
        job_ids = r.smembers(user_key)
        for job_id_bytes in job_ids:
            job_id = job_id_bytes.decode("utf-8")
            job_data = r.hgetall(f"crawl_job:{job_id}")

            if not job_data:
                # Job hash doesn't exist, remove from set
                r.srem(user_key, job_id)
                total_removed += 1
                logger.info(f"Removed orphaned job {job_id}")
            else:
                status = job_data.get(b"status", b"").decode("utf-8")
                total = int(job_data.get(b"total", 0))
                analysis_completed = int(job_data.get(b"analysis_completed", 0))

                # Remove if completed or stale
                if status == "completed" or (total > 0 and analysis_completed >= total):
                    r.srem(user_key, job_id)
                    r.delete(f"crawl_job:{job_id}")
                    r.delete(f"crawl_job:{job_id}:all_job_titles")
                    total_removed += 1
                    logger.info(f"Removed completed job {job_id}")

    logger.info(f" Cleanup complete. Removed {total_removed} stale jobs.")


def cleanup_crawl_job(job_id, user_id, reason="error"):
    """
    Cleanup all Redis data for a crawl job.
    Called on error or cancellation.
    """
    try:
        logger.info(f"🧹 Cleaning up crawl job {job_id} (reason: {reason})")

        r.delete(f"crawl_job:{job_id}")
        r.delete(f"crawl_job:{job_id}:all_job_titles")
        r.srem(f"user:{user_id}:active_crawls", job_id)
        r.delete("system:crawling")

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": (
                        "crawl_job_failed"
                        if reason == "error"
                        else "crawl_job_cancelled"
                    ),
                    "job_id": job_id,
                    "user_id": user_id,
                    "reason": reason,
                }
            ),
        )

    except Exception as e:
        logger.error(f"Error during cleanup of job {job_id}: {e}")


def fail_crawl_job(job_id: str, user_id: int, error_message: str):
    """
    Broadcast a crawl failure event and immediately clean up all Redis data.
    No user confirmation required — the frontend auto-dismisses after a timeout.
    """
    try:
        logger.info(f"Failing crawl job {job_id} (error: {error_message})")
        r.delete("system:crawling")

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "crawl_job_failed",
                    "job_id": job_id,
                    "user_id": user_id,
                    "reason": "error",
                    "error_message": error_message,
                }
            ),
        )

        # Clean up immediately — no lingering failed state
        r.delete(f"crawl_job:{job_id}")
        r.delete(f"crawl_job:{job_id}:all_job_titles")
        r.srem(f"user:{user_id}:active_crawls", job_id)

        logger.info(f" Crawl job {job_id} failed and cleaned up")
    except Exception as e:
        logger.error(f"Error during fail of job {job_id}: {e}")


try:
    cleanup_stale_jobs()
except Exception as e:
    logger.warning(f"Startup cleanup skipped (Redis not ready): {e}")


class JobSearch(BaseModel):
    query: str
    location: str
    platform_id: Optional[int] = None
    is_initial_run: bool = False


def _is_http_url(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


@app.post("/search")
async def search_jobs(search: JobSearch, current_user: User = Depends(get_current_user)):
    if not _is_http_url(search.query):
        return {"status": "Error", "message": "URL muss mit http(s) beginnen."}

    user_id = current_user.id
    job_id = str(uuid.uuid4())

    r.hset(
        f"crawl_job:{job_id}",
        mapping={
            "user_id": user_id,
            "platform_url": search.query,
            "total": 0,
            "scraping_completed": 0,
            "analysis_completed": 0,
            "jobs_saved": 0,
            "status": "starting",
            "started_at": str(int(time.time() * 1000)),
            "is_initial_run": int(search.is_initial_run),
        },
    )
    r.expire(f"crawl_job:{job_id}", 3600)  # TTL: 1 hour
    r.sadd(f"user:{user_id}:active_crawls", job_id)

    workflow = chain(
        celery_app.signature(
            "scraper.fetch_links",
            args=[search.query, user_id, job_id, search.platform_id],
            queue="scraper_queue",
        ),
        celery_app.signature("ai.filter_urls", queue="ai_queue"),
        celery_app.signature("scraper.schedule_crawls", queue="scraper_queue"),
    )
    workflow.apply_async()
    return {"status": "Started", "job_id": job_id}


class JobImport(BaseModel):
    url: str


@app.post("/import-job")
async def import_job(data: JobImport, current_user: User = Depends(get_current_user)):
    if not _is_http_url(data.url):
        return {"status": "Error", "message": "URL muss mit http(s) beginnen."}

    user_id = current_user.id
    job_id = str(uuid.uuid4())

    r.hset(
        f"crawl_job:{job_id}",
        mapping={
            "user_id": user_id,
            "platform_url": data.url,
            "total": 1,
            "scraping_completed": 0,
            "analysis_completed": 0,
            "jobs_saved": 0,
            "status": "starting",
            "started_at": str(int(time.time() * 1000)),
            "is_initial_run": 0,
        },
    )
    r.expire(f"crawl_job:{job_id}", 3600)
    r.sadd(f"user:{user_id}:active_crawls", job_id)

    celery_app.send_task(
        "scraper.scrape_detail",
        args=[data.url, user_id, job_id, None],
        queue="scraper_queue",
    )
    return {"status": "Started", "job_id": job_id}


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
        celery_app.control.revoke(request.job_id, terminate=True, signal="SIGKILL")

        cleanup_crawl_job(request.job_id, user_id, reason="cancelled")

        logger.info(f"Successfully cancelled crawl job {request.job_id}")
        return {"status": "success", "message": "Crawl job cancelled"}
    except Exception as e:
        logger.error(f"Error cancelling job {request.job_id}: {e}")
        return {"status": "error", "message": str(e)}


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
        # Revoke running celery task if any
        celery_app.control.revoke(request.job_id, terminate=True, signal="SIGKILL")

        logger.info(f"Job {request.job_id} failed due to: {request.error_message}")

        # Broadcast error event, then clean up immediately
        fail_crawl_job(request.job_id, user_id, request.error_message)

        return {"status": "success", "message": "Crawl job failed"}
    except Exception as e:
        logger.error(f"Error failing job {request.job_id}: {e}")
        return {"status": "error", "message": str(e)}
