import os
import logging
import uuid
import json
from celery import chain
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from celery_config import celery_app
import redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
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
            job_id = job_id_bytes.decode('utf-8')
            job_data = r.hgetall(f"crawl_job:{job_id}")
            
            if not job_data:
                # Job hash doesn't exist, remove from set
                r.srem(user_key, job_id)
                total_removed += 1
                logger.info(f"Removed orphaned job {job_id}")
            else:
                status = job_data.get(b"status", b"").decode('utf-8')
                total = int(job_data.get(b"total", 0))
                analysis_completed = int(job_data.get(b"analysis_completed", 0))
                
                # Remove if completed or stale
                if status == "completed" or (total > 0 and analysis_completed >= total):
                    r.srem(user_key, job_id)
                    r.delete(f"crawl_job:{job_id}")
                    total_removed += 1
                    logger.info(f"Removed completed job {job_id}")
    
    logger.info(f"✅ Cleanup complete. Removed {total_removed} stale jobs.")

# Cleanup on startup
cleanup_stale_jobs()


class JobSearch(BaseModel):
    query: str
    location: str
    user_id: int = 1 # Default to 1 (Admin) if not provided

@app.post("/search")
async def search_jobs(search: JobSearch):
    if not search.query.startswith("http"):
        return {"status": "Error", "message": "URL muss mit http(s) beginnen."}
    
    job_id = str(uuid.uuid4())
    
    r.hset(f"crawl_job:{job_id}", mapping={
        "user_id": search.user_id,
        "platform_url": search.query,
        "total": 0,
        "scraping_completed": 0,
        "analysis_completed": 0,
        "jobs_saved": 0,
        "status": "starting",
        "started_at": str(int(os.times().elapsed * 1000))
    })
    r.expire(f"crawl_job:{job_id}", 3600)  # TTL: 1 hour
    r.sadd(f"user:{search.user_id}:active_crawls", job_id)
    
    workflow = chain(
        celery_app.signature('scraper.fetch_links', args=[search.query, search.user_id, job_id], queue='scraper_queue'),
        celery_app.signature('ai.filter_urls', queue='ai_queue'),
        celery_app.signature('scraper.schedule_crawls', queue='scraper_queue')
    )
    workflow.apply_async()
    return {"status": "Started", "job_id": job_id}

@app.get("/crawl-status")
async def get_crawl_status(user_id: int):
    job_ids = r.smembers(f"user:{user_id}:active_crawls")
    jobs = []
    
    for job_id_bytes in job_ids:
        job_id = job_id_bytes.decode('utf-8')
        job_data = r.hgetall(f"crawl_job:{job_id}")
        
        if job_data:
            jobs.append({
                "job_id": job_id,
                "platform": job_data.get(b"platform_url", b"").decode('utf-8'),
                "total": int(job_data.get(b"total", 0)),
                "scraping_completed": int(job_data.get(b"scraping_completed", 0)),
                "analysis_completed": int(job_data.get(b"analysis_completed", 0)),
                "status": job_data.get(b"status", b"unknown").decode('utf-8'),
                "started_at": job_data.get(b"started_at", b"").decode('utf-8')
            })
    
    return {"jobs": jobs}
