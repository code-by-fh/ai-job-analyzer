from datetime import datetime, timezone
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from database.core import (
    MAX_CONTACT_FIELD_LENGTH, MAX_CONTACTS, MAX_DRAFT_LENGTH, MAX_NOTES_LENGTH, MAX_SALARY_AMOUNT,
    MAX_SALARY_NOTE_LENGTH, MAX_TODOS, MAX_TODO_TEXT_LENGTH, JobDocument, JobEntry, JobStatusHistory, iso_utc,
)
from routers.jobs import (
    MAX_COMPANY_FILTER_LENGTH, MAX_DOCUMENT_HTML_LENGTH, MAX_PAGE_SIZE, MAX_SEARCH_LENGTH,
    MAX_STATUSES_FILTER_LENGTH, MAX_STATUS_NOTE_LENGTH,
)
from main import allowed_origins
from routers.deps import limiter
from tests.factories import OTHER_USER_ID, PDF_BYTES, TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_job, make_platform, make_user

FOREIGN_ORIGIN = "https://evil.example"
TODO = {"id": "t1", "text": "Call recruiter", "done": False}


def test_get_job_returns_redesign_fields(api_client, seed):
    seed(make_platform(), make_job(
        platform_id=TEST_PLATFORM_ID, generation_error="AI timeout", is_archived=True,
        archive_reason="USER", checklist={"sent": True}, todos=[TODO],
    ))
    body = api_client.get("/jobs/job-1").json()
    assert (body["is_archived"], body["archive_reason"], body["platform_id"]) == (True, "USER", TEST_PLATFORM_ID)
    assert (body["generation_error"], body["checklist"], body["todos"]) == ("AI timeout", {"sent": True}, [TODO])


def test_get_job_reports_document_html_presence(api_client, seed):
    seed(make_job(cv_html="<p>CV</p>", cover_letter_html=None))
    body = api_client.get("/jobs/job-1").json()
    assert (body["cv_html_present"], body["cover_letter_html_present"]) == (True, False)
    assert "cv_html" not in body


def test_get_job_of_other_user_returns_404(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    response = api_client.get("/jobs/job-1")
    assert response.status_code == 404


def _listed_ids(api_client, **params) -> list:
    return sorted(item["id"] for item in api_client.get("/jobs", params=params).json()["items"])


def test_list_jobs_returns_items_and_total(api_client, seed):
    seed(make_job(id="a"), make_job(id="b"))
    body = api_client.get("/jobs").json()
    assert body["total"] == 2
    assert sorted(item["id"] for item in body["items"]) == ["a", "b"]


def test_list_jobs_paginates_but_total_counts_all(api_client, seed):
    seed(make_job(id="a"), make_job(id="b"), make_job(id="c"))
    body = api_client.get("/jobs", params={"limit": 2}).json()
    assert (body["total"], len(body["items"])) == (3, 2)


def test_list_jobs_rejects_page_size_above_cap(api_client):
    response = api_client.get("/jobs", params={"limit": MAX_PAGE_SIZE + 1})
    assert response.status_code == 422


def test_list_jobs_search_matches_title_or_company_case_insensitive(api_client, seed):
    seed(
        make_job(id="by-title", title="Senior Python Developer", company="Acme"),
        make_job(id="by-company", title="Engineer", company="PyCorp"),
        make_job(id="no-match", title="Designer", company="Studio"),
    )
    assert _listed_ids(api_client, q="PY") == ["by-company", "by-title"]


def test_list_jobs_filters_by_company(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex"))
    assert _listed_ids(api_client, company="Acme") == ["acme"]


def test_list_jobs_filters_by_status_list(api_client, seed):
    seed(
        make_job(id="applied", status="APPLIED"),
        make_job(id="interview", status="INTERVIEW"),
        make_job(id="open"),
    )
    assert _listed_ids(api_client, statuses="APPLIED, INTERVIEW") == ["applied", "interview"]


def _page_ids(api_client, **params) -> list:
    return [item["id"] for item in api_client.get("/jobs", params=params).json()["items"]]


def test_list_jobs_with_equal_scores_pages_by_id_without_duplicates(api_client, seed):
    seed(make_job(id="c"), make_job(id="a"), make_job(id="b"))
    first = _page_ids(api_client, sort_by="score", limit=2)
    second = _page_ids(api_client, sort_by="score", limit=2, offset=2)
    assert (first, second) == (["a", "b"], ["c"])


def test_list_jobs_with_equal_dates_pages_by_id(api_client, seed):
    seed(make_job(id="c"), make_job(id="a"), make_job(id="b"))
    assert _page_ids(api_client, sort_by="date", limit=2, offset=1) == ["b", "c"]


def test_list_jobs_score_sort_puts_unscored_jobs_last(api_client, seed):
    seed(make_job(id="unscored", match_score=None), make_job(id="scored"))
    assert _page_ids(api_client, sort_by="score") == ["scored", "unscored"]


def test_list_jobs_total_honours_filters_not_page(api_client, seed):
    seed(
        make_job(id="a", title="Python Dev", status="APPLIED"),
        make_job(id="b", title="Python Lead", status="APPLIED"),
        make_job(id="c", title="Python Ops", status="OPEN"),
        make_job(id="d", title="Python Dev", company="Globex", status="APPLIED"),
    )
    body = api_client.get("/jobs", params={"q": "python", "company": "Acme", "statuses": "APPLIED", "limit": 1}).json()
    assert (body["total"], len(body["items"])) == (2, 1)


def test_list_jobs_rejects_overlong_company_filter(api_client):
    response = api_client.get("/jobs", params={"company": "x" * (MAX_COMPANY_FILTER_LENGTH + 1)})
    assert response.status_code == 422


def test_list_jobs_rejects_overlong_statuses_filter(api_client):
    response = api_client.get("/jobs", params={"statuses": "x" * (MAX_STATUSES_FILTER_LENGTH + 1)})
    assert response.status_code == 422


def test_list_jobs_items_omit_large_columns(api_client, seed):
    seed(make_job(cv_html="<p>CV</p>", cover_letter_html="<p>Letter</p>",
                  application_draft="Dear team", interview_prep_material="{}"))
    item = api_client.get("/jobs").json()["items"][0]
    large = {"description", "cv_html", "cover_letter_html", "application_draft", "cv_draft", "interview_prep_material"}
    assert large.isdisjoint(item)
    assert (item["cv_html_present"], item["cover_letter_html_present"]) == (True, True)


def test_list_jobs_excludes_seen_placeholders(api_client, seed):
    seed(make_job(id="real"), make_job(id="seen", status="SEEN"))
    assert api_client.get("/jobs").json()["total"] == 1


def test_list_jobs_rejects_overlong_search(api_client):
    response = api_client.get("/jobs", params={"q": "x" * (MAX_SEARCH_LENGTH + 1)})
    assert response.status_code == 422


def _archive_state(session_factory, job_id="job-1") -> tuple:
    job = fetch(session_factory, JobEntry, job_id)
    return job.is_archived, job.archive_reason, job.kept_by_user


def test_delete_job_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.delete("/jobs/job-1")
    assert _archive_state(session_factory) == (True, "USER", False)


def test_bulk_delete_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.post("/jobs/bulk-delete", json={"job_ids": ["job-1"]})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_delete_all_jobs_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.delete("/jobs", params={"keep_favorites": False, "keep_applications": False})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_bulk_restore_clears_reason_and_marks_kept(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="THRESHOLD"))
    api_client.post("/jobs/bulk-restore", json={"job_ids": ["job-1"]})
    assert _archive_state(session_factory) == (False, None, True)


def test_patch_unarchive_clears_reason_and_marks_kept(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="USER"))
    api_client.patch("/jobs/job-1", json={"is_archived": False})
    assert _archive_state(session_factory) == (False, None, True)


