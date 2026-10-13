from unittest.mock import MagicMock

import pytest
from fastapi.routing import APIRoute

from core.auth import get_current_admin_user, get_current_user
from database.core import CompanyProfile, JobEntry, User
from main import app
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_job, make_user

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
ADMIN = User(id=TEST_USER_ID, username="root", is_admin=True, token_version=0)
DEEP_DIVE_BODY = {"focus": "culture", "how_to_proceed": "short", "company_name": "ACME", "title": "Dev"}
COMPANY_RESEARCH_LIMIT = 10
SEARCH_LIMIT = 60
MAX_SEARCH_LENGTH = 200
MAX_NAME_LENGTH = 200
MAX_DEEP_DIVE_TEXT = 2000
MAX_DEEP_DIVE_COMPANY = 200
MAX_DEEP_DIVE_TITLE = 300


@pytest.fixture()
def world(api_client, seed, monkeypatch, session_factory):
    for module in ("routers.companies", "routers.admin"):
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)
    seed(User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0))
    seed(
        make_job(id="a1", company="ACME GmbH", company_domain="acme.de", title="Kotlin Dev"),
        make_job(id="a2", company="ACME GmbH", company_domain="acme.de", title="Java Dev", is_archived=True),
        make_job(id="s1", company="Seen AG", company_domain="seen.de", status="SEEN"),
        make_job(id="e1", company="Legacy", company_domain=""),
        make_job(id="b1", user_id=OTHER_USER_ID, company="Globex", company_domain="globex.de", title="Kotlin Lead"),
        CompanyProfile(domain="globex.de", name="Globex", raw_data={"meta": {}}),
        CompanyProfile(domain="acme.de", name="ACME", raw_data={"meta": {}}),
    )
    return api_client


@pytest.fixture()
def sign_in(world):
    """Switches the signed-in user for one test; api_client's own member comes back afterwards."""
    def _sign_in(user: User):
        app.dependency_overrides[get_current_user] = lambda: user
    yield _sign_in
    app.dependency_overrides[get_current_user] = lambda: make_user()


@pytest.fixture()
def as_admin(world):
    app.dependency_overrides[get_current_admin_user] = lambda: ADMIN
    yield world
    app.dependency_overrides.pop(get_current_admin_user, None)


def test_company_directory_lists_only_own_domains(world):
    assert world.get("/companies").json() == {"items": [
        {"domain": "acme.de", "name": "ACME", "has_profile": True, "analyzed_at": None, "job_count": 2},
    ]}


def test_company_directory_without_own_jobs_is_empty(world, sign_in):
    sign_in(make_user(OTHER_USER_ID + 1))
    assert world.get("/companies").json() == {"items": []}


def test_scope_all_is_refused_for_a_member(world):
    response = world.get("/companies", params={"scope": "all"})
    assert (response.status_code, response.json()) == (403, {"detail": "Admins only"})


def test_scope_all_lists_every_profile_for_an_admin(world, sign_in):
    sign_in(ADMIN)
    items = world.get("/companies", params={"scope": "all"}).json()["items"]
    assert [(item["domain"], item["job_count"]) for item in items] == [("acme.de", 2), ("globex.de", 0)]


def test_unknown_scope_is_rejected(world):
    assert world.get("/companies", params={"scope": "everything"}).status_code == 422


def test_jobs_filter_by_company_domain(world):
    items = world.get("/jobs", params={"company_domain": "acme.de"}).json()["items"]
    assert [item["id"] for item in items] == ["a1"]


def test_jobs_filter_by_company_domain_lists_archived_jobs_on_request(world):
    params = {"company_domain": "acme.de", "is_archived": "true"}
    assert [item["id"] for item in world.get("/jobs", params=params).json()["items"]] == ["a2"]


def test_jobs_filter_by_company_domain_is_owner_scoped(world):
    assert world.get("/jobs", params={"company_domain": "globex.de"}).json()["items"] == []


