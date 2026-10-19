"""POST /v1/notifications and POST /v1/channels/{id}/test: delivery, fixed reasons, rate limits."""

import logging

import pytest
import requests

from app.limits import APP_TEST_SEND_RATE, NOTIFICATION_RATE, TEST_SEND_RATE
from tests.conftest import (
    OTHER_OWNER,
    OWNER,
    PUSHOVER_TOKEN,
    RECIPIENT,
    RESEND_KEY,
    pushover_channel,
    resend_channel,
)

HOSTILE_TITLE = '<a href="https://phish.example">Bewerbung</a>'
ESCAPED_TITLE = "&lt;a href=&quot;https://phish.example&quot;&gt;Bewerbung&lt;/a&gt;"
JOB = {"title": "Engineer", "company": "Acme", "match_score": 80, "reasoning": "Fits.", "url": "https://example.com/1"}


def _digest(channel_ids, **template_overrides) -> dict:
    template = {"name": "job_digest", "variables": {"user_name": "Ann", "platform_name": "Board", "jobs": [JOB]}}
    return {"owner": OWNER, "channel_ids": channel_ids, "template": {**template, **template_overrides}}


def _plain(channel_ids, **overrides) -> dict:
    return {"owner": OWNER, "channel_ids": channel_ids, "subject": "Hallo", "body": "Text", **overrides}


def test_a_plain_notification_reaches_pushover(client, create_channel, provider):
    channel = create_channel(pushover_channel())
    response = client.post("/v1/notifications", json=_plain([channel["id"]]))
    assert response.status_code == 200
    assert response.json() == {"results": [{"channel_id": channel["id"], "delivered": True, "reason": None}]}
    sent = provider.calls[0]
    assert sent["url"] == "https://api.pushover.net/1/messages.json"
    assert (sent["data"]["token"], sent["data"]["title"], sent["data"]["message"]) == (PUSHOVER_TOKEN, "Hallo", "Text")
    assert sent["allow_redirects"] is False


def test_a_plain_notification_goes_out_as_text_mail(client, create_channel, provider):
    channel = create_channel(resend_channel())
    client.post("/v1/notifications", json=_plain([channel["id"]]))
    sent = provider.calls[0]
    assert sent["json"] == {"from": "jobs@example.com", "to": [RECIPIENT], "subject": "Hallo", "text": "Text"}
    assert sent["headers"] == {"Authorization": f"Bearer {RESEND_KEY}"}


def test_a_digest_escapes_job_text_in_the_mail(client, create_channel, provider):
    channel = create_channel(resend_channel())
    job = {**JOB, "title": HOSTILE_TITLE, "url": "javascript:alert(1)"}
    body = _digest([channel["id"]], variables={"user_name": "Ann", "platform_name": "Board", "jobs": [job]})
    client.post("/v1/notifications", json=body)
    html = provider.calls[0]["json"]["html"]
    assert ESCAPED_TITLE in html and HOSTILE_TITLE not in html
    assert "javascript:" not in html
    assert provider.calls[0]["json"]["subject"] == "[Job Agent] 1 neuer Job-Match von Board"


def test_a_digest_uses_the_custom_template(client, create_channel, provider):
    channel = create_channel(resend_channel())
    client.post("/v1/notifications", json=_digest([channel["id"]], html="<p>$userName</p>{{#jobs}}<b>$title</b>{{/jobs}}"))
    assert provider.calls[0]["json"]["html"] == "<p>Ann</p><b>Engineer</b>"


def test_a_digest_sends_one_push_per_job(client, create_channel, provider):
    channel = create_channel(pushover_channel())
    second = {**JOB, "title": "Second", "url": "javascript:x"}
    variables = {"user_name": "Ann", "platform_name": "Board", "jobs": [JOB, second]}
    client.post("/v1/notifications", json=_digest([channel["id"]], variables=variables, push_text="$title @ $company"))
    pushes = [call["data"] for call in provider.calls]
    assert [(push["title"], push["message"]) for push in pushes] == [("Engineer", "Engineer @ Acme"), ("Second", "Second @ Acme")]
    assert pushes[0]["url"] == "https://example.com/1" and "url" not in pushes[1]


def test_recipients_in_the_request_replace_the_channel_default(client, create_channel, provider):
    channel = create_channel(resend_channel())
    client.post("/v1/notifications", json=_plain([channel["id"]], recipients=["other@example.com"]))
    assert provider.calls[0]["json"]["to"] == ["other@example.com"]


def test_without_channel_ids_every_channel_of_the_owner_is_used(client, create_channel, provider):
    create_channel(pushover_channel())
    create_channel(resend_channel())
    create_channel(resend_channel(owner=OTHER_OWNER))
    response = client.post("/v1/notifications", json={"owner": OWNER, "subject": "Hallo", "body": "Text"})
    assert len(response.json()["results"]) == 2
    assert len(provider.calls) == 2


def test_a_channel_of_another_owner_is_not_found_and_nothing_is_sent(client, create_channel, provider):
    mine = create_channel(pushover_channel())
    theirs = create_channel(pushover_channel(owner=OTHER_OWNER))
    response = client.post("/v1/notifications", json=_plain([mine["id"], theirs["id"]]))
    assert response.status_code == 404
    assert provider.calls == []


