"""The template preview renders with the owner's profile through the generation's renderers and sandbox."""

import pytest

from tests.factories import OTHER_USER_ID, make_profile, make_template, make_user

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

TEMPLATE_ID = 40
PREVIEW = "/document-templates/preview"
PREVIEW_LIMIT = 20
NOT_FOUND = (404, {"detail": "Template not found"})
REJECTED = (422, {"detail": "template_rejected"})
CV_HTML = "<h1>{{ name }}</h1>{% for e in experience %}<p>{{ e.company }}</p>{% endfor %}"
CV_DATA = {"experience": [{"company": "Acme", "role": "Dev", "duration": "", "description": ""}], "projects": [], "education": ""}


def _preview(api_client, template, doc_type="CV"):
    return api_client.get(PREVIEW, params={"doc_type": doc_type, "template": template})


def test_preview_of_an_own_cv_template_renders_the_profile(api_client, seed):
    seed(make_template(html=CV_HTML), make_profile(cv_data=CV_DATA))
    response = _preview(api_client, str(TEMPLATE_ID))
    assert response.status_code == 200
    assert "user501" in response.json()["html"] and "Acme" in response.json()["html"]


def test_preview_of_a_cv_template_sees_the_spoken_languages(api_client, seed):
    seed(make_template(html="{% for lang in spoken_languages %}<i>{{ lang }}</i>{% endfor %}"),
         make_profile(spoken_languages=["Deutsch", "Englisch"]))
    html = _preview(api_client, str(TEMPLATE_ID)).json()["html"]
    assert "<i>Deutsch</i><i>Englisch</i>" in html


def test_preview_of_the_bundled_cv_template(api_client, seed):
    seed(make_profile(cv_data=CV_DATA))
    html = _preview(api_client, "classic").json()["html"]
    assert "user501" in html and "Acme" in html


def test_preview_of_a_letter_template_fills_the_slots_in_the_profile_language(api_client, seed):
    seed(make_template(doc_type="COVER_LETTER", html='<p data-slot="body"></p><p data-slot="sender_name"></p>'),
         make_profile(language="en"))
    html = _preview(api_client, str(TEMPLATE_ID), "COVER_LETTER").json()["html"]
    assert "Your cover letter" in html and "user501" in html


def test_preview_of_the_bundled_letter_template_without_a_profile(api_client):
    html = _preview(api_client, "classic", "COVER_LETTER").json()["html"]
    assert "Hier steht dein Anschreiben" in html and "user501" in html


def test_preview_of_another_users_template_is_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_template(user_id=OTHER_USER_ID, html=CV_HTML))
    response = _preview(api_client, str(TEMPLATE_ID))
    assert (response.status_code, response.json()) == NOT_FOUND


@pytest.mark.parametrize("ref", ["nope", "../../etc/passwd", "99999"])
def test_preview_of_an_unknown_bundled_key_is_not_found(api_client, ref):
    response = _preview(api_client, ref)
    assert (response.status_code, response.json()) == NOT_FOUND


def test_preview_of_a_letter_id_as_a_cv_is_not_found(api_client, seed):
    seed(make_template(doc_type="COVER_LETTER", html="<p/>"))
    response = _preview(api_client, str(TEMPLATE_ID), "CV")
    assert (response.status_code, response.json()) == NOT_FOUND


def test_preview_of_a_hostile_stored_template_is_refused_and_has_no_effect(api_client, seed, tmp_path):
    marker = tmp_path / "pwned"
    payload = "<p>{{ cycler.__init__.__globals__.os.popen('touch %s').read() }}</p>" % marker
    seed(make_template(html=payload), make_profile())  # stored directly: older rows predate the save check
    response = _preview(api_client, str(TEMPLATE_ID))
    assert (response.status_code, response.json()) == REJECTED
    assert not marker.exists()


def test_preview_of_a_stored_template_with_private_access_is_refused_before_it_runs(api_client, seed):
    seed(make_template(html="<p>{{ name }}{{ name._secret }}</p>"), make_profile())  # the sandbox alone would render it
    response = _preview(api_client, str(TEMPLATE_ID))
    assert (response.status_code, response.json()) == REJECTED


def test_preview_of_a_letter_template_that_cannot_be_filled_is_refused(api_client, seed):
    html = "<ul><li data-repeat='body'><span data-slot='x'></span></li></ul>"
    seed(make_template(doc_type="COVER_LETTER", html=html), make_profile())
    response = _preview(api_client, str(TEMPLATE_ID), "COVER_LETTER")
    assert (response.status_code, response.json()) == REJECTED


def test_preview_values_are_escaped(api_client, seed):
    seed(make_template(html="<p>{{ role }}</p>"), make_profile(role="<script>alert(1)</script>"))
    html = _preview(api_client, str(TEMPLATE_ID)).json()["html"]
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_preview_doc_type_and_reference_are_validated(api_client):
    assert _preview(api_client, "classic", "XY").status_code == 422
    assert _preview(api_client, "x" * 65).status_code == 422


def test_preview_is_rate_limited(api_client):
    allowed = {_preview(api_client, "classic", "COVER_LETTER").status_code for _ in range(PREVIEW_LIMIT)}
    assert allowed == {200}
    assert _preview(api_client, "classic", "COVER_LETTER").status_code == 429
