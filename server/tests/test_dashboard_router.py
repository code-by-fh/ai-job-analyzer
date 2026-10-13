from unittest.mock import patch

import requests

from datetime import datetime

from tests.factories import make_job, make_platform


def test_dashboard_data_excludes_seen_placeholders(api_client, seed, fake_redis):
    seed(make_job(id="visible"), make_job(id="placeholder", status="SEEN"))
    with patch("routers.dashboard.redis_sync.from_url", return_value=fake_redis), \
         patch("routers.dashboard.requests.get", side_effect=requests.ConnectionError):
        body = api_client.get("/dashboard-data").json()
    assert [job["id"] for job in body["jobs"]] == ["visible"]


def test_settings_view_platform_last_crawl_at_is_utc_with_offset(api_client, seed, fake_redis):
    seed(make_platform(last_crawl_at=datetime(2026, 10, 1, 7, 0, 0)))
    with patch("routers.dashboard.redis_sync.from_url", return_value=fake_redis), \
         patch("routers.dashboard.requests.get", side_effect=requests.ConnectionError):
        body = api_client.get("/settings-view").json()
    assert body["platforms"][0]["last_crawl_at"] == "2026-10-01T07:00:00+00:00"
