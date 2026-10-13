"""The web's profile sections and CV import: limits, independent saves, a bounded routed import."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import openai
import pytest

from database.core import UserProfile
from routers.settings import ParsedCv
from tests.factories import PDF_BYTES, TEST_USER_ID, make_profile

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

CREDENTIALS = {
    "pushover_user_key": "PUSH_USER_4711", "pushover_api_token": "PUSH_TOKEN_4711",
    "resend_api_key": "RESEND_KEY_4711", "resend_from_email": "jobs@example.com",
    "mailjet_api_key": "MJ_KEY_4711", "mailjet_secret_key": "MJ_SECRET_4711", "mailjet_from_email": "mj@example.com",
    "smtp_host": "smtp.example.com", "smtp_port": 587, "smtp_user": "me", "smtp_password": "SMTP_PW_4711",
    "smtp_from_email": "me@example.com", "email_global_recipient": "me@example.com",
    "google_drive_refresh_token": "DRIVE_TOKEN_4711", "google_drive_email": "me@gmail.com",
    "active_storage_service": "GOOGLE_DRIVE", "active_notification_service": "PUSHOVER",
}
SECRETS = ("PUSH_TOKEN_4711", "RESEND_KEY_4711", "MJ_KEY_4711", "MJ_SECRET_4711", "SMTP_PW_4711", "DRIVE_TOKEN_4711")
GOAL_BODY = {"role": "Lead", "skills": "Kotlin, Java", "min_salary": "80000", "location": "Hamburg",
             "preferences": "Hybrid", "spoken_languages": ["Deutsch", "Englisch"]}
CV_BODY = {"cv_data": {"experience": [{"company": "Acme", "role": "Dev", "duration": "2020-", "description": "APIs"}],
                       "projects": [], "education": "BSc"}}
PARSED = {"role": "Backend Dev", "skills": "Python", "min_salary": "", "location": "",
          "cv_data": {"experience": [{"company": "Neu GmbH", "role": "Dev"}], "projects": [], "education": "MSc"}}
PAGE_COUNT = 12
SHORT_PAGE_TEXT = "short page"
LONG_PAGE_CHARS = 20_000
LONG_PAGE_COUNT = 3


def _stored(session_factory) -> UserProfile:
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()


def test_profile_save_from_the_web_keeps_every_credential(api_client, seed, session_factory):
    seed(make_profile(**CREDENTIALS))
    assert api_client.post("/settings", json=GOAL_BODY).status_code == 200
    assert api_client.post("/settings", json=CV_BODY).status_code == 200
    profile = _stored(session_factory)
    assert {key: getattr(profile, key) for key in CREDENTIALS} == CREDENTIALS
    assert (profile.role, profile.cv_data["education"]) == ("Lead", "BSc")
    body = api_client.get("/settings").text
    assert not any(secret in body for secret in SECRETS)


@pytest.mark.parametrize("body,loc", [
    ({"role": "x" * 201}, ["body", "role"]),
    ({"skills": "x" * 2001}, ["body", "skills"]),
    ({"preferences": "x" * 5001}, ["body", "preferences"]),
    ({"spoken_languages": ["de"] * 21}, ["body", "spoken_languages"]),
    ({"spoken_languages": ["x" * 51]}, ["body", "spoken_languages", 0]),
    ({"cv_data": {"experience": [{}] * 31}}, ["body", "cv_data", "experience"]),
    ({"cv_data": {"experience": [{"description": "x" * 5001}]}}, ["body", "cv_data", "experience", 0, "description"]),
    ({"cv_data": {"education": "x" * 5001}}, ["body", "cv_data", "education"]),
    ({"min_salary": "x" * 51}, ["body", "min_salary"]),
    ({"location": "x" * 201}, ["body", "location"]),
    ({"cv_data": {"projects": [{}] * 31}}, ["body", "cv_data", "projects"]),
    ({"cv_data": {"experience": [{"company": "x" * 201}]}}, ["body", "cv_data", "experience", 0, "company"]),
    ({"cv_data": {"experience": [{"role": "x" * 201}]}}, ["body", "cv_data", "experience", 0, "role"]),
    ({"cv_data": {"experience": [{"duration": "x" * 101}]}}, ["body", "cv_data", "experience", 0, "duration"]),
    ({"cv_data": {"projects": [{"name": "x" * 201}]}}, ["body", "cv_data", "projects", 0, "name"]),
    ({"cv_data": {"projects": [{"tech_stack": "x" * 201}]}}, ["body", "cv_data", "projects", 0, "tech_stack"]),
])
def test_profile_fields_over_their_limit_are_refused_on_the_field(api_client, body, loc):
    response = api_client.post("/settings", json=body)
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, loc)
    assert "x" * 50 not in response.text


def test_entries_without_every_field_are_saved_with_empty_strings(api_client, seed, session_factory):
    seed(make_profile())
    api_client.post("/settings", json={"cv_data": {"experience": [{"company": "Acme"}]}})
    assert _stored(session_factory).cv_data["experience"] == [
        {"company": "Acme", "role": "", "duration": "", "description": ""},
    ]


def _import(api_client, content=PDF_BYTES, name="cv.pdf", mime="application/pdf", text="x" * 80, parsed=PARSED):
    routed = MagicMock(return_value=(None, "model"))
    answer = None if parsed is None else ParsedCv.model_validate(parsed)
    with patch("routers.settings.extract_text_from_pdf", return_value=text), \
         patch("routers.settings.get_client_and_model", routed), \
         patch("routers.settings.parse_cv_with_ai", return_value=answer) as parse:
        response = api_client.post("/settings/upload-cv", files={"file": (name, content, mime)})
    return response, parse, routed


def test_cv_import_stores_non_empty_values_and_replaces_the_cv_data(api_client, seed, session_factory):
    seed(make_profile(role="Old", skills="Old", location="Berlin"))
    response, _, _ = _import(api_client)
    profile = _stored(session_factory)
    assert (profile.role, profile.skills, profile.location) == ("Backend Dev", "Python", "Berlin")
    assert profile.cv_data["experience"] == [{"company": "Neu GmbH", "role": "Dev", "duration": "", "description": ""}]
    assert response.json()["data"]["location"] == "Berlin"


def test_cv_import_keeps_stored_values_the_cv_does_not_name(api_client, seed, session_factory):
    seed(make_profile(role="Lead", min_salary="80000"))
    _import(api_client, parsed={**PARSED, "role": "  "})
    assert (_stored(session_factory).role, _stored(session_factory).min_salary) == ("Lead", "80000")


def test_cv_import_keeps_every_credential(api_client, seed, session_factory):
    seed(make_profile(**CREDENTIALS))
    _import(api_client)
    profile = _stored(session_factory)
    assert {key: getattr(profile, key) for key in CREDENTIALS} == CREDENTIALS


def test_cv_import_refuses_a_non_pdf_even_with_a_pdf_name(api_client):
    response, parse, _ = _import(api_client, content=b"PK\x03\x04docx", name="cv.pdf")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})
    parse.assert_not_called()


def test_cv_import_accepts_an_uppercase_extension_and_any_declared_type(api_client, seed):
    seed(make_profile())
    response, _, _ = _import(api_client, name="CV.PDF", mime="application/octet-stream")
    assert response.status_code == 200


def test_cv_import_refuses_a_file_over_the_limit(api_client, monkeypatch):
    monkeypatch.setattr("routers.settings.MAX_CV_BYTES", len(PDF_BYTES) - 1)
    response, parse, _ = _import(api_client)
    assert (response.status_code, response.json()) == (413, {"detail": "file_too_large"})
    parse.assert_not_called()


def test_cv_import_without_text_is_a_field_error(api_client):
    response, parse, _ = _import(api_client, text="   ")
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert (error["loc"], error["msg"]) == (["body", "file"], "cv_no_text")
    parse.assert_not_called()


def test_cv_import_parse_failure_is_502_and_changes_nothing(api_client, seed, session_factory):
    seed(make_profile(role="Lead"))
    response, _, _ = _import(api_client, parsed=None)
    assert (response.status_code, response.json()) == (502, {"detail": "cv_parse_failed"})
    assert _stored(session_factory).role == "Lead"


def test_cv_import_asks_the_provider_routed_for_job_analysis(api_client, seed, session_factory):
    seed(make_profile(role="Old"))
    routed = MagicMock(return_value=(_ai_answering('{"role": "Routed Dev"}'), "model"))
    with patch("routers.settings.extract_text_from_pdf", return_value="x" * 80), \
         patch("routers.settings.get_client_and_model", routed):
        response = api_client.post("/settings/upload-cv", files={"file": ("cv.pdf", PDF_BYTES, "application/pdf")})
    assert routed.call_args.args[0] == "job_analysis"
    assert (response.status_code, _stored(session_factory).role) == (200, "Routed Dev")


def test_cv_prompt_leaves_an_unnamed_location_empty():
    from routers.settings import CV_PARSE_SYSTEM_PROMPT
    assert "Remote" not in CV_PARSE_SYSTEM_PROMPT
    assert "Wohnort oder Wunschort, falls im Text, sonst leer lassen" in CV_PARSE_SYSTEM_PROMPT


def _ai_answering(text: str, calls: list = None, finish_reason: str = "stop"):
    message = SimpleNamespace(content=text)
    completion = SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])
    return _ai_completing(completion, calls)


def _ai_completing(completion, calls: list = None):

    def create(**kwargs):
        if calls is not None:
            calls.append(kwargs)
        return completion

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def _ai_refusing(error: Exception):
    def create(**_):
        raise error

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def test_parse_refuses_an_answer_of_the_wrong_shape():
    from routers.settings import parse_cv_with_ai
    assert parse_cv_with_ai("cv", _ai_answering('["not", "an", "object"]'), "m") is None
    assert parse_cv_with_ai("cv", _ai_answering("no json at all"), "m") is None


def test_parse_fills_missing_fields_with_empty_strings():
    from routers.settings import parse_cv_with_ai
    parsed = parse_cv_with_ai("cv", _ai_answering('```json {"cv_data": {"experience": [{"company": "A"}]}} ```'), "m")
    assert (parsed.role, parsed.cv_data.experience[0].role) == ("", "")


def test_parse_bounds_the_ai_answer():
    from routers.settings import CV_PARSE_MAX_TOKENS, parse_cv_with_ai
    calls = []
    parse_cv_with_ai("cv", _ai_answering('{"role": "Dev"}', calls), "m")
    assert calls[0]["max_tokens"] == CV_PARSE_MAX_TOKENS == 16_000


def test_parse_accepts_nulls_and_numbers_from_the_ai():
    from routers.settings import parse_cv_with_ai
    answer = '{"location": null, "min_salary": 70000, "cv_data": {"experience": [{"company": "A", "duration": null}]}}'
    parsed = parse_cv_with_ai("cv", _ai_answering(answer), "m")
    assert (parsed.location, parsed.min_salary, parsed.cv_data.experience[0].duration) == ("", "70000", "")


@pytest.mark.parametrize("choices", [[], None])
def test_parse_of_an_answer_without_choices_fails(choices):
    from routers.settings import parse_cv_with_ai
    assert parse_cv_with_ai("cv", _ai_completing(SimpleNamespace(choices=choices)), "m") is None


def test_cv_import_of_an_answer_without_choices_is_502(api_client, seed):
    seed(make_profile())
    routed = MagicMock(return_value=(_ai_completing(SimpleNamespace(choices=[])), "model"))
    with patch("routers.settings.extract_text_from_pdf", return_value="x" * 80), \
         patch("routers.settings.get_client_and_model", routed):
        response = api_client.post("/settings/upload-cv", files={"file": ("cv.pdf", PDF_BYTES, "application/pdf")})
    assert (response.status_code, response.json()) == (502, {"detail": "cv_parse_failed"})


def _logged(logger: MagicMock) -> str:
    return " ".join(str(arg) for call in logger.mock_calls for arg in call.args)


def test_parse_failure_logs_never_quote_the_cv():
    from routers.settings import parse_cv_with_ai
    answer = '{"role": "SECRET_CV_TEXT_' + "x" * 300 + '"}'
    with patch("routers.settings.logger") as logger:
        assert parse_cv_with_ai("cv", _ai_answering(answer), "m") is None
    assert logger.error.called
    assert "SECRET_CV_TEXT" not in _logged(logger)


def test_parse_logs_an_answer_cut_by_the_token_cap_without_its_content():
    from routers.settings import parse_cv_with_ai
    with patch("routers.settings.logger") as logger:
        parse_cv_with_ai("cv", _ai_answering('{"role": "SECRET_CV_TEXT"', finish_reason="length"), "m")
    assert any("token cap" in str(call.args[0]) for call in logger.warning.call_args_list)
    assert "SECRET_CV_TEXT" not in _logged(logger)


def test_parse_reports_an_invalid_ai_key_to_the_ai_status_banner():
    from routers.settings import parse_cv_with_ai
    response = httpx.Response(401, request=httpx.Request("POST", "https://openrouter.example"))
    invalid_key = openai.AuthenticationError("invalid key", response=response, body=None)
    with patch("intelligence.service.store_ai_404_error") as banner:
        assert parse_cv_with_ai("cv", _ai_refusing(invalid_key), "m") is None
    banner.assert_called_once()


def test_pdf_text_is_limited_to_the_first_pages(monkeypatch):
    from routers import settings
    pages = [SimpleNamespace(extract_text=lambda i=i: f"page{i} {SHORT_PAGE_TEXT}") for i in range(PAGE_COUNT)]
    monkeypatch.setattr(settings, "PdfReader", lambda _stream: SimpleNamespace(pages=pages))
    text = settings.extract_text_from_pdf(PDF_BYTES)
    assert "page9" in text
    assert "page10" not in text


def test_pdf_text_is_limited_to_a_number_of_characters(monkeypatch):
    from routers import settings
    pages = [SimpleNamespace(extract_text=lambda: "y" * LONG_PAGE_CHARS) for _ in range(LONG_PAGE_COUNT)]
    monkeypatch.setattr(settings, "PdfReader", lambda _stream: SimpleNamespace(pages=pages))
    assert len(settings.extract_text_from_pdf(PDF_BYTES)) == settings.CV_MAX_TEXT_CHARS


STORED_CV = {"experience": [{"company": "Alt AG", "role": "Dev", "duration": "2018-", "description": "Bestand"}],
             "projects": [], "education": "BSc"}


def _import_answer(api_client, answer: str):
    routed = MagicMock(return_value=(_ai_answering(answer), "model"))
    with patch("routers.settings.extract_text_from_pdf", return_value="x" * 80), \
         patch("routers.settings.get_client_and_model", routed):
        return api_client.post("/settings/upload-cv", files={"file": ("cv.pdf", PDF_BYTES, "application/pdf")})


def test_cv_import_joins_a_tech_stack_list_into_text(api_client, seed, session_factory):
    seed(make_profile())
    response = _import_answer(api_client, '{"cv_data": {"projects": [{"name": "Shop", "tech_stack": ["Python", "Docker"]}]}}')
    assert response.status_code == 200
    assert _stored(session_factory).cv_data["projects"][0]["tech_stack"] == "Python, Docker"


def test_cv_import_joins_a_skills_list_into_text(api_client, seed, session_factory):
    seed(make_profile())
    response = _import_answer(api_client, '{"skills": ["Python", null, "Docker"]}')
    assert (response.status_code, _stored(session_factory).skills) == (200, "Python, Docker")


def test_cv_import_joins_education_objects_into_one_line_each(api_client, seed, session_factory):
    seed(make_profile())
    answer = ('{"cv_data": {"education": [{"degree": "MSc", "school": "TU Berlin", "year": null},'
              ' {"degree": "BSc", "year": 2015}]}}')
    response = _import_answer(api_client, answer)
    assert response.status_code == 200
    assert _stored(session_factory).cv_data["education"] == "MSc, TU Berlin\nBSc, 2015"


def test_cv_import_without_cv_data_keeps_the_stored_cv(api_client, seed, session_factory):
    seed(make_profile(cv_data=STORED_CV))
    response = _import_answer(api_client, '{"role": "Dev"}')
    assert (response.status_code, _stored(session_factory).cv_data) == (200, STORED_CV)


def test_cv_import_with_only_blank_entries_keeps_the_stored_cv(api_client, seed, session_factory):
    seed(make_profile(cv_data=STORED_CV))
    answer = '{"cv_data": {"experience": [{"company": " ", "role": ""}], "projects": [{}], "education": "  "}}'
    response = _import_answer(api_client, answer)
    assert (response.status_code, _stored(session_factory).cv_data) == (200, STORED_CV)


def test_cv_import_drops_blank_entries_and_replaces_the_cv_as_a_whole(api_client, seed, session_factory):
    seed(make_profile(cv_data=STORED_CV))
    answer = '{"cv_data": {"experience": [{"company": ""}, {"company": "Neu GmbH"}], "projects": [{"name": " "}]}}'
    _import_answer(api_client, answer)
    assert _stored(session_factory).cv_data == {
        "experience": [{"company": "Neu GmbH", "role": "", "duration": "", "description": ""}],
        "projects": [], "education": "",
    }


def test_cv_import_stores_a_numeric_duration_as_text(api_client, seed, session_factory):
    seed(make_profile())
    _import_answer(api_client, '{"cv_data": {"experience": [{"company": "A", "duration": 2019}]}}')
    assert _stored(session_factory).cv_data["experience"][0]["duration"] == "2019"


@pytest.mark.parametrize("field", ["skills", "tech_stack", "education"])
def test_cv_prompt_names_the_field_a_single_string(field):
    from routers.settings import CV_PARSE_SYSTEM_PROMPT
    assert f'"{field}" ist ein einzelner String, keine Liste.' in CV_PARSE_SYSTEM_PROMPT


def test_unreadable_json_logs_never_quote_the_ai_answer():
    from routers.settings import parse_cv_with_ai
    answer = '{"role": "SECRET_CV_TEXT", broken}'
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("intelligence.service.logger") as logger:
        assert parse_cv_with_ai("cv", _ai_answering(answer), "m") is None
    assert any("Failed to parse JSON" in str(call.args[0]) for call in logger.error.call_args_list)
    assert "SECRET_CV_TEXT" not in _logged(logger)


def _imported_cv(api_client, seed, session_factory, cv_data: str) -> dict:
    seed(make_profile())
    response = _import_answer(api_client, '{"cv_data": ' + cv_data + "}")
    assert response.status_code == 200
    return _stored(session_factory).cv_data


def test_cv_import_turns_a_single_education_object_into_text(api_client, seed, session_factory):
    cv = _imported_cv(api_client, seed, session_factory, '{"education": {"degree": "BSc", "school": "TU"}}')
    assert cv["education"] == "BSc, TU"


def test_cv_import_turns_a_duration_object_into_text(api_client, seed, session_factory):
    cv = _imported_cv(api_client, seed, session_factory,
                      '{"experience": [{"company": "A", "duration": {"from": 2019, "to": 2021}}]}')
    assert cv["experience"][0]["duration"] == "2019, 2021"


def test_cv_import_flattens_a_nested_list_without_python_syntax(api_client, seed, session_factory):
    cv = _imported_cv(api_client, seed, session_factory, '{"education": [{"degree": "BSc", "courses": ["A", "B"]}]}')
    assert cv["education"] == "BSc, A, B"


def test_cv_import_joins_grouped_skills_into_one_line(api_client, seed, session_factory):
    seed(make_profile())
    response = _import_answer(api_client, '{"skills": {"Sprachen": ["Python", "Go"], "Tools": ["Docker"]}}')
    assert (response.status_code, _stored(session_factory).skills) == (200, "Python, Go, Docker")


def test_cv_import_reads_text_entries_as_a_description_or_a_project_name(api_client, seed, session_factory):
    cv = _imported_cv(api_client, seed, session_factory,
                      '{"experience": ["Entwickler bei Acme"], "projects": ["Shop"]}')
    assert cv["experience"] == [{"company": "", "role": "", "duration": "", "description": "Entwickler bei Acme"}]
    assert cv["projects"] == [{"name": "Shop", "tech_stack": "", "description": ""}]
