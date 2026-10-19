"""POST /v1/previews: the job digest rendered as it would be sent, without sending anything."""

from tests.conftest import auth

JOB = {"title": "Engineer", "company": "Acme", "match_score": 80, "reasoning": "Fits.", "url": "https://example.com/1"}
HOSTILE_TITLE = "<script>x</script>"
ESCAPED_TITLE = "&lt;script&gt;x&lt;/script&gt;"


def _preview(**template_overrides) -> dict:
    template = {"name": "job_digest", "variables": {"user_name": "Ann", "platform_name": "Board", "jobs": [JOB]}}
    return {"template": {**template, **template_overrides}}


def test_a_preview_renders_the_mail_and_the_push_text(client, provider):
    body = _preview(html="<p>$userName</p>{{#jobs}}<b>$title</b>{{/jobs}}", push_text="$title @ $company")
    response = client.post("/v1/previews", json=body)
    assert response.status_code == 200
    assert response.json() == {
        "subject": "[Job Agent] 1 neuer Job-Match von Board",
        "html": "<p>Ann</p><b>Engineer</b>",
        "push_text": "Engineer @ Acme",
    }
    assert provider.calls == []


def test_a_preview_without_templates_uses_the_built_in_layout(client):
    answer = client.post("/v1/previews", json=_preview()).json()
    assert "1 new job match from Board" in answer["html"]
    assert answer["push_text"].startswith("Acme - Score: 80%")


def test_a_preview_escapes_job_text(client):
    variables = {"jobs": [{**JOB, "title": HOSTILE_TITLE}]}
    answer = client.post("/v1/previews", json=_preview(html="{{#jobs}}$title{{/jobs}}", variables=variables)).json()
    assert answer["html"] == ESCAPED_TITLE


def test_a_too_long_push_template_is_a_field_error(client):
    response = client.post("/v1/previews", json=_preview(push_text="x" * 2001))
    assert response.status_code == 422
    assert response.json()["error"]["fields"][0]["field"] == "template.push_text"


def test_a_preview_needs_the_api_key(raw_client):
    assert raw_client.post("/v1/previews", json=_preview()).status_code == 401
    assert raw_client.post("/v1/previews", json=_preview(), headers=auth("x" * 40)).status_code == 401
