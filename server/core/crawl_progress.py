"""Real crawl progress, derived from the crawl hash ``crawl_job:{id}`` (scraper_api._init_crawl_job and the workers).

The web shows a crawl as complete only when the pipeline is: every new link is fetched and its job analysed.
"""

from core.crawl_registry import QUEUED_STATUS

STAGE_QUEUED = "queued"
STAGE_COLLECTING_LINKS = "collecting_links"
STAGE_FILTERING_LINKS = "filtering_links"
STAGE_FETCHING_PAGES = "fetching_pages"
STAGE_ANALYSING = "analysing"
STAGE_COMPLETED = "completed"

# Hash fields written for progress only; the other counters predate it (see crawl_progress).
LINKS_FOUND_FIELD = "links_found"
LINKS_MATCHED_FIELD = "links_matched"
PAGES_FAILED_FIELD = "pages_failed"

FETCHING_LINKS_STATUS = "fetching_links"
COMPLETED_STATUS = "completed"
# Every new link is two steps of work: fetching its page and analysing the job on it.
STEPS_PER_LINK = 2


def _text(raw) -> str:
    # The scraper's client returns bytes, decoded clients return str.
    return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)


def _stage(status: str, links_found_known: bool, links_new: int, pages_done: int) -> str:
    if status == COMPLETED_STATUS:
        return STAGE_COMPLETED
    # An import starts with its one page known (total 1), a source crawl once its links are scheduled.
    if links_new > 0:
        return STAGE_FETCHING_PAGES if pages_done < links_new else STAGE_ANALYSING
    if status == FETCHING_LINKS_STATUS:
        return STAGE_FILTERING_LINKS if links_found_known else STAGE_COLLECTING_LINKS
    return STAGE_QUEUED


def crawl_progress(job_hash: dict) -> dict:
    """The stage and counters of a crawl, and its work done of the total work (2 steps per new link).

    ``jobs_skipped`` in the hash also counts failed pages (it drives completion); here it is the known postings only.
    """
    fields = {_text(name): _text(value) for name, value in job_hash.items()}

    def count(name: str) -> int:
        return int(fields.get(name) or 0)

    links_new, pages_failed = count("total"), count(PAGES_FAILED_FIELD)
    pages_done = count("scraping_completed") + pages_failed
    jobs_skipped = max(0, count("jobs_skipped") - pages_failed)
    jobs_analysed = count("jobs_saved") + jobs_skipped
    stage = _stage(fields.get("status", QUEUED_STATUS), LINKS_FOUND_FIELD in fields, links_new, pages_done)
    work_total = STEPS_PER_LINK * links_new
    # A failed page has no job to analyse, so it finishes both of its steps.
    work_done = work_total if stage == STAGE_COMPLETED else min(work_total, pages_done + jobs_analysed + pages_failed)
    return {
        "stage": stage,
        "links_found": count(LINKS_FOUND_FIELD),
        "links_matched": count(LINKS_MATCHED_FIELD),
        "links_new": links_new,
        "pages_fetched": count("scraping_completed"),
        "pages_failed": pages_failed,
        "jobs_analysed": jobs_analysed,
        "jobs_skipped": jobs_skipped,
        "work_done": work_done,
        "work_total": work_total,
    }


def read_crawl_progress(redis_client, crawl_id: str) -> dict:
    """crawl_progress of the stored crawl; a removed crawl reads as queued with no work."""
    return crawl_progress(redis_client.hgetall(f"crawl_job:{crawl_id}"))