def test_jobs_filter_rejects_an_invalid_company_domain(world):
    response = world.get("/jobs", params={"company_domain": "1.2.3.4"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "company_domain"]


def test_search_finds_only_own_jobs_and_companies(world):
    body = world.get("/search", params={"q": "kotlin"}).json()
    assert [job["id"] for job in body["jobs"]] == ["a1"]
    assert world.get("/search", params={"q": "globex"}).json() == {"jobs": [], "companies": []}
    assert world.get("/search", params={"q": "acme"}).json()["companies"] == [{"domain": "acme.de", "name": "ACME"}]


def test_search_answers_the_job_hit_shape(world):
    assert world.get("/search", params={"q": "kotlin"}).json()["jobs"] == [{
        "id": "a1", "title": "Kotlin Dev", "company": "ACME GmbH", "company_domain": "acme.de",
        "status": "OPEN", "is_archived": False,
    }]


def test_search_lists_archived_jobs_after_active_ones(world):
    ids = [job["id"] for job in world.get("/search", params={"q": "dev"}).json()["jobs"]]
    assert ids == ["a1", "a2"]


def test_search_caps_the_job_hits(world, seed):
    seed(*[make_job(id=f"k{number}", title=f"Kotlin {number}") for number in range(10)])
    assert len(world.get("/search", params={"q": "kotlin"}).json()["jobs"]) == 8


def test_search_caps_the_company_hits(world, seed):
    seed(*[make_job(id=f"c{number}", company=f"Kette {number}", company_domain=f"kette{number}.de") for number in range(6)])
    assert len(world.get("/search", params={"q": "kette"}).json()["companies"]) == 5


@pytest.mark.parametrize("q,found", [("MÜLLER", True), ("STRAßE", True), ("STRASSE", False)])
def test_search_folds_company_case_like_ilike(world, seed, q, found):
    # lower(), not casefold(): "ß" stays "ß", as in the database's ILIKE for the job hits.
    seed(
        make_job(id="m1", company="Müller GmbH", company_domain="mueller.de"),
        make_job(id="w1", company="Straße AG", company_domain="weg.de"),
    )
    assert (world.get("/search", params={"q": q}).json()["companies"] != []) is found


def test_search_is_owner_scoped_for_an_admin(world, sign_in):
    sign_in(ADMIN)
    assert world.get("/search", params={"q": "globex"}).json() == {"jobs": [], "companies": []}


def test_search_trims_the_query(world):
    assert [job["id"] for job in world.get("/search", params={"q": "  kotlin  "}).json()["jobs"]] == ["a1"]


@pytest.mark.parametrize("q", ["%", "_", "\\"])
def test_search_treats_like_wildcards_literally(world, q):
    assert world.get("/search", params={"q": q + q}).json()["jobs"] == []


@pytest.mark.parametrize("q", ["k", " k ", "k" * (MAX_SEARCH_LENGTH + 1)])
def test_search_bounds_the_trimmed_query(world, q):
    response = world.get("/search", params={"q": q})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "q"]


def test_search_is_rate_limited(world):
    codes = [world.get("/search", params={"q": "kotlin"}).status_code for _ in range(SEARCH_LIMIT + 1)]
    assert (codes[SEARCH_LIMIT - 1], codes[SEARCH_LIMIT]) == (200, 429)


def test_admin_rename_is_bounded(as_admin):
    assert as_admin.patch("/admin/companies/acme.de", json={"name": "   "}).status_code == 422
    too_long = {"name": "n" * (MAX_NAME_LENGTH + 1)}
    assert as_admin.patch("/admin/companies/acme.de", json=too_long).status_code == 422


def test_admin_rename_keeps_the_jobs_linked_to_the_profile(as_admin):
    assert as_admin.patch("/admin/companies/acme.de", json={"name": " ACME SE "}).json() == {
        "domain": "acme.de", "name": "ACME SE",
    }
    assert as_admin.get("/companies").json()["items"] == [
        {"domain": "acme.de", "name": "ACME SE", "has_profile": True, "analyzed_at": None, "job_count": 2},
    ]


def test_admin_rename_of_a_missing_profile_is_404(as_admin):
    response = as_admin.patch("/admin/companies/seen.de", json={"name": "Seen"})
    assert (response.status_code, response.json()) == (404, {"detail": "Company profile not found"})


def test_admin_rename_rejects_an_invalid_domain(as_admin):
    assert as_admin.patch("/admin/companies/1.2.3.4", json={"name": "x"}).status_code == 422


def test_admin_delete_company_profile_keeps_jobs(as_admin, session_factory):
    assert as_admin.delete("/admin/companies/acme.de").json() == {"status": "deleted"}
    response = as_admin.delete("/admin/companies/acme.de")
    assert (response.status_code, response.json()) == (404, {"detail": "Company profile not found"})
    with session_factory() as db:
        assert db.query(JobEntry).filter(JobEntry.company_domain == "acme.de").count() == 2
    assert as_admin.get("/companies").json()["items"] == [
        {"domain": "acme.de", "name": "ACME GmbH", "has_profile": False, "analyzed_at": None, "job_count": 2},
    ]


