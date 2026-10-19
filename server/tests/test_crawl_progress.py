"""Real crawl progress (feedback round 1, Task 6): stages and work counted from the crawl hash."""

from unittest.mock import patch

import pytest

from core.crawl_progress import (
    STAGE_ANALYSING,
    STAGE_COLLECTING_LINKS,
    STAGE_COMPLETED,
    STAGE_FETCHING_PAGES,
    STAGE_FILTERING_LINKS,
    STAGE_QUEUED,
    crawl_progress,
)
from tests.crawl_locks import Clock, lock_backed
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, events_of_type, make_platform, make_user

CRAWL_ID = "crawl-1"
CRAWL_KEY = f"crawl_job:{CRAWL_ID}"
NEW_LINKS = 4
START_URL = "https://jobs.example.com/search"
LINK_PAGE = (
    '<a href="/job/1">1</a><a href="/job/2">2</a><a href="/about">About</a>'
)


def _hash(**fields) -> dict:
    """A crawl hash as the scraper's bytes client returns it."""
    return {name.encode(): str(value).encode() for name, value in fields.items()}


def test_a_queued_crawl_has_no_work_yet():
    progress = crawl_progress(_hash(status="starting", total=0))
    assert (progress["stage"], progress["work_done"], progress["work_total"]) == (STAGE_QUEUED, 0, 0)


def test_a_crawl_reading_its_start_page_is_collecting_links():
    assert crawl_progress(_hash(status="fetching_links", total=0))["stage"] == STAGE_COLLECTING_LINKS


def test_a_crawl_with_counted_links_is_filtering_them():
    progress = crawl_progress(_hash(status="fetching_links", total=0, links_found=12))
    assert (progress["stage"], progress["links_found"]) == (STAGE_FILTERING_LINKS, 12)


def test_every_new_link_is_two_steps_of_work():
    progress = crawl_progress(_hash(status="crawling", total=NEW_LINKS, links_matched=6))
    assert (progress["links_matched"], progress["links_new"], progress["work_total"]) == (6, NEW_LINKS, 8)


def test_all_links_found_is_not_full_progress():
    progress = crawl_progress(_hash(status="crawling", total=NEW_LINKS, scraping_completed=0))
    assert (progress["stage"], progress["work_done"]) == (STAGE_FETCHING_PAGES, 0)


def test_fetched_pages_and_analysed_jobs_both_count_as_work_done():
    progress = crawl_progress(
        _hash(status="crawling", total=NEW_LINKS, scraping_completed=3, jobs_saved=1, jobs_skipped=1)
    )
    assert (progress["pages_fetched"], progress["jobs_analysed"], progress["work_done"]) == (3, 2, 5)


def test_a_failed_page_finishes_both_of_its_steps_and_is_no_skipped_job():
    progress = crawl_progress(
        _hash(status="crawling", total=NEW_LINKS, scraping_completed=1, jobs_skipped=1, pages_failed=1)
    )
    assert (progress["pages_failed"], progress["jobs_skipped"], progress["work_done"]) == (1, 0, 3)


def test_the_crawl_is_analysing_once_every_page_is_fetched_or_failed():
    progress = crawl_progress(_hash(status="crawling", total=2, scraping_completed=1, pages_failed=1))
    assert progress["stage"] == STAGE_ANALYSING


def test_an_import_counts_its_single_page_from_the_start():
    progress = crawl_progress(_hash(status="starting", total=1))
    assert (progress["stage"], progress["work_total"]) == (STAGE_FETCHING_PAGES, 2)


def test_work_done_never_exceeds_the_total():
    progress = crawl_progress(_hash(status="crawling", total=1, scraping_completed=1, jobs_skipped=1, pages_failed=1))
    assert progress["work_done"] == 2


def test_a_completed_crawl_is_full_progress():
    # A seed run stores placeholders without analysing; it still ends at 100 %.
    progress = crawl_progress(_hash(status="completed", total=3, scraping_completed=3, jobs_saved=2))
    assert (progress["stage"], progress["work_done"], progress["work_total"]) == (STAGE_COMPLETED, 6, 6)


def test_a_decoded_hash_reads_the_same():
    progress = crawl_progress({"status": "crawling", "total": "2", "scraping_completed": "1"})
    assert (progress["stage"], progress["work_done"]) == (STAGE_FETCHING_PAGES, 1)


@pytest.fixture()
def crawl_state(fake_redis):
    state = lock_backed(fake_redis, Clock())
    state.hset(CRAWL_KEY, mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID, "status": "starting",
                                   "total": 0, "platform_url": START_URL})
    return state


def test_fetching_links_stores_the_link_count_and_reports_it(fake_redis, crawl_state):
    from workers.scraper_worker import fetch_links_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=LINK_PAGE):
        fetch_links_task(START_URL, TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID)
    progress = events_of_type(fake_redis, "crawl_job_progress")[-1]["progress"]
    assert (crawl_state.hashes[CRAWL_KEY]["links_found"], progress["links_found"]) == (b"3", 3)
    assert progress["stage"] == STAGE_FILTERING_LINKS


def test_the_started_event_carries_the_progress(fake_redis, crawl_state):
    from workers.scraper_worker import fetch_links_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=LINK_PAGE):
        fetch_links_task(START_URL, TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID)
    assert events_of_type(fake_redis, "crawl_job_started")[0]["progress"]["stage"] == STAGE_COLLECTING_LINKS