def test_patch_archive_sets_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"is_archived": True})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_patch_archive_of_threshold_job_switches_reason_to_user(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="THRESHOLD"))
    api_client.patch("/jobs/job-1", json={"is_archived": True})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_patch_unarchive_of_active_job_does_not_mark_kept(api_client, seed, session_factory):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"is_archived": False})
    assert _archive_state(session_factory) == (False, None, False)


def test_list_jobs_filters_by_archive_reason(api_client, seed):
    seed(
        make_job(id="auto", is_archived=True, archive_reason="THRESHOLD"),
        make_job(id="manual", is_archived=True, archive_reason="USER"),
    )
    assert _listed_ids(api_client, is_archived=True, archive_reason="THRESHOLD") == ["auto"]


def test_list_jobs_rejects_unknown_archive_reason(api_client):
    response = api_client.get("/jobs", params={"archive_reason": "SPAM"})
    assert response.status_code == 422


def _change_status(api_client, to, note=None):
    return api_client.post("/jobs/job-1/status", json={"to": to, "note": note})


def _history(api_client) -> list:
    return [(h["from_status"], h["to_status"], h["note"]) for h in api_client.get("/jobs/job-1/history").json()]


def test_change_status_updates_job_and_returns_detail(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "DRAFTED")
    assert (response.status_code, response.json()["status"]) == (200, "DRAFTED")


def test_change_status_writes_history_with_note(api_client, seed):
    seed(make_job(status="DRAFTED"))
    _change_status(api_client, "APPLIED", note="Sent via portal")
    assert _history(api_client) == [("DRAFTED", "APPLIED", "Sent via portal")]


def test_change_status_records_backward_move(api_client, seed):
    seed(make_job(status="INTERVIEW"))
    response = _change_status(api_client, "DRAFTED")
    assert response.status_code == 200
    assert _history(api_client) == [("INTERVIEW", "DRAFTED", None)]


def test_change_status_to_system_state_returns_400(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "GENERATING")
    assert response.status_code == 400
    assert "cannot be set manually" in response.json()["detail"]


def test_change_status_from_generating_returns_409(api_client, seed):
    seed(make_job(status="GENERATING"))
    assert _change_status(api_client, "APPLIED").status_code == 409


def test_change_status_to_same_state_returns_409_without_history(api_client, seed):
    seed(make_job(status="APPLIED"))
    response = _change_status(api_client, "APPLIED")
    assert response.status_code == 409
    assert _history(api_client) == []


def test_change_status_of_archived_job_restores_it(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="THRESHOLD"))
    _change_status(api_client, "DRAFTED")
    assert _archive_state(session_factory) == (False, None, True)


