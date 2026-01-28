import os
import json
import uuid
import time
import logging
import random
import sys
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import redis

from celery_config import celery_app, REDIS_URL

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def get_html_with_browser(url):
    logger.info(f"🌐 Launching browser for URL: {url}")
    start_time = time.time()
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
            logger.info(f"Navigating to {url}...")
            page.goto(url, timeout=60000, wait_until="domcontentloaded")
            
            sleep_time = random.uniform(2, 4)
            logger.info(f"Waiting {sleep_time:.2f}s for dynamic content...")
            time.sleep(sleep_time)
            
            content = page.content()
            duration = time.time() - start_time
            logger.info(f"✅ Successfully fetched {len(content)} bytes from {url} in {duration:.2f}s")
            return content
        except Exception as e:
            logger.error(f"❌ Playwright Error fetching {url}: {e}", exc_info=True)
            return None
        finally:
            browser.close()
            logger.info("Browser closed.")

def get_clean_content(html):
    import markdownify
    import re
    try:
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
        clean_text = text.strip()
        logger.debug(f"Cleaned content length: {len(clean_text)} chars")
        return clean_text
    except Exception as e:
        logger.error(f"Error cleaning content: {e}", exc_info=True)
        return ""


@celery_app.task(name="scraper.fetch_links")
def fetch_links_task(start_url):
    logger.info(f"🔗 [TASK] Fetching links started for: {start_url}")
    
    r = redis.from_url(REDIS_URL)
    r.setex("system:crawling", 600, "true")
    r.publish("job_updates", json.dumps({"type": "crawl_started", "url": start_url}))
    
    html = get_html_with_browser(start_url)
    if not html:
        logger.warning(f"Failed to fetch content from {start_url}. Aborting crawl.")
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
        
    logger.info(f"Found {len(all_links)} internal links on {start_url}")
    return [start_url, list(all_links)]

@celery_app.task(name="scraper.schedule_crawls")
def schedule_crawls_task(filtered_links):
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    
    if not filtered_links:
        logger.info("Keine relevanten Links gefunden (filtered_links is empty).")
        r.delete("system:crawling")
        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
        return

    logger.info(f"🗓️ Scheduling {len(filtered_links)} detailed crawls...")
    
    for link in filtered_links:
        celery_app.send_task('scraper.scrape_detail', args=[link], queue='scraper_queue')
    
    logger.info(f"All {len(filtered_links)} tasks scheduled.")
    r.delete("system:crawling")
    r.publish("job_updates", json.dumps({"type": "crawl_completed"}))

@celery_app.task(name="scraper.scrape_detail")
def scrape_job_detail_task(url):
    logger.info(f"🕵️ [TASK] Scraping Detail for: {url}")
    
    try:
        html = get_html_with_browser(url)
        if not html: 
            logger.warning(f"Skipping {url} due to download failure.")
            return

        content = get_clean_content(html)
        if not content:
            logger.warning(f"No clean content extracted from {url}")
            # Depending on logic, might still want to process or skip. Proceeding for now but logging warning.

        soup = BeautifulSoup(html, 'html.parser')
        title = soup.find('h1').get_text().strip() if soup.find('h1') else "Job Position"
        
        job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, url))
        logger.info(f"Extracted Job: '{title}' (ID: {job_id}) from {url}")

        job_data = {
            "id": job_id,
            "title": title,
            "company": urlparse(url).netloc,
            "description": content[:4000],
            "url": url
        }
        
        celery_app.send_task("ai.analyze_job", args=[job_data], queue="ai_queue")
        logger.info(f"Triggered ai.analyze_job for {job_id}")
        
    except Exception as e:
        logger.error(f"Error in scrape_job_detail_task for {url}: {e}", exc_info=True)
