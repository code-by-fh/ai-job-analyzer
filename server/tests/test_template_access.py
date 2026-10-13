from unittest.mock import patch

import pytest

from database.core import UserProfile
from services.template_access import TemplateRef, find_usable_template, is_template_id
from tests.factories import (
    OTHER_USER_ID, TEST_USER_ID, make_job, make_profile, make_template, make_user,
)
from workers.tasks.package import generate_application_package_task

OWN_ID, ADMIN_ID, FOREIGN_ID = 40, 41, 42
OWN_HTML = "<p>own</p>"
FILE_TEMPLATE_KEY = "modern"


@pytest.fixture()
def templates(seed):
    seed(
        make_user(OTHER_USER_ID),
        make_template(id=OWN_ID, html=OWN_HTML),
        make_template(id=ADMIN_ID, user_id=None, is_admin=True, html="<p>admin</p>"),
        make_template(id=FOREIGN_ID, user_id=OTHER_USER_ID, html="<p>foreign</p>"),
    )


@pytest.mark.parametrize(("template_ref", "found"), [
    (str(OWN_ID), True), (str(ADMIN_ID), True), (str(FOREIGN_ID), False), (FILE_TEMPLATE_KEY, False), (None, False),
])
def test_find_usable_template_allows_own_and_admin_only(session_factory, templates, template_ref, found):
    with session_factory() as db:
        assert (find_usable_template(db, TEST_USER_ID, TemplateRef("CV", template_ref)) is not None) is found


def test_find_usable_template_requires_matching_doc_type(session_factory, templates):
    with session_factory() as db:
        assert find_usable_template(db, TEST_USER_ID, TemplateRef("COVER_LETTER", str(OWN_ID))) is None


def _stored_cv_template(session_factory):
    with session_factory() as db:
        profile = db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
        return profile.cv_template if profile else None


@pytest.mark.parametrize("template_ref", [str(OWN_ID), str(ADMIN_ID), FILE_TEMPLATE_KEY])
def test_template_selection_accepts_own_admin_and_file_templates(api_client, templates, session_factory, template_ref):
    response = api_client.patch("/settings/template", json={"cv_template": template_ref})
    assert response.status_code == 200
    assert _stored_cv_template(session_factory) == template_ref


def test_template_selection_rejects_other_users_template(api_client, templates, session_factory):
    response = api_client.patch("/settings/template", json={"cv_template": str(FOREIGN_ID)})
    assert response.status_code == 422
    assert _stored_cv_template(session_factory) is None


def test_template_selection_rejects_template_of_wrong_doc_type(api_client, templates):
    response = api_client.patch("/settings/template", json={"cover_letter_template": str(OWN_ID)})
    assert response.status_code == 422


def test_save_settings_rejects_other_users_template(api_client, templates, session_factory):
    response = api_client.post("/settings", json={"cv_template": str(FOREIGN_ID)})
    assert response.status_code == 422
    assert _stored_cv_template(session_factory) is None


def test_save_settings_accepts_own_template(api_client, templates, session_factory):
    assert api_client.post("/settings", json={"cv_template": str(OWN_ID)}).status_code == 200
    assert _stored_cv_template(session_factory) == str(OWN_ID)


def _cv_template_html_used(session_factory, seed, fake_redis, template_ref) -> str:
    seed(make_profile(cv_template=template_ref), make_job(status="GENERATING"))
    with patch("workers.tasks.package.SessionLocal", session_factory), \
         patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.package.get_client_and_model", return_value=(None, "test-model")), \
         patch("workers.tasks.package._build_cv", return_value=("<p>CV</p>", b"%PDF", {})) as build_cv:
        generate_application_package_task("job-1", TEST_USER_ID, False, True, False)
    _cv_data, template_html, *_ = build_cv.call_args.args
    return template_html


def test_package_renders_own_template(session_factory, seed, fake_redis, templates):
    seed(make_user())
    assert _cv_template_html_used(session_factory, seed, fake_redis, str(OWN_ID)) == OWN_HTML


def test_package_falls_back_to_file_template_for_other_users_template(session_factory, seed, fake_redis, templates):
    seed(make_user())
    assert _cv_template_html_used(session_factory, seed, fake_redis, str(FOREIGN_ID)) is None


@pytest.mark.parametrize(("template_ref", "is_id"), [
    ("12", True), ("123456789", True), ("1234567890123", False), ("²", False), ("٣", False),
    ("-1", False), ("", False), (None, False), (FILE_TEMPLATE_KEY, False),
])
def test_is_template_id_accepts_only_short_ascii_digit_strings(template_ref, is_id):
    assert is_template_id(template_ref) is is_id


@pytest.mark.parametrize("template_ref", ["²", "1234567890123"])
def test_template_selection_rejects_numeric_but_invalid_id(api_client, templates, session_factory, template_ref):
    response = api_client.patch("/settings/template", json={"cv_template": template_ref})
    assert response.status_code == 422
    assert _stored_cv_template(session_factory) is None


@pytest.mark.parametrize("template_ref", ["²", "1234567890123"])
def test_find_usable_template_ignores_numeric_but_invalid_id(session_factory, templates, template_ref):
    with session_factory() as db:
        assert find_usable_template(db, TEST_USER_ID, TemplateRef("CV", template_ref)) is None