def test_company_research_is_rate_limited(world, monkeypatch):
    monkeypatch.setattr("routers.companies.celery_app.send_task", lambda *args, **kwargs: None)
    codes = [
        world.post("/companies/acme.de/analyze", json={"force_refresh": True}).status_code
        for _ in range(COMPANY_RESEARCH_LIMIT + 1)
    ]
    assert (codes[COMPANY_RESEARCH_LIMIT - 1], codes[COMPANY_RESEARCH_LIMIT]) == (200, 429)


def test_deep_dive_is_rate_limited(world, monkeypatch):
    monkeypatch.setattr("routers.companies.get_client_and_model", lambda task, db: (MagicMock(), "m"))
    monkeypatch.setattr("routers.companies.generate_deep_dive", lambda **kwargs: "text")
    codes = [
        world.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY).status_code
        for _ in range(COMPANY_RESEARCH_LIMIT + 1)
    ]
    assert (codes[COMPANY_RESEARCH_LIMIT - 1], codes[COMPANY_RESEARCH_LIMIT]) == (200, 429)


@pytest.mark.parametrize("field,length", [
    ("focus", MAX_DEEP_DIVE_TEXT), ("how_to_proceed", MAX_DEEP_DIVE_TEXT),
    ("company_name", MAX_DEEP_DIVE_COMPANY), ("title", MAX_DEEP_DIVE_TITLE),
])
def test_deep_dive_request_is_bounded(world, field, length):
    body = {**DEEP_DIVE_BODY, field: "f" * (length + 1)}
    response = world.post("/companies/acme.de/deep-dive", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


def test_deep_dive_language_is_de_or_en(world):
    response = world.post("/companies/acme.de/deep-dive", json={**DEEP_DIVE_BODY, "language": "fr"})
    assert response.status_code == 422


ADMIN_ROUTES = [
    ("GET", "/users"), ("POST", "/users"), ("DELETE", "/users/1"),
    ("GET", "/admin/settings"), ("POST", "/admin/settings"), ("GET", "/admin/system-status"),
    ("DELETE", "/admin/clear-ai-error"), ("POST", "/admin/redis/cleanup"), ("GET", "/admin/openrouter/models"),
    ("POST", "/admin/test/openrouter"), ("POST", "/admin/test/ollama"), ("POST", "/admin/database/wipe"),
    ("POST", "/admin/notification-templates"), ("PUT", "/admin/notification-templates/1"),
    ("DELETE", "/admin/notification-templates/1"), ("PATCH", "/admin/companies/acme.de"),
    ("DELETE", "/admin/companies/acme.de"),
]
# How ADMIN_ROUTES fills the path templates of the real routes.
PATH_PARAMETERS = {"{user_id}": "1", "{template_id}": "1", "{domain}": "acme.de"}


def _depends_on_admin(dependant) -> bool:
    return any(
        dependency.call is get_current_admin_user or _depends_on_admin(dependency)
        for dependency in dependant.dependencies
    )


def _filled(path: str) -> str:
    for template, value in PATH_PARAMETERS.items():
        path = path.replace(template, value)
    return path


def _admin_routes_of_the_app() -> set:
    routes = [route for route in app.routes if isinstance(route, APIRoute) and _depends_on_admin(route.dependant)]
    return {(method, _filled(route.path)) for route in routes for method in route.methods}


def _is_admin_path(path: str) -> bool:
    return path == "/users" or path.startswith(("/users/", "/admin/"))


def test_the_admin_route_list_is_complete():
    assert _admin_routes_of_the_app() == set(ADMIN_ROUTES)


def test_every_admin_path_depends_on_the_admin_check():
    paths = [route for route in app.routes if isinstance(route, APIRoute) and _is_admin_path(route.path)]
    assert {(method, _filled(route.path)) for route in paths for method in route.methods} <= _admin_routes_of_the_app()


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_every_admin_route_refuses_a_member(world, method, path):
    # A body valid for the route, so the 403 cannot be a 422 in disguise.
    body = {"username": "jonas", "password": "lang-genug", "name": "x", "type": "PUSHOVER", "content": "x"}
    response = world.request(method, path, json=body if method in ("POST", "PUT", "PATCH") else None)
    assert response.status_code == 403
