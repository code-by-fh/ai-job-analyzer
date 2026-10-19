from unittest.mock import patch

import workers.scraper_worker  # noqa: F401 — imported for side-effect checks
from tests.factories import TEST_USER_ID
from workers.scraper_worker import get_html_with_browser


def test_get_html_with_browser_calls_the_page_renderer():
    with patch("workers.scraper_worker._is_safe_url", return_value=True), \
         patch("services.page_rendering.fetch_html", return_value="<html>ok</html>") as mock_fetch:
        result = get_html_with_browser("https://example.com")

    mock_fetch.assert_called_once_with("https://example.com")
    assert result == "<html>ok</html>"


def test_get_html_with_browser_blocks_ssrf():
    with patch("workers.scraper_worker._is_safe_url", return_value=False), \
         patch("services.page_rendering.fetch_html") as mock_fetch:
        result = get_html_with_browser("http://192.168.1.1")

    mock_fetch.assert_not_called()
    assert result is None


def test_get_html_with_browser_returns_none_on_render_failure():
    with patch("workers.scraper_worker._is_safe_url", return_value=True), \
         patch("services.page_rendering.fetch_html", return_value=None):
        result = get_html_with_browser("https://example.com")

    assert result is None


def test_worker_refuses_private_url_without_render_call():
    with patch("services.page_rendering.fetch_html") as mock_fetch:
        assert get_html_with_browser("http://0.0.0.0:8000/") is None
    mock_fetch.assert_not_called()


def test_worker_rechecks_dns_right_before_the_render_call(monkeypatch):
    monkeypatch.setattr("core.url_safety._resolve", lambda host: ["127.0.0.1"])
    with patch("services.page_rendering.fetch_html") as mock_fetch:
        assert get_html_with_browser("https://jobs.example.com/search") is None
    mock_fetch.assert_not_called()


def test_scraper_refuses_a_private_url_before_queueing():
    import scraper_api

    assert scraper_api._fetchable_url("http://10.0.0.5/jobs") is None
    assert scraper_api._fetchable_url("https://jobs.example.com/search") == "https://jobs.example.com/search"


def test_started_event_names_the_platform(fake_redis):
    from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, events_of_type
    from workers.scraper_worker import fetch_links_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=None), \
         patch("workers.scraper_worker.fail_crawl_job"):
        fetch_links_task("https://jobs.example.com/search", TEST_USER_ID, "crawl-1", TEST_PLATFORM_ID)
    assert events_of_type(fake_redis, "crawl_job_started")[0]["platform_id"] == TEST_PLATFORM_ID


def test_worker_refuses_a_percent_escaped_host_without_render_call():
    with patch("services.page_rendering.fetch_html") as mock_fetch:
        assert get_html_with_browser("http://1.1.1.1%2elocalhost/secret.txt") is None
    mock_fetch.assert_not_called()


def test_worker_renders_the_normalised_url():
    with patch("services.page_rendering.fetch_html", return_value="<html/>") as mock_fetch:
        get_html_with_browser("http://Fa\u00df.example/jobs?q=1")
    mock_fetch.assert_called_once_with("http://xn--fa-hia.example/jobs?q=1")


def test_worker_logs_a_blocked_url_by_host_only():
    with patch("services.page_rendering.fetch_html"), \
         patch("workers.scraper_worker.logger") as logger:
        get_html_with_browser("http://10.0.0.5/private/path?token=abc")
    logged = str(logger.warning.call_args_list)
    assert "10.0.0.5" in logged
    assert "/private/path" not in logged
    assert "token=abc" not in logged


def test_starting_the_link_fetch_counts_as_progress(fake_redis):
    from tests.crawl_locks import Clock, lock_backed
    from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID
    from workers.scraper_worker import fetch_links_task

    state = lock_backed(fake_redis, Clock())
    state.hset("crawl_job:crawl-1", mapping={"last_progress_at": "1"})
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=None), \
         patch("workers.scraper_worker.fail_crawl_job"):
        fetch_links_task("https://jobs.example.com/search", TEST_USER_ID, "crawl-1", TEST_PLATFORM_ID)
    assert state.hashes["crawl_job:crawl-1"]["last_progress_at"] != b"1"


SECRET_PATH_URL = "https://jobs.example.com/private/path?token=abc"


def _logged_text(logger) -> str:
    return str(logger.info.call_args_list + logger.warning.call_args_list + logger.error.call_args_list)


def test_fetch_links_failure_sends_a_fixed_message_and_logs_the_host_only(fake_redis):
    from workers.crawl_control import UNREACHABLE_FAILURE
    from workers.scraper_worker import fetch_links_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=None), \
         patch("workers.scraper_worker.fail_crawl_job") as fail, \
         patch("workers.scraper_worker.logger") as logger:
        fetch_links_task(SECRET_PATH_URL, TEST_USER_ID, "crawl-1")
    assert fail.call_args.kwargs["failure"] == UNREACHABLE_FAILURE
    assert "jobs.example.com" in _logged_text(logger)
    assert "/private/path" not in _logged_text(logger)
    assert "token=abc" not in _logged_text(logger)


def test_scrape_detail_failure_logs_the_host_only(fake_redis, session_factory):
    from workers.scraper_worker import scrape_job_detail_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.SessionLocal", session_factory), \
         patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.scraper_worker.get_html", return_value=None), \
         patch("workers.scraper_worker.logger") as logger:
        scrape_job_detail_task(SECRET_PATH_URL, TEST_USER_ID, "crawl-1")
    assert "jobs.example.com" in _logged_text(logger)
    assert "/private/path" not in _logged_text(logger)
    assert "token=abc" not in _logged_text(logger)


def test_fetch_links_of_a_removed_crawl_does_not_recreate_its_hash(fake_redis):
    from tests.crawl_locks import Clock, lock_backed
    from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID
    from workers.scraper_worker import fetch_links_task

    state = lock_backed(fake_redis, Clock())
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html") as get_html:
        result = fetch_links_task("https://jobs.example.com/search", TEST_USER_ID, "gone", TEST_PLATFORM_ID)
    assert (result, state.hashes) == (None, {})
    get_html.assert_not_called()
    assert fake_redis.publish.call_count == 0
