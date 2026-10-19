"""SMTP delivery: the host is re-checked and pinned at send time, TLS is mandatory, errors map to fixed reasons."""

import logging
import smtplib
import socket
import ssl
from typing import Any, List

import pytest

from app import net_safety
from app.delivery import smtp
from app.delivery.content import Content, EmailContent
from app.delivery.reasons import DeliveryError
from tests.conftest import PUBLIC_TEST_ADDRESS, RECIPIENT, SMTP_PASSWORD

FIELDS = {
    "host": "smtp.example.com",
    "port": 2525,
    "username": "jobs@example.com",
    "password": SMTP_PASSWORD,
    "from_email": "jobs@example.com",
    "recipients": [RECIPIENT],
}
MAIL = Content(EmailContent(subject="Hallo", html="<p>Hi</p>", text=None), pushes=())
# Kept before the autouse fixture swaps the class for the fake.
REAL_PINNED_SMTP = smtp.PinnedSMTP


class FakeSmtpClient:
    """Stands in for the pinned smtplib client: records the conversation, can fail at one step."""

    instances: List["FakeSmtpClient"] = []
    fail_at: str | None = None
    error: Exception | None = None

    def __init__(self, address: str, timeout: float) -> None:
        self.address, self.timeout, self.steps = address, timeout, []
        self.message: Any = None
        FakeSmtpClient.instances.append(self)

    def __enter__(self) -> "FakeSmtpClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.steps.append("closed")

    def _step(self, name: str) -> None:
        self.steps.append(name)
        if FakeSmtpClient.fail_at == name:
            raise FakeSmtpClient.error

    def connect(self, host: str, port: int) -> None:
        self.connected_to = (host, port)
        self._step("connect")

    def starttls(self, context: ssl.SSLContext) -> None:
        self.tls_context = context
        self._step("starttls")

    def login(self, user: str, password: str) -> None:
        self.credentials = (user, password)
        self._step("login")

    def send_message(self, message: Any, from_addr: str, to_addrs: List[str]) -> None:
        self.message, self.envelope = message, (from_addr, to_addrs)
        self._step("send")


@pytest.fixture(autouse=True)
def fake_client(monkeypatch: pytest.MonkeyPatch) -> type:
    FakeSmtpClient.instances, FakeSmtpClient.fail_at, FakeSmtpClient.error = [], None, None
    monkeypatch.setattr(smtp, "PinnedSMTP", FakeSmtpClient)
    return FakeSmtpClient


def test_the_connection_is_pinned_to_the_checked_address_and_verifies_tls():
    smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    client = FakeSmtpClient.instances[0]
    assert client.address == PUBLIC_TEST_ADDRESS
    assert client.connected_to == ("smtp.example.com", 2525)
    assert client.steps == ["connect", "starttls", "login", "send", "closed"]
    assert client.tls_context.verify_mode == ssl.CERT_REQUIRED and client.tls_context.check_hostname


def test_the_mail_carries_subject_sender_and_html():
    smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    client = FakeSmtpClient.instances[0]
    assert (client.message["Subject"], client.message["From"]) == ("Hallo", "jobs@example.com")
    assert client.message.get_content_type() == "text/html"
    assert client.envelope == ("jobs@example.com", [RECIPIENT])


def test_the_default_port_is_587():
    smtp.send_smtp({key: value for key, value in FIELDS.items() if key != "port"}, MAIL, [RECIPIENT])
    assert FakeSmtpClient.instances[0].connected_to == ("smtp.example.com", 587)


def test_a_host_that_now_resolves_privately_is_refused_without_connecting(monkeypatch):
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: [PUBLIC_TEST_ADDRESS, "10.0.0.1"])
    with pytest.raises(DeliveryError) as refusal:
        smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    assert refusal.value.reason == "host_not_public"
    assert FakeSmtpClient.instances == []


@pytest.mark.parametrize(
    "step, error, reason",
    [
        ("connect", ConnectionRefusedError(), "unreachable"),
        ("connect", socket.timeout(), "timeout"),
        ("starttls", smtplib.SMTPNotSupportedError(), "tls_failed"),
        ("starttls", ssl.SSLCertVerificationError(), "tls_failed"),
        ("login", smtplib.SMTPAuthenticationError(535, b"no"), "auth_rejected"),
        ("send", smtplib.SMTPRecipientsRefused({RECIPIENT: (550, b"no")}), "rejected"),
        ("send", smtplib.SMTPServerDisconnected(), "unreachable"),
        ("send", smtplib.SMTPResponseException(451, b"later"), "failed"),
    ],
)
def test_an_smtp_error_becomes_a_fixed_reason(step, error, reason):
    FakeSmtpClient.fail_at, FakeSmtpClient.error = step, error
    with pytest.raises(DeliveryError) as refusal:
        smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    assert refusal.value.reason == reason


def test_credentials_are_never_sent_when_starttls_fails():
    FakeSmtpClient.fail_at, FakeSmtpClient.error = "starttls", smtplib.SMTPNotSupportedError()
    with pytest.raises(DeliveryError):
        smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    assert "login" not in FakeSmtpClient.instances[0].steps


def test_the_smtp_log_names_the_error_type_only(caplog):
    caplog.set_level(logging.INFO, logger="notify")
    FakeSmtpClient.fail_at = "send"
    FakeSmtpClient.error = smtplib.SMTPRecipientsRefused({RECIPIENT: (550, b"provider-said-something")})
    with pytest.raises(DeliveryError):
        smtp.send_smtp(FIELDS, MAIL, [RECIPIENT])
    assert "SMTPRecipientsRefused" in caplog.text
    assert RECIPIENT not in caplog.text and "provider-said-something" not in caplog.text


def test_the_pinned_client_opens_its_socket_to_the_pinned_address(monkeypatch):
    opened = []

    def _record(address, timeout, source_address):
        opened.append(address)
        raise ConnectionRefusedError()

    monkeypatch.setattr(smtp.socket, "create_connection", _record)
    with pytest.raises(ConnectionRefusedError):
        REAL_PINNED_SMTP(PUBLIC_TEST_ADDRESS, timeout=1).connect("smtp.example.com", 2525)
    assert opened == [(PUBLIC_TEST_ADDRESS, 2525)]


def test_a_credential_the_server_cannot_encode_is_an_auth_refusal_and_never_logged(caplog):
    caplog.set_level(logging.INFO, logger="notify")
    secret = "p\u00e4sswort"
    FakeSmtpClient.fail_at = "login"
    FakeSmtpClient.error = UnicodeEncodeError("ascii", secret, 1, 2, "ordinal not in range(128)")
    with pytest.raises(DeliveryError) as refusal:
        smtp.send_smtp({**FIELDS, "password": secret}, MAIL, [RECIPIENT])
    assert refusal.value.reason == "auth_rejected"
    assert "UnicodeEncodeError" in caplog.text and secret not in caplog.text