def test_change_status_from_legacy_value_is_allowed(api_client, seed):
    seed(make_job(status="Beworben"))
    assert _change_status(api_client, "APPLIED").status_code == 200


def test_change_status_of_unknown_job_returns_404(api_client):
    assert _change_status(api_client, "APPLIED").status_code == 404


def test_change_status_of_other_users_job_returns_404(api_client, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    assert _change_status(api_client, "APPLIED").status_code == 404
    assert fetch(session_factory, JobEntry, "job-1").status == "OPEN"


def test_change_status_rejects_overlong_note(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "DRAFTED", note="x" * (MAX_STATUS_NOTE_LENGTH + 1))
    assert response.status_code == 422


def test_removed_update_status_endpoint_returns_404(api_client, seed):
    seed(make_job())
    response = api_client.patch("/jobs/job-1/update-status", json={"status": "APPLIED"})
    assert response.status_code == 404


def test_patch_job_ignores_status_field(api_client, seed, session_factory):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"status": "APPLIED", "notes": "Call back"})
    assert fetch(session_factory, JobEntry, "job-1").status == "OPEN"


def _patch(api_client, payload):
    return api_client.patch("/jobs/job-1", json=payload)


def test_patch_checklist_is_stored_and_returned(api_client, seed):
    seed(make_job())
    _patch(api_client, {"checklist": {"sent": True}})
    expected = {"posting_opened": False, "documents_checked": False, "sent": True}
    assert api_client.get("/jobs/job-1").json()["checklist"] == expected


def test_patch_checklist_rejects_unknown_key(api_client, seed):
    seed(make_job())
    assert _patch(api_client, {"checklist": {"called_recruiter": True}}).status_code == 422


def test_patch_todos_replaces_list(api_client, seed):
    seed(make_job(todos=[{"id": "old", "text": "Old", "done": False}]))
    new_todos = [{"id": "t1", "text": "Prepare questions", "done": True}]
    _patch(api_client, {"todos": new_todos})
    assert api_client.get("/jobs/job-1").json()["todos"] == new_todos


def test_patch_todos_rejects_more_than_max_items(api_client, seed):
    seed(make_job())
    todos = [{"id": f"t{index}", "text": "Follow up"} for index in range(MAX_TODOS + 1)]
    assert _patch(api_client, {"todos": todos}).status_code == 422


def test_patch_todos_rejects_overlong_text(api_client, seed):
    seed(make_job())
    todos = [{"id": "t1", "text": "x" * (MAX_TODO_TEXT_LENGTH + 1)}]
    assert _patch(api_client, {"todos": todos}).status_code == 422


def test_patch_todos_rejects_duplicate_ids(api_client, seed):
    seed(make_job())
    todos = [{"id": "t1", "text": "A"}, {"id": "t1", "text": "B"}]
    response = _patch(api_client, {"todos": todos})
    assert response.status_code == 422
    assert "todo ids must be unique" in response.text


def test_patch_checklist_of_other_users_job_returns_404(api_client, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    assert _patch(api_client, {"checklist": {"sent": True}}).status_code == 404
    assert fetch(session_factory, JobEntry, "job-1").checklist is None


def test_patch_follow_up_stores_iso_timestamp(api_client, seed):
    seed(make_job())
    _patch(api_client, {"next_follow_up_at": "2026-10-20T09:00:00+00:00"})
    assert api_client.get("/jobs/job-1").json()["next_follow_up_at"].startswith("2026-10-20T09:00:00")


def test_patch_follow_up_rejects_invalid_timestamp(api_client, seed):
    seed(make_job())
    assert _patch(api_client, {"next_follow_up_at": "next tuesday"}).status_code == 422


@pytest.fixture()
def generation_api(api_client, monkeypatch):
    """The API with the Celery dispatch stubbed and the per-IP rate limit off, so tests stay independent."""
    monkeypatch.setattr(limiter, "enabled", False)
    with patch("routers.jobs.celery_app") as celery:
        yield api_client, celery


def _generation_state(session_factory) -> tuple:
    job = fetch(session_factory, JobEntry, "job-1")
    return job.status, job.pre_generation_status


@pytest.mark.parametrize("endpoint", ["/jobs/job-1/generate", "/jobs/job-1/generate-package"])
def test_generation_start_remembers_current_status(generation_api, seed, session_factory, endpoint):
    client, celery = generation_api
    seed(make_job(status="APPLIED"))
    client.post(endpoint)
    assert _generation_state(session_factory) == ("GENERATING", "APPLIED")
    celery.send_task.assert_called_once()


def test_cancel_generation_restores_stored_status(generation_api, seed, session_factory):
    client, _ = generation_api
    seed(make_job(status="GENERATING", pre_generation_status="INTERVIEW"))
    client.post("/jobs/job-1/cancel-generation")
    assert _generation_state(session_factory) == ("INTERVIEW", None)


def test_cancel_generation_without_stored_status_falls_back_on_draft(generation_api, seed, session_factory):
    client, _ = generation_api
    seed(make_job(status="GENERATING", application_draft="Dear team"))
    client.post("/jobs/job-1/cancel-generation")
    assert _generation_state(session_factory) == ("DRAFTED", None)


def test_generate_rejects_improvement_notes_above_limit(generation_api, seed):
    client, celery = generation_api
    seed(make_job())
    response = client.post("/jobs/job-1/generate", json={"improvement_notes": "x" * (MAX_DRAFT_LENGTH + 1)})
    assert response.status_code == 422
    celery.send_task.assert_not_called()


def test_generate_accepts_improvement_notes_at_limit(generation_api, seed):
    client, celery = generation_api
    seed(make_job())
    response = client.post("/jobs/job-1/generate", json={"improvement_notes": "x" * MAX_DRAFT_LENGTH})
    assert response.status_code == 200
    celery.send_task.assert_called_once()


def test_save_document_html_rejects_html_above_limit(api_client, seed, session_factory):
    seed(make_job(cv_html="<p>CV</p>"))
    response = api_client.put("/jobs/job-1/documents/html", json={"html": "x" * (MAX_DOCUMENT_HTML_LENGTH + 1)})
    assert response.status_code == 422
    assert fetch(session_factory, JobEntry, "job-1").cv_html == "<p>CV</p>"


def test_save_document_html_accepts_html_at_limit(api_client, seed, session_factory):
    seed(make_job())
    response = api_client.put("/jobs/job-1/documents/html", json={"html": "x" * MAX_DOCUMENT_HTML_LENGTH})
    assert response.status_code == 200
    assert len(fetch(session_factory, JobEntry, "job-1").cv_html) == MAX_DOCUMENT_HTML_LENGTH


INTERVIEW_AT = "2026-11-02T09:30:00+00:00"
FOLLOW_UP_AT = "2026-10-20T08:00:00+00:00"
START_DATE = "2026-12-01"
NAIVE_INTERVIEW_AT = "2026-11-02T09:30:00"
OFFSET_INTERVIEW_AT = "2026-11-02T11:30:00+02:00"


def test_patch_sets_interview_at_and_get_returns_iso(api_client, seed):
    seed(make_job())
    assert api_client.patch("/jobs/job-1", json={"interview_at": INTERVIEW_AT}).status_code == 200
    assert api_client.get("/jobs/job-1").json()["interview_at"] == INTERVIEW_AT


def test_get_job_returns_null_interview_at_by_default(api_client, seed):
    seed(make_job())
    assert api_client.get("/jobs/job-1").json()["interview_at"] is None


def test_patch_null_clears_interview_at(api_client, seed):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"interview_at": INTERVIEW_AT})
    api_client.patch("/jobs/job-1", json={"interview_at": None})
    assert api_client.get("/jobs/job-1").json()["interview_at"] is None


