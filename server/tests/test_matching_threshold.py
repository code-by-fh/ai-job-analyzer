import pytest

from database.core import JobEntry
from routers.settings import MAX_MATCH_THRESHOLD, MIN_MATCH_THRESHOLD
from tests.factories import OTHER_USER_ID, fetch, make_job, make_user

THRESHOLD = 60
BELOW = THRESHOLD - 10
ABOVE = THRESHOLD + 10


def _preview(api_client, threshold=THRESHOLD):
    return api_client.get("/matching-preference/preview", params={"threshold": threshold})


def _apply(api_client, threshold=THRESHOLD):
    return api_client.post(
        "/matching-preference", json={"match_threshold": threshold, "apply_to_existing": True}
    ).json()


def _archived(session_factory, job_id) -> tuple:
    job = fetch(session_factory, JobEntry, job_id)
    return job.is_archived, job.archive_reason


def test_preview_counts_jobs_that_would_move_both_ways(api_client, seed):
    seed(
        make_job(id="low", match_score=BELOW),
        make_job(id="high", match_score=ABOVE),
        make_job(id="hidden-high", match_score=ABOVE, is_archived=True, archive_reason="THRESHOLD"),
    )
    assert _preview(api_client).json() == {"threshold": THRESHOLD, "would_archive": 1, "would_restore": 1}


def test_preview_ignores_protected_jobs(api_client, seed):
    seed(
        make_job(id="favourite", match_score=BELOW, is_favorite=True),
        make_job(id="kept", match_score=BELOW, kept_by_user=True),
        make_job(id="drafted", match_score=BELOW, status="DRAFTED"),
        make_job(id="seen", match_score=BELOW, status="SEEN"),
        make_job(id="discarded", match_score=ABOVE, is_archived=True, archive_reason="USER"),
    )
    body = _preview(api_client).json()
    assert (body["would_archive"], body["would_restore"]) == (0, 0)


@pytest.mark.parametrize("threshold", [MIN_MATCH_THRESHOLD - 1, MAX_MATCH_THRESHOLD + 1])
def test_preview_rejects_threshold_out_of_range(api_client, threshold):
    assert _preview(api_client, threshold).status_code == 422


def test_save_without_apply_leaves_jobs_untouched(api_client, seed, session_factory):
    seed(make_job(match_score=BELOW))
    body = api_client.post("/matching-preference", json={"match_threshold": THRESHOLD}).json()
    assert body == {"status": "saved", "match_threshold": THRESHOLD, "archived": 0, "restored": 0}
    assert _archived(session_factory, "job-1") == (False, None)


def test_apply_archives_below_and_restores_above(api_client, seed, session_factory):
    seed(
        make_job(id="low", match_score=BELOW),
        make_job(id="hidden-high", match_score=ABOVE, is_archived=True, archive_reason="THRESHOLD"),
    )
    body = _apply(api_client)
    assert (body["archived"], body["restored"]) == (1, 1)
    assert _archived(session_factory, "low") == (True, "THRESHOLD")
    assert _archived(session_factory, "hidden-high") == (False, None)
    assert fetch(session_factory, JobEntry, "hidden-high").kept_by_user is False


def test_apply_never_touches_protected_jobs(api_client, seed, session_factory):
    seed(
        make_job(id="favourite", match_score=BELOW, is_favorite=True),
        make_job(id="kept", match_score=BELOW, kept_by_user=True),
        make_job(id="drafted", match_score=BELOW, status="DRAFTED"),
    )
    _apply(api_client)
    states = [_archived(session_factory, job_id) for job_id in ("favourite", "kept", "drafted")]
    assert states == [(False, None)] * 3


def test_apply_does_not_touch_other_users_jobs(api_client, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_job(id="foreign", user_id=OTHER_USER_ID, match_score=BELOW))
    _apply(api_client)
    assert _archived(session_factory, "foreign") == (False, None)


def test_apply_with_previous_threshold_undoes_the_change(api_client, seed, session_factory):
    seed(make_job(match_score=BELOW))
    _apply(api_client, THRESHOLD)
    _apply(api_client, BELOW)
    assert _archived(session_factory, "job-1") == (False, None)


def test_preview_ignores_other_users_jobs(api_client, seed):
    seed(
        make_user(OTHER_USER_ID),
        make_job(id="foreign-low", user_id=OTHER_USER_ID, match_score=BELOW),
        make_job(id="foreign-hidden", user_id=OTHER_USER_ID, match_score=ABOVE,
                 is_archived=True, archive_reason="THRESHOLD"),
    )
    body = _preview(api_client).json()
    assert (body["would_archive"], body["would_restore"]) == (0, 0)


def test_save_without_threshold_returns_422(api_client):
    response = api_client.post("/matching-preference", json={"apply_to_existing": True})
    assert response.status_code == 422


SCORE_BUCKETS = MAX_MATCH_THRESHOLD + 1


def _distribution(api_client) -> list:
    return api_client.get("/matching-preference/distribution").json()["counts"]


def test_distribution_counts_jobs_per_rounded_score(api_client, seed):
    seed(
        make_job(id="a", match_score=84.4),
        make_job(id="b", match_score=84.5),
        make_job(id="hidden", match_score=40.0, is_archived=True, archive_reason="THRESHOLD"),
    )
    counts = _distribution(api_client)
    assert len(counts) == SCORE_BUCKETS
    assert (counts[84], counts[85], counts[40], sum(counts)) == (1, 1, 1, 3)


def test_distribution_skips_jobs_the_threshold_does_not_sort(api_client, seed):
    seed(
        make_user(OTHER_USER_ID),
        make_job(id="drafted", status="DRAFTED"),
        make_job(id="discarded", is_archived=True, archive_reason="USER"),
        make_job(id="unscored", match_score=None),
        make_job(id="foreign", user_id=OTHER_USER_ID),
    )
    assert sum(_distribution(api_client)) == 0
