from unittest.mock import patch

import pytest

from database.core import JobEntry
from services.company_domain import is_job_board_or_redirect, normalised_host, validate_company_domain
from tests.factories import TEST_USER_ID, OTHER_USER_ID, fetch, make_job, make_platform, make_profile, make_user
from workers.tasks.analyze import analyze_job_task, save_job_basic_task

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
VALID_DOMAINS = ["acme.de", "stepstone.de", "xn--mnchen-3ya.de", "a-b.example.co.uk", "a1.b2.io"]
INVALID_DOMAINS = [
    "localhost", "1.2.3.4", "a..b", "-a.de", "a-.de", "Acme.de", "acme.de:8080", "user@acme.de",
    "acme.de/path", "münchen.de", "", "a b.de", "acme.123", "example.com.", ".", "a..", "0x7f.0x1", "127.0.0.0x1", "0x7f000001.0x0", "1.2.3.4e", f"{'a' * 64}.de", f"{'a.' * 127}de",
]


@pytest.mark.parametrize("domain", VALID_DOMAINS)
def test_valid_hostnames_are_accepted_unchanged(domain):
    assert validate_company_domain(domain) == domain


@pytest.mark.parametrize("domain", INVALID_DOMAINS)
def test_invalid_hostnames_are_rejected(domain):
    with pytest.raises(ValueError):
        validate_company_domain(domain)


def test_patch_rejects_invalid_company_domain_with_field_details(api_client, seed):
    seed(make_job())
    response = api_client.patch("/jobs/job-1", json={"company_domain": "1.2.3.4"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "company_domain"]


def test_patch_accepts_valid_company_domain(api_client, seed, session_factory):
    seed(make_job())
    assert api_client.patch("/jobs/job-1", json={"company_domain": "stepstone.de"}).status_code == 200
    assert fetch(session_factory, JobEntry, "job-1").company_domain == "stepstone.de"


@pytest.mark.parametrize("suffix", ["analyze", "deep-dive"])
def test_company_path_domain_is_validated(api_client, suffix):
    body = {"focus": "x", "how_to_proceed": "y", "company_name": "Acme"}
    response = api_client.post(f"/companies/localhost/{suffix}", json=body)
    assert response.status_code == 422


def _job_data(url, **overrides) -> dict:
    data = {
        "id": "job-1", "title": "Engineer", "company": "Acme", "description": "Build",
        "url": url, "user_id": TEST_USER_ID, "platform_id": None,
    }
    data.update(overrides)
    return data


@pytest.fixture()
def run_save(session_factory, seed, fake_redis):
    """Run ai.save_job_basic for a user with one configured platform (https://www.stepstone.de/jobs)."""
    seed(make_user(), make_user(OTHER_USER_ID), make_profile(),
         make_platform(url="https://www.stepstone.de/jobs?q=python"),
         make_platform(id=99, user_id=OTHER_USER_ID, url="https://www.indeed.com/jobs"))

    def _run(url, **overrides):
        with patch("workers.tasks.analyze.SessionLocal", session_factory), \
             patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis):
            save_job_basic_task(_job_data(url, **overrides))
        return fetch(session_factory, JobEntry, "job-1").company_domain
    return _run


# The posting host used to be stored as company domain, so a Google redirect link made google.com the
# "default" the research then ran for. The domain now comes from the user or the AI identification only.
POSTING_URLS = [
    "https://www.google.com/url?q=https://jobs.bahn.de/1",
    "https://www.Acme.de:8443/careers/1",
    "https://www.indeed.com/viewjob?jk=1",
]


@pytest.mark.parametrize("url", POSTING_URLS)
def test_basic_save_never_takes_the_posting_host_as_company_domain(run_save, url):
    assert run_save(url) is None


@pytest.mark.parametrize("url", POSTING_URLS)
def test_analysis_never_takes_the_posting_host_as_company_domain(session_factory, seed, fake_redis, url):
    seed(make_user(), make_profile(), make_platform(url="https://www.stepstone.de/jobs"))
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "m")), \
         patch("workers.tasks.analyze.analyze_job", return_value={"score": 80, "reasoning": "ok"}):
        analyze_job_task(_job_data(url))
    assert fetch(session_factory, JobEntry, "job-1").company_domain is None


def test_normalised_host_never_raises_for_trailing_dot_hosts():
    assert normalised_host("https://www.acme.com./jobs/1") is None


@pytest.mark.parametrize("suffix", ["analyze", "deep-dive"])
def test_trailing_dot_company_path_domain_is_a_422(api_client, suffix):
    body = {"focus": "x", "how_to_proceed": "y", "company_name": "Acme", "title": "Dev"}
    assert api_client.post(f"/companies/example.com./{suffix}", json=body).status_code == 422


def test_patch_rejects_trailing_dot_company_domain(api_client, seed):
    seed(make_job())
    assert api_client.patch("/jobs/job-1", json={"company_domain": "example.com."}).status_code == 422


@pytest.mark.parametrize("host", ["google.com", "stepstone.de", "de.indeed.com", "eur01.safelinks.protection.outlook.com"])
def test_known_job_boards_and_redirectors_are_recognised(host):
    assert is_job_board_or_redirect(host) is True


@pytest.mark.parametrize("host", ["acme.de", "karriere.acme.de", "notgoogle.com", "bahn.de"])
def test_employer_hosts_are_not_taken_for_job_boards(host):
    assert is_job_board_or_redirect(host) is False