def test_patch_rejects_invalid_interview_at(api_client, seed):
    seed(make_job())
    response = api_client.patch("/jobs/job-1", json={"interview_at": "not-a-date"})
    assert response.status_code == 422


def test_patch_interview_at_of_other_user_returns_404(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    response = api_client.patch("/jobs/job-1", json={"interview_at": INTERVIEW_AT})
    assert response.status_code == 404


def test_patch_null_clears_next_follow_up_at(api_client, seed):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"next_follow_up_at": FOLLOW_UP_AT})
    api_client.patch("/jobs/job-1", json={"next_follow_up_at": None})
    assert api_client.get("/jobs/job-1").json()["next_follow_up_at"] is None


def test_patch_omitted_dates_stay_unchanged(api_client, seed):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"next_follow_up_at": FOLLOW_UP_AT, "interview_at": INTERVIEW_AT})
    api_client.patch("/jobs/job-1", json={"is_favorite": True})
    body = api_client.get("/jobs/job-1").json()
    assert (body["next_follow_up_at"], body["interview_at"]) == (FOLLOW_UP_AT, INTERVIEW_AT)


def test_patch_outcome_notes_are_stored_apart_from_the_notes(api_client, seed):
    seed(make_job(notes="Gehalt verhandeln"))
    _patch(api_client, {"outcome_notes": "Ersten Tag planen"})
    body = api_client.get("/jobs/job-1").json()
    assert (body["notes"], body["outcome_notes"]) == ("Gehalt verhandeln", "Ersten Tag planen")


def test_patch_first_day_checklist_is_stored_with_every_key(api_client, seed):
    seed(make_job())
    _patch(api_client, {"first_day_checklist": {"contract_signed": True}})
    expected = {
        "contract_signed": True, "papers_ready": False, "others_declined": False,
        "route_planned": False, "first_day_contact": False,
    }
    assert api_client.get("/jobs/job-1").json()["first_day_checklist"] == expected


def test_patch_sets_start_date_and_get_returns_the_day(api_client, seed):
    seed(make_job())
    assert _patch_status(api_client, {"start_date": START_DATE}) == 200
    assert api_client.get("/jobs/job-1").json()["start_date"] == START_DATE


def test_patch_null_clears_start_date(api_client, seed):
    seed(make_job())
    _patch(api_client, {"start_date": START_DATE})
    _patch(api_client, {"start_date": None})
    assert api_client.get("/jobs/job-1").json()["start_date"] is None


def test_patch_omitted_start_date_stays_unchanged(api_client, seed):
    seed(make_job())
    _patch(api_client, {"start_date": START_DATE})
    _patch(api_client, {"is_favorite": True})
    assert api_client.get("/jobs/job-1").json()["start_date"] == START_DATE


def test_get_job_returns_empty_offer_outcome_fields_by_default(api_client, seed):
    seed(make_job())
    body = api_client.get("/jobs/job-1").json()
    assert (body["outcome_notes"], body["first_day_checklist"], body["start_date"]) == (None, None, None)


