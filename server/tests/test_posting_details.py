from unittest.mock import patch

import pytest

from database.core import JobEntry
from intelligence.posting_details import forget_posting_origin, validate_posting_details
from intelligence.prompts import get_analyze_job_messages
from tests.factories import TEST_USER_ID, fetch, make_job, make_profile, make_user
from workers.tasks.analyze import analyze_job_task

CONTACT = {"name": "Anna Muster", "role": "HR", "email": "anna@acme.example", "phone": "+49 40 123"}
RECRUITER = {"name": "Bob Agent", "role": "Agency X", "email": None, "phone": None}
SALARY_STATED = {"min": 60000, "max": 75000, "currency": "EUR", "period": "year", "note": "per year"}
SALARY = {"min": 60000, "max": 75000, "note": "per year"}


def test_valid_details_are_kept():
    found = validate_posting_details(
        {"contact_persons": [CONTACT], "recruiter_info": RECRUITER, "salary_benchmark": SALARY_STATED}
    )
    assert found == {
        "contact_persons": [CONTACT],
        "recruiter_info": {**RECRUITER, "email": None, "phone": None},
        "salary_benchmark": SALARY,
    }


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"contact_persons": "Anna", "recruiter_info": "Bob", "salary_benchmark": "60k"},
        {"contact_persons": [{"role": "HR"}, "x", None], "recruiter_info": {}, "salary_benchmark": {}},
        {"salary_benchmark": {**SALARY_STATED, "min": 80000, "max": 60000}},
        {"salary_benchmark": {**SALARY_STATED, "period": "month"}},
        {"salary_benchmark": {**SALARY_STATED, "period": "hour"}},
        {"salary_benchmark": {**SALARY_STATED, "currency": "USD"}},
        {"salary_benchmark": {"min": 60000, "max": 75000}},
        {"salary_benchmark": {**SALARY_STATED, "min": "viel", "max": None}},
        {"salary_benchmark": {**SALARY_STATED, "min": True, "max": None}},
        {"salary_benchmark": {**SALARY_STATED, "min": -5, "max": None}},
    ],
)
def test_invalid_or_empty_parts_are_dropped(data):
    assert validate_posting_details(data) == {}


def test_one_invalid_part_does_not_drop_the_others():
    found = validate_posting_details({"contact_persons": [CONTACT], "salary_benchmark": {**SALARY_STATED, "min": 9, "max": 1}})
    assert list(found) == ["contact_persons"]


def test_contacts_are_capped_and_unknown_keys_ignored():
    contacts = [{**CONTACT, "name": f"P{i}", "fax": "1"} for i in range(30)]
    found = validate_posting_details({"contact_persons": contacts})
    assert len(found["contact_persons"]) == 20
    assert "fax" not in found["contact_persons"][0]


def test_prompt_asks_for_the_three_details():
    system = get_analyze_job_messages("T", "D", "P")[0]["content"]
    assert all(key in system for key in ("contact_persons", "recruiter_info", "salary_benchmark"))


def test_forget_origin_keeps_untouched_fields():
    job = JobEntry(posting_extracted=["contact_persons", "salary_benchmark"])
    forget_posting_origin(job, {"salary_benchmark"})
    assert job.posting_extracted == ["contact_persons"]


@pytest.fixture()
def run_analysis(session_factory, seed, fake_redis):
    seed(make_user(), make_profile())

    def _run(llm_data: dict, force: bool = False, ai=None):
        job_data = {"id": "job-1", "title": "Dev", "company": "acme", "description": "d",
                    "url": "https://acme.example/1", "user_id": TEST_USER_ID, "force_reanalyze": force}
        with patch("workers.tasks.analyze.SessionLocal", session_factory), \
             patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "m")), \
             patch("workers.tasks.analyze.analyze_job", side_effect=ai or (lambda **_: {"score": 80, "reasoning": "ok", **llm_data})):
            analyze_job_task(job_data)
    return _run


def test_analysis_stores_details_and_marks_their_origin(run_analysis, session_factory):
    run_analysis({"contact_persons": [CONTACT], "salary_benchmark": SALARY_STATED})
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.contact_persons, job.salary_benchmark["max"], job.recruiter_info) == ([CONTACT], 75000, None)
    assert job.posting_extracted == ["contact_persons", "salary_benchmark"]


def test_analysis_survives_garbage_details(run_analysis, session_factory):
    run_analysis({"contact_persons": 5, "recruiter_info": [], "salary_benchmark": {"min": "x"}})
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.match_score, job.contact_persons, job.posting_extracted) == (80.0, None, None)


def test_reanalysis_never_overwrites_user_values(run_analysis, seed, session_factory):
    mine = [{"name": "Mine", "role": "", "email": "", "phone": ""}]
    seed(make_job(id="job-1", user_id=TEST_USER_ID, contact_persons=mine))
    run_analysis({"contact_persons": [CONTACT], "recruiter_info": RECRUITER}, force=True)
    job = fetch(session_factory, JobEntry, "job-1")
    assert job.contact_persons == mine
    assert job.recruiter_info["name"] == "Bob Agent"
    assert job.posting_extracted == ["recruiter_info"]


def test_malformed_email_and_phone_are_dropped_but_the_contact_stays():
    contact = {**CONTACT, "email": "anna at acme", "phone": "call me <script>"}
    found = validate_posting_details({"contact_persons": [contact], "recruiter_info": {**RECRUITER, "email": "x@y"}})
    assert found["contact_persons"] == [{**CONTACT, "email": "", "phone": ""}]
    assert found["recruiter_info"]["email"] is None


def test_reanalysis_keeps_a_value_the_user_saved_during_the_ai_call(run_analysis, seed, session_factory):
    seed(make_job(id="job-1", user_id=TEST_USER_ID))
    mine = [{"name": "Mine", "role": "", "email": "", "phone": ""}]

    def user_saves_while_ai_runs(*args, **kwargs):
        with session_factory() as other:
            other.get(JobEntry, "job-1").contact_persons = mine
            other.commit()
        return {"score": 80, "reasoning": "ok", "contact_persons": [CONTACT]}

    run_analysis({}, force=True, ai=user_saves_while_ai_runs)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.contact_persons, job.posting_extracted) == (mine, None)