def test_a_channel_of_another_app_is_not_found(create_channel, other_app_client, provider):
    channel = create_channel(pushover_channel())
    assert other_app_client.post("/v1/notifications", json=_plain([channel["id"]])).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"owner": OWNER, "subject": "Hallo"},
        {"owner": OWNER, "body": "Text"},
        {"owner": OWNER, "subject": "Zwei\nZeilen", "body": "Text"},
        {"owner": OWNER, "subject": "Hallo", "body": "x" * 10_001},
        {"owner": OWNER, "subject": "Hallo", "body": "Text", "template": {"name": "job_digest", "variables": {"jobs": [JOB]}}},
        {"owner": OWNER, "template": {"name": "job_digest", "variables": {"jobs": []}}},
        {"owner": OWNER, "subject": "Hallo", "body": "Text", "recipients": ["bad"]},
    ],
)
def test_a_malformed_notification_is_a_validation_error(client, body):
    response = client.post("/v1/notifications", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["fields"]


@pytest.mark.parametrize(
    "status_code, reason", [(401, "auth_rejected"), (403, "auth_rejected"), (422, "rejected"), (500, "failed")]
)
def test_a_provider_refusal_becomes_a_fixed_reason(client, create_channel, provider, status_code, reason):
    channel = create_channel(resend_channel())
    provider.status_code = status_code
    result = client.post("/v1/notifications", json=_plain([channel["id"]])).json()["results"][0]
    assert (result["delivered"], result["reason"]) == (False, reason)


@pytest.mark.parametrize(
    "error, reason",
    [(requests.ConnectTimeout(), "timeout"), (requests.ConnectionError(), "unreachable"), (requests.RequestException(), "failed")],
)
def test_a_transport_error_becomes_a_fixed_reason(client, create_channel, provider, error, reason):
    channel = create_channel(pushover_channel())
    provider.error = error
    assert client.post("/v1/notifications", json=_plain([channel["id"]])).json()["results"][0]["reason"] == reason


def test_logs_name_neither_recipients_nor_provider_text(client, create_channel, provider, caplog):
    caplog.set_level(logging.INFO, logger="notify")
    channel = create_channel(resend_channel())
    provider.status_code = 422
    client.post("/v1/notifications", json=_plain([channel["id"]]))
    assert "422" in caplog.text
    assert RECIPIENT not in caplog.text and "provider-said-something" not in caplog.text and RESEND_KEY not in caplog.text


def test_sends_per_app_are_rate_limited(client, create_channel, provider, clock):
    channel = create_channel(pushover_channel())
    for _ in range(NOTIFICATION_RATE.limit):
        assert client.post("/v1/notifications", json=_plain([channel["id"]])).status_code == 200
    refused = client.post("/v1/notifications", json=_plain([channel["id"]], owner=OTHER_OWNER))
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "RATE_LIMITED"
    assert int(refused.headers["retry-after"]) > 0
    clock.advance(NOTIFICATION_RATE.window_seconds)
    assert client.post("/v1/notifications", json=_plain([channel["id"]])).status_code == 200


def test_a_test_send_reaches_the_channel_default_recipients(client, create_channel, provider):
    channel = create_channel(resend_channel())
    response = client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OWNER})
    assert response.status_code == 200
    assert response.json() == {"channel_id": channel["id"], "delivered": True, "reason": None}
    assert provider.calls[0]["json"]["to"] == [RECIPIENT]


def test_a_failed_test_send_answers_a_fixed_reason(client, create_channel, provider):
    channel = create_channel(resend_channel())
    provider.status_code = 401
    response = client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OWNER})
    assert response.json() == {"channel_id": channel["id"], "delivered": False, "reason": "auth_rejected"}


def test_a_test_send_of_another_owners_channel_is_not_found(client, create_channel, provider):
    channel = create_channel(pushover_channel())
    assert client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OTHER_OWNER}).status_code == 404
    assert provider.calls == []


def test_test_sends_are_rate_limited_per_owner(client, create_channel, provider, clock):
    channel = create_channel(pushover_channel())
    other = create_channel(pushover_channel(owner=OTHER_OWNER))
    for _ in range(TEST_SEND_RATE.limit):
        assert client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OWNER}).status_code == 200
    assert client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OWNER}).status_code == 429
    assert client.post(f"/v1/channels/{other['id']}/test", params={"owner": OTHER_OWNER}).status_code == 200
    clock.advance(TEST_SEND_RATE.window_seconds)
    assert client.post(f"/v1/channels/{channel['id']}/test", params={"owner": OWNER}).status_code == 200


def test_test_sends_are_also_rate_limited_per_app_across_owners(client, create_channel, provider):
    owners_to_fill = APP_TEST_SEND_RATE.limit // TEST_SEND_RATE.limit
    channels = [create_channel(pushover_channel(owner=f"owner-{index}")) for index in range(owners_to_fill + 1)]
    statuses = [
        client.post(f"/v1/channels/{channel['id']}/test", params={"owner": channel["owner"]}).status_code
        for channel in channels[:owners_to_fill]
        for _ in range(TEST_SEND_RATE.limit)
    ]
    fresh_owner = channels[-1]
    refused = client.post(f"/v1/channels/{fresh_owner['id']}/test", params={"owner": fresh_owner["owner"]})
    assert set(statuses) == {200}
    assert refused.status_code == 429