def test_get_job_returns_pre_generation_status(api_client, seed):
    seed(make_job(status="GENERATING", pre_generation_status="APPLIED"))
    assert api_client.get("/jobs/job-1").json()["pre_generation_status"] == "APPLIED"


def test_get_job_returns_null_pre_generation_status(api_client, seed):
    seed(make_job())
    assert api_client.get("/jobs/job-1").json()["pre_generation_status"] is None


def test_patch_offset_interview_at_is_returned_as_utc(api_client, seed):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"interview_at": OFFSET_INTERVIEW_AT})
    assert api_client.get("/jobs/job-1").json()["interview_at"] == INTERVIEW_AT


def test_patch_naive_dates_are_stored_and_returned_as_utc(api_client, seed):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"interview_at": NAIVE_INTERVIEW_AT, "next_follow_up_at": NAIVE_INTERVIEW_AT})
    body = api_client.get("/jobs/job-1").json()
    assert (body["interview_at"], body["next_follow_up_at"]) == (INTERVIEW_AT, INTERVIEW_AT)


def test_job_created_at_is_utc_with_offset(api_client, seed):
    seed(make_job(created_at=datetime(2026, 10, 1, 7, 0, 0)))
    detail = api_client.get("/jobs/job-1").json()
    listed = api_client.get("/jobs").json()["items"][0]
    assert detail["created_at"] == listed["created_at"] == "2026-10-01T07:00:00+00:00"


def test_job_history_changed_at_is_utc_with_offset(api_client, seed):
    seed(make_job(), JobStatusHistory(
        job_id="job-1", from_status="OPEN", to_status="SAVED", changed_at=datetime(2026, 10, 1, 7, 0, 0),
    ))
    entry = api_client.get("/jobs/job-1/history").json()[0]
    assert entry["changed_at"] == "2026-10-01T07:00:00+00:00"


def test_job_document_list_uploaded_at_is_utc_with_offset(api_client, seed):
    seed(make_job(), JobDocument(
        id=1, job_id="job-1", user_id=TEST_USER_ID, filename="db://cv.pdf", original_filename="cv.pdf",
        content=b"%PDF", kind="UPLOADED", uploaded_at=datetime(2026, 10, 1, 7, 0, 0),
    ))
    entry = api_client.get("/jobs/job-1/documents").json()[0]
    assert entry["uploaded_at"] == "2026-10-01T07:00:00+00:00"


def test_job_document_upload_response_uploaded_at_is_utc_with_offset(api_client, seed):
    seed(make_job())
    files = {"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")}
    uploaded_at = api_client.post("/jobs/job-1/documents", files=files).json()["uploaded_at"]
    assert uploaded_at.endswith("+00:00")


def _download_document(api_client, seed, origin):
    seed(make_job(), JobDocument(
        id=1, job_id="job-1", user_id=TEST_USER_ID, filename="db://cv.pdf",
        original_filename="cv.pdf", mime_type="application/pdf", content=b"%PDF", kind="UPLOADED",
    ))
    return api_client.get("/jobs/job-1/documents/1/download", headers={"Origin": origin})


def test_cors_exposes_content_disposition_on_document_download(api_client, seed):
    response = _download_document(api_client, seed, allowed_origins[0])
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]


def test_cors_foreign_origin_gets_no_allow_origin_header(api_client, seed):
    response = _download_document(api_client, seed, FOREIGN_ORIGIN)
    assert "access-control-allow-origin" not in response.headers


def test_iso_utc_of_none_is_none():
    assert iso_utc(None) is None


# --- PATCH input bounds -------------------------------------------------------------------

def _patch_status(api_client, payload):
    return api_client.patch("/jobs/job-1", json=payload).status_code


@pytest.mark.parametrize("payload", [
    {"notes": "x" * (MAX_NOTES_LENGTH + 1)},
    {"outcome_notes": "x" * (MAX_NOTES_LENGTH + 1)},
    {"first_day_checklist": {"unknown": True}},
    {"start_date": "not-a-date"},
    {"application_draft": "x" * (MAX_DRAFT_LENGTH + 1)},
    {"cv_draft": "x" * (MAX_DRAFT_LENGTH + 1)},
    {"contact_persons": [{"name": "x" * (MAX_CONTACT_FIELD_LENGTH + 1)}]},
    {"contact_persons": [{"name": "A"}] * (MAX_CONTACTS + 1)},
    {"contact_persons": [{"name": "A", "unknown": "x"}]},
    {"recruiter_info": {"email": "x" * (MAX_CONTACT_FIELD_LENGTH + 1)}},
    {"recruiter_info": {"name": "A", "unknown": "x"}},
    {"salary_benchmark": {"min": -1}},
    {"salary_benchmark": {"max": MAX_SALARY_AMOUNT + 1}},
    {"salary_benchmark": {"note": "x" * (MAX_SALARY_NOTE_LENGTH + 1)}},
    {"salary_benchmark": {"min": 1, "unknown": 2}},
])
def test_patch_rejects_out_of_bounds_payload(api_client, seed, payload):
    seed(make_job())
    response = api_client.patch("/jobs/job-1", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:2] == ["body", next(iter(payload))]


