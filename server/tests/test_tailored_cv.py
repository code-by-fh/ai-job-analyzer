import json
from unittest.mock import MagicMock, patch

from intelligence.service import generate_tailored_cv


def _fake_response(content: str):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    return resp


@patch("intelligence.service.get_ollama_client")
def test_generate_tailored_cv_parses_json(mock_client):
    payload = {
        "name": "Max",
        "role": "Backend Engineer",
        "summary": "Erfahrener Entwickler",
        "skills": "Python, FastAPI",
        "experience": [{"role": "Dev", "company": "ACME", "duration": "2020", "description": "APIs"}],
        "projects": [],
        "education": "B.Sc.",
    }
    mock_client.return_value.chat.completions.create.return_value = _fake_response(
        "```json\n" + json.dumps(payload) + "\n```"
    )
    result = generate_tailored_cv(
        cv_data={"experience": [], "projects": [], "education": ""},
        job_title="Backend Engineer",
        job_description="Build APIs",
        candidate_name="Max",
        candidate_role="Backend Engineer",
        model="llama3.1:8b",
    )
    assert result["name"] == "Max"
    assert result["summary"] == "Erfahrener Entwickler"
    assert result["experience"][0]["company"] == "ACME"