def test_filtering_stores_the_links_matching_the_pattern(fake_redis, crawl_state, session_factory, seed):
    from workers.tasks.urls import filter_urls_task

    seed(make_user(), make_platform(url_pattern="/search/job/"))
    links = [f"{START_URL}/job/1", f"{START_URL}/job/2", f"{START_URL}/about"]
    with patch("workers.tasks.urls.SessionLocal", session_factory), \
         patch("workers.tasks.urls.redis.from_url", return_value=fake_redis):
        filter_urls_task([START_URL, links, TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID])
    assert crawl_state.hashes[CRAWL_KEY]["links_matched"] == b"2"


def test_scheduling_reports_the_new_links_as_work(fake_redis, crawl_state):
    from workers.scraper_worker import schedule_crawls_task

    links = [f"{START_URL}/job/{index}" for index in range(NEW_LINKS)]
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.celery_app"):
        schedule_crawls_task([links, TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID])
    progress = events_of_type(fake_redis, "crawl_job_progress")[0]["progress"]
    assert (progress["stage"], progress["links_new"], progress["work_done"], progress["work_total"]) == (
        STAGE_FETCHING_PAGES, NEW_LINKS, 0, 2 * NEW_LINKS,
    )


def test_a_failed_page_is_counted_on_the_crawl(fake_redis, crawl_state):
    from workers.scraper_worker import _mark_scrape_failed

    crawl_state.hset(CRAWL_KEY, mapping={"status": "crawling", "total": NEW_LINKS})
    _mark_scrape_failed(fake_redis, CRAWL_ID, TEST_USER_ID)
    progress = crawl_progress(crawl_state.hgetall(CRAWL_KEY))
    assert (progress["pages_failed"], progress["jobs_skipped"], progress["work_done"]) == (1, 0, 2)


def test_the_analysis_events_carry_the_progress(fake_redis, crawl_state, session_factory, seed):
    from workers.tasks.analyze import analyze_job_task
    from tests.factories import make_profile

    seed(make_user(), make_profile())
    crawl_state.hset(CRAWL_KEY, mapping={"status": "crawling", "total": NEW_LINKS, "scraping_completed": 1})
    job = {"id": "job-1", "title": "Engineer", "company": "acme.example", "description": "Build",
           "url": "https://acme.example/1", "user_id": TEST_USER_ID, "platform_id": None, "crawl_job_id": CRAWL_ID}
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "m")), \
         patch("workers.tasks.analyze.analyze_job", return_value={"score": 80, "reasoning": "Fit"}):
        analyze_job_task(job)
    started = events_of_type(fake_redis, "job_analysis_started")[0]["progress"]
    finished = events_of_type(fake_redis, "job_analysis_finished")[0]["progress"]
    assert (started["work_done"], finished["work_done"], finished["jobs_analysed"]) == (1, 2, 1)


def test_crawl_status_reports_the_progress(monkeypatch, fake_redis, crawl_state):
    import scraper_api
    from fastapi.testclient import TestClient
    from core.auth import get_current_user

    crawl_state.hset(CRAWL_KEY, mapping={"status": "crawling", "total": NEW_LINKS, "scraping_completed": 2,
                                         "links_found": 30, "links_matched": 6})
    crawl_state.sets[f"user:{TEST_USER_ID}:active_crawls"] = {CRAWL_ID.encode()}
    fake_redis.lrange.return_value = []
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    scraper_api.app.dependency_overrides[get_current_user] = lambda: make_user()
    try:
        job = TestClient(scraper_api.app).get("/crawl-status").json()["jobs"][0]
    finally:
        scraper_api.app.dependency_overrides.pop(get_current_user, None)
    assert job["progress"] == {
        "stage": STAGE_FETCHING_PAGES, "links_found": 30, "links_matched": 6, "links_new": NEW_LINKS,
        "pages_fetched": 2, "pages_failed": 0, "jobs_analysed": 0, "jobs_skipped": 0,
        "work_done": 2, "work_total": 2 * NEW_LINKS,
    }


def test_a_crawl_cancelled_during_the_render_gets_no_link_count(fake_redis, crawl_state):
    from workers.scraper_worker import fetch_links_task

    def render_then_cancel(_url):
        crawl_state.hashes.pop(CRAWL_KEY)
        return LINK_PAGE

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", side_effect=render_then_cancel):
        fetch_links_task(START_URL, TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID)
    assert (CRAWL_KEY in crawl_state.hashes, events_of_type(fake_redis, "crawl_job_progress")) == (False, [])


def test_a_crawl_cancelled_while_filtering_gets_no_match_count(fake_redis, crawl_state, session_factory, seed):
    from workers.tasks.urls import filter_urls_task

    seed(make_user(), make_platform(url_pattern="/job/"))
    real_session = session_factory

    def session_then_cancel():
        crawl_state.hashes.pop(CRAWL_KEY)
        return real_session()

    with patch("workers.tasks.urls.SessionLocal", session_then_cancel), \
         patch("workers.tasks.urls.redis.from_url", return_value=fake_redis):
        filter_urls_task([START_URL, [f"{START_URL}/job/1"], TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID])
    assert CRAWL_KEY not in crawl_state.hashes