def test_patch_accepts_payload_at_the_bounds(api_client, seed, session_factory):
    seed(make_job())
    payload = {
        "notes": "x" * MAX_NOTES_LENGTH,
        "outcome_notes": "x" * MAX_NOTES_LENGTH,
        "cv_draft": "x" * MAX_DRAFT_LENGTH,
        "contact_persons": [{"name": "x" * MAX_CONTACT_FIELD_LENGTH, "role": "", "email": "a@b.de"}] * MAX_CONTACTS,
        "recruiter_info": {"name": "R", "email": "r@b.de", "phone": "123"},
        "salary_benchmark": {"min": 0, "max": MAX_SALARY_AMOUNT, "note": "x" * MAX_SALARY_NOTE_LENGTH},
    }
    assert _patch_status(api_client, payload) == 200
    job = fetch(session_factory, JobEntry, "job-1")
    assert job.recruiter_info == {"name": "R", "role": None, "email": "r@b.de", "phone": "123"}
    assert job.salary_benchmark["max"] == MAX_SALARY_AMOUNT


def test_patch_rejects_a_salary_minimum_above_the_maximum(api_client, seed, session_factory):
    seed(make_job(salary_benchmark={"min": 60000, "max": 70000, "note": ""}))
    response = api_client.patch(
        "/jobs/job-1", json={"salary_benchmark": {"min": 90000, "max": 75000, "note": ""}}
    )
    assert response.status_code == 422
    # On the maximum, so the web client shows it under "Gehalt bis".
    assert response.json()["detail"][0]["loc"] == ["body", "salary_benchmark", "max"]
    assert fetch(session_factory, JobEntry, "job-1").salary_benchmark["max"] == 70000


@pytest.mark.parametrize("benchmark", [
    {"min": 75000, "max": 75000},
    {"min": 75000, "max": None},
    {"min": None, "max": 75000},
    {"max": 75000},
])
def test_patch_accepts_an_ordered_or_open_salary_range(api_client, seed, benchmark):
    seed(make_job())
    assert _patch_status(api_client, {"salary_benchmark": benchmark}) == 200


def test_patch_accepts_the_shapes_the_web_client_sends(api_client, seed):
    seed(make_job())
    payload = {
        "contact_persons": [{"name": "A", "role": "", "email": ""}],
        "salary_benchmark": {"min": None, "max": 90000, "note": ""},
    }
    assert _patch_status(api_client, payload) == 200


def test_get_job_serialises_legacy_stored_shapes(api_client, seed):
    seed(make_job(
        contact_persons=[{"name": "A", "linkedin": "x"}], recruiter_info={"foo": 1},
        salary_benchmark={"currency": "EUR", "min": "n/a"},
    ))
    body = api_client.get("/jobs/job-1").json()
    assert body["recruiter_info"] == {"foo": 1}
    assert body["contact_persons"] == [{"name": "A", "linkedin": "x"}]


PREP_JSON = '{"questions": []}'


def test_list_items_carry_pre_generation_status_and_prep_flag(api_client, seed):
    seed(make_job(status="GENERATING", pre_generation_status="APPLIED", interview_prep_material=PREP_JSON))
    item = api_client.get("/jobs").json()["items"][0]
    assert (item["pre_generation_status"], item["interview_prep_present"]) == ("APPLIED", True)
    assert "interview_prep_material" not in item


def test_list_item_prep_flag_is_false_without_material(api_client, seed):
    seed(make_job())
    assert api_client.get("/jobs").json()["items"][0]["interview_prep_present"] is False


def _history_row(job_id: str) -> JobStatusHistory:
    return JobStatusHistory(job_id=job_id, from_status="OPEN", to_status="DRAFTED")


def _document_row(job_id: str, doc_id: int) -> JobDocument:
    return JobDocument(
        id=doc_id, job_id=job_id, user_id=TEST_USER_ID, filename="db://cv.pdf",
        original_filename="cv.pdf", content=b"%PDF", kind="UPLOADED",
    )


def test_deleting_an_archived_job_removes_its_history_and_documents(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="USER"), _history_row("job-1"), _document_row("job-1", 1))
    assert api_client.delete("/jobs/job-1").json() == {"status": "deleted"}
    with session_factory() as db:
        left = (db.query(JobStatusHistory).count(), db.query(JobDocument).count(), db.get(JobEntry, "job-1"))
    assert left == (0, 0, None)


def test_deleting_one_job_keeps_the_rows_of_another(api_client, seed, session_factory):
    seed(
        make_job(is_archived=True, archive_reason="USER"), make_job(id="job-2"),
        _history_row("job-2"), _document_row("job-2", 2),
    )
    api_client.delete("/jobs/job-1")
    with session_factory() as db:
        assert (db.query(JobStatusHistory).count(), db.query(JobDocument).count()) == (1, 1)


EARLIER = datetime(2026, 10, 1, 8, 0)
LATER = datetime(2026, 10, 5, 9, 30)


def _status_change(job_id: str, to_status: str, changed_at: datetime) -> JobStatusHistory:
    return JobStatusHistory(job_id=job_id, from_status="OPEN", to_status=to_status, changed_at=changed_at)


def _items_by_id(api_client, **params) -> dict:
    return {item["id"]: item for item in api_client.get("/jobs", params=params).json()["items"]}


