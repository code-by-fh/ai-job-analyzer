import os
import logging
from celery import chain
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from celery_config import celery_app

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

class JobSearch(BaseModel):
    query: str
    location: str

@app.post("/search")
async def search_jobs(search: JobSearch):
    if not search.query.startswith("http"):
        return {"status": "Error", "message": "URL muss mit http(s) beginnen."}
        
    workflow = chain(
        celery_app.signature('scraper.fetch_links', args=[search.query], queue='scraper_queue'),
        celery_app.signature('ai.filter_urls', queue='ai_queue'),
        celery_app.signature('scraper.schedule_crawls', queue='scraper_queue')
    )
    workflow.apply_async()
    return {"status": "Started"}
