import os
import json
import uuid
import time
import logging
import random
from urllib.parse import urljoin, urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup
from celery import Celery, chain
from playwright.sync_api import sync_playwright
import redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery_app = Celery(
    'scraper_worker',
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=REDIS_URL
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class JobSearch(BaseModel):
    query: str
    location: str

def get_html_with_browser(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()
        try:
            logger.info(f"🌍 Browser navigiert zu: {url}")
            page.goto(url, timeout=60000, wait_until="domcontentloaded")
            time.sleep(random.uniform(2, 4))
            return page.content()
        except Exception as e:
            logger.error(f"Playwright Fehler bei {url}: {e}")
            return None
        finally:
            browser.close()

def get_clean_content(html):
    import markdownify
    import re
    soup = BeautifulSoup(html, 'html.parser')
    
    # Radikales Entfernen von Noise
    for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "noscript", "button", "form"]):
        tag.decompose()

    for text_junk in ["Cookies", "Privatsphäre", "Datenschutz", "consent", "Partner"]:
        for element in soup.find_all(text=re.compile(text_junk, re.I)):
            parent = element.find_parent(['div', 'section'])
            if parent:
                parent.decompose()

    text = markdownify.markdownify(str(soup), heading_style="ATX", strip=['img', 'a'])
    
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


@celery_app.task(name="scraper.fetch_links")
def fetch_links_task(start_url):
    logger.info(f"🔗 [1/3] Fetching links: {start_url}")
    
    r = redis.from_url(REDIS_URL)
    r.setex("system:crawling", 600, "true")
    r.publish("job_updates", json.dumps({"type": "crawl_started", "url": start_url}))
    
    html = get_html_with_browser(start_url)
    if not html:
        r.delete("system:crawling")
        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
        return None

    soup = BeautifulSoup(html, 'html.parser')
    all_links = set()
    base_domain = urlparse(start_url).netloc
    
    for a in soup.find_all('a', href=True):
        full_url = urljoin(start_url, a['href'])
        if urlparse(full_url).netloc != base_domain: continue
        if any(full_url.lower().endswith(x) for x in ['.pdf', '.jpg', '.png', '.css', '.js']): continue     
        all_links.add(full_url)
        
    return [start_url, list(all_links)]

@celery_app.task(name="scraper.schedule_crawls")
def schedule_crawls_task(filtered_links):
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    if not filtered_links:
        logger.info("Keine relevanten Links gefunden.")
        r.delete("system:crawling")
        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
        return

    logger.info(f"Scheduling {len(filtered_links)} detailed crawls...")
    
    for link in filtered_links:
        celery_app.send_task('scraper.scrape_detail', args=[link], queue='scraper_queue')

    r.delete("system:crawling")
    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

@celery_app.task(name="scraper.scrape_detail")
def scrape_job_detail_task(url):
    logger.info(f"Scraping Detail for: {url}")
    html = get_html_with_browser(url)
    if not html: return

    content = get_clean_content(html)
    soup = BeautifulSoup(html, 'html.parser')
    title = soup.find('h1').get_text().strip() if soup.find('h1') else "Job Position"
    
    job_data = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, url)),
        "title": title,
        "company": urlparse(url).netloc,
        "description": content[:4000],
        "url": url
    }
    
    celery_app.send_task("ai.analyze_job", args=[job_data], queue="ai_queue")

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