def test_list_items_carry_the_latest_status_change_time(api_client, seed):
    seed(
        make_job(status="APPLIED"),
        _status_change("job-1", "DRAFTED", EARLIER),
        _status_change("job-1", "APPLIED", LATER),
    )
    assert _items_by_id(api_client)["job-1"]["status_changed_at"] == iso_utc(LATER)


def test_list_item_status_change_time_is_null_without_history(api_client, seed):
    seed(make_job(id="with"), make_job(id="without"), _status_change("with", "DRAFTED", EARLIER))
    items = _items_by_id(api_client)
    assert (items["with"]["status_changed_at"], items["without"]["status_changed_at"]) == (iso_utc(EARLIER), None)


def test_list_items_report_a_letter_draft_without_sending_it(api_client, seed):
    seed(make_job(id="with", application_draft="Sehr geehrte Damen und Herren"), make_job(id="without"))
    items = _items_by_id(api_client)
    assert (items["with"]["application_draft_present"], items["without"]["application_draft_present"]) == (True, False)
    assert "application_draft" not in items["with"]


def test_list_search_matches_percent_and_underscore_literally(api_client, seed):
    seed(
        make_job(id="percent", title="100% Remote Engineer"),
        make_job(id="underscore", title="snake_case Developer"),
        make_job(id="plain", title="Backend Engineer"),
    )
    assert (_listed_ids(api_client, q="%"), _listed_ids(api_client, q="_")) == (["percent"], ["underscore"])


def test_list_search_matches_a_backslash_literally(api_client, seed):
    seed(make_job(id="slash", title="Dev\\Ops Engineer"), make_job(id="plain", title="Backend Engineer"))
    assert _listed_ids(api_client, q="\\") == ["slash"]


def test_list_search_ignores_surrounding_whitespace(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex", title="Designer"))
    assert _listed_ids(api_client, q="  acme  ") == ["acme"]


def test_list_search_of_only_whitespace_lists_everything(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex", title="Designer"))
    assert _listed_ids(api_client, q="   ") == ["acme", "other"]


HOSTILE_DOCUMENT_NAME = 'Zeugnis "Łódź".pdf'


@pytest.mark.parametrize("suffix,disposition", [("download", "attachment"), ("view", "inline")])
def test_job_document_name_with_quotes_and_non_latin_characters(api_client, seed, suffix, disposition):
    seed(make_job(), JobDocument(
        id=1, job_id="job-1", user_id=TEST_USER_ID, filename="db://cv.pdf", original_filename=HOSTILE_DOCUMENT_NAME,
        mime_type="application/pdf", content=b"%PDF", kind="UPLOADED",
    ))
    response = api_client.get(f"/jobs/job-1/documents/1/{suffix}")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        f'{disposition}; filename="Zeugnis ___d__.pdf"; '
        "filename*=UTF-8''Zeugnis%20%22%C5%81%C3%B3d%C5%BA%22.pdf"
    )


UPLOAD_LIMIT = 10
SECRET_DOCUMENT_NAME = "Geheim-Lebenslauf.pdf"


def _upload_job_document(api_client, content=PDF_BYTES, mime="application/pdf", name="cv.pdf"):
    return api_client.post("/jobs/job-1/documents", files={"file": (name, content, mime)})


def test_job_document_upload_reads_at_most_one_byte_past_the_limit(api_client, seed, monkeypatch):
    seed(make_job())
    monkeypatch.setattr("routers.jobs.MAX_FILE_SIZE", UPLOAD_LIMIT)
    reads = []
    original_read = UploadFile.read

    async def recording_read(self, size=-1):
        reads.append(size)
        return await original_read(self, size)

    monkeypatch.setattr(UploadFile, "read", recording_read)
    response = _upload_job_document(api_client, content=b"%PDF-" + b"x" * (UPLOAD_LIMIT * 3))
    assert (response.status_code, response.json(), reads) == (413, {"detail": "file_too_large"}, [UPLOAD_LIMIT + 1])


def test_job_document_upload_refuses_bytes_that_do_not_match_the_declared_type(api_client, seed, session_factory):
    seed(make_job())
    response = _upload_job_document(api_client, content=b"<html><script>alert(1)</script></html>", mime="image/png")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})
    with session_factory() as db:
        assert db.query(JobDocument).count() == 0


def test_job_document_upload_accepts_plain_text_by_its_declared_type(api_client, seed):
    seed(make_job())
    response = _upload_job_document(api_client, content=b"Notizen zum Gespraech", mime="text/plain", name="notes.txt")
    assert (response.status_code, response.json()["mime_type"]) == (200, "text/plain")


def test_job_document_upload_refuses_an_unlisted_type_without_echoing_it(api_client, seed):
    seed(make_job())
    response = _upload_job_document(api_client, content=b"<html></html>", mime="text/html", name="x.html")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})


def test_job_document_upload_failure_logs_no_file_name(api_client, seed, monkeypatch):
    seed(make_job())
    error = StatementError("INSERT failed", "INSERT INTO job_documents", {"name": SECRET_DOCUMENT_NAME}, Exception())
    monkeypatch.setattr(Session, "commit", Mock(side_effect=error))
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("routers.jobs.logger") as logger:
        response = _upload_job_document(api_client, name=SECRET_DOCUMENT_NAME)
    assert response.status_code == 500
    logger.error.assert_called_once_with("Document upload failed: %s", "StatementError")
    assert SECRET_DOCUMENT_NAME not in str(logger.mock_calls)


PREP_FAILED = "Die Erstellung ist fehlgeschlagen. Bitte versuche es erneut."
PREP_STARTED_AT = datetime(2026, 10, 15, 8, 0)


def test_get_job_reports_a_running_prep(api_client, seed):
    seed(make_job(interview_prep_started_at=PREP_STARTED_AT))
    body = api_client.get("/jobs/job-1").json()
    assert (body["interview_prep_running"], body["interview_prep_error"]) == (True, None)


def test_get_job_exposes_the_prep_start_stamp_in_utc(api_client, seed):
    seed(make_job(interview_prep_started_at=PREP_STARTED_AT))
    body = api_client.get("/jobs/job-1").json()
    assert body["interview_prep_started_at"] == "2026-10-15T08:00:00+00:00"


GENERATION_STARTED_AT = datetime(2026, 10, 15, 9, 30)


def test_get_job_exposes_the_generation_start_stamp(api_client, seed):
    seed(make_job(status="GENERATING", generation_started_at=GENERATION_STARTED_AT))
    body = api_client.get("/jobs/job-1").json()
    assert body["generation_started_at"] == "2026-10-15T09:30:00+00:00"


def test_get_job_without_runs_has_no_start_stamps(api_client, seed):
    seed(make_job())
    body = api_client.get("/jobs/job-1").json()
    stamps = (body["interview_prep_started_at"], body["company_research_started_at"], body["generation_started_at"])
    assert stamps == (None, None, None)


def test_get_job_reports_a_failed_prep(api_client, seed):
    seed(make_job(interview_prep_error=PREP_FAILED))
    body = api_client.get("/jobs/job-1").json()
    assert (body["interview_prep_running"], body["interview_prep_error"]) == (False, PREP_FAILED)


@pytest.mark.parametrize("path", ["/jobs/job-1/interview-prep", "/jobs/job-1/interview-prep/regenerate"])
def test_starting_a_prep_marks_it_running_and_clears_an_old_error(api_client, seed, session_factory, path):
    seed(make_job(interview_prep_error=PREP_FAILED))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post(path).json()["status"] == "queued"
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.interview_prep_started_at is not None, job.interview_prep_error) == (True, None)
    assert send_task.call_args.args[0] == "worker.generate_interview_prep_task"


def test_existing_prep_is_not_marked_running(api_client, seed, session_factory):
    seed(make_job(interview_prep_material='{"report_output": {}}'))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post("/jobs/job-1/interview-prep").json()["status"] == "exists"
    assert fetch(session_factory, JobEntry, "job-1").interview_prep_started_at is None
    send_task.assert_not_called()


def test_patch_of_an_extracted_field_removes_its_posting_mark(api_client, seed):
    seed(make_job(posting_extracted=["contact_persons", "salary_benchmark"]))
    api_client.patch("/jobs/job-1", json={"salary_benchmark": {"min": 1, "max": 2, "note": ""}})
    assert api_client.get("/jobs/job-1").json()["posting_extracted"] == ["contact_persons"]


def test_starting_posting_details_marks_them_running_and_queues_the_task(api_client, seed, session_factory):
    seed(make_job(posting_details_error="EXTRACTION_FAILED"))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post("/jobs/job-1/posting-details").json() == {"status": "queued"}
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.posting_details_started_at is not None, job.posting_details_error) == (True, None)
    assert send_task.call_args.args[0] == "worker.extract_posting_details_task"


def test_posting_details_already_running_are_not_queued_again(api_client, seed):
    seed(make_job(posting_details_started_at=datetime.now(timezone.utc)))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post("/jobs/job-1/posting-details").json() == {"status": "running"}
    send_task.assert_not_called()


def test_posting_details_without_posting_text_are_refused(api_client, seed):
    seed(make_job(description="  "))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post("/jobs/job-1/posting-details").status_code == 409
    send_task.assert_not_called()


def test_posting_details_of_another_users_job_are_not_found(api_client, seed):
    seed(make_job(user_id=OTHER_USER_ID))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post("/jobs/job-1/posting-details").status_code == 404
    send_task.assert_not_called()


def test_get_job_reports_the_posting_details_run_state(api_client, seed):
    started = datetime(2026, 10, 16, 8, 0, tzinfo=timezone.utc)
    seed(make_job(posting_details_started_at=started))
    body = api_client.get("/jobs/job-1").json()
    assert body["posting_details_running"] is True
    assert body["posting_details_started_at"].startswith("2026-10-16T08:00:00")


def test_get_job_reports_a_failed_posting_details_run(api_client, seed):
    seed(make_job(posting_details_error="NOTHING_NEW"))
    body = api_client.get("/jobs/job-1").json()
    assert (body["posting_details_running"], body["posting_details_error"]) == (False, "NOTHING_NEW")


def test_job_document_upload_stores_the_bytes_in_the_database(api_client, seed, session_factory):
    seed(make_job())
    response = _upload_job_document(api_client)
    with session_factory() as db:
        stored = db.query(JobDocument).one()
        assert (response.status_code, stored.filename, stored.content) == (200, "db://cv.pdf", PDF_BYTES)
    assert "storage" not in response.json()
