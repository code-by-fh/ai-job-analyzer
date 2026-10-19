"""A host is reachable only when every address it resolves to is public (SSRF guard)."""

import socket
import time

import pytest

from app import net_safety
from tests.conftest import PUBLIC_TEST_ADDRESS

SMTP_PORT = 587


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "fe80::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "64:ff9b::a9fe:a9fe",
        "2002:7f00:1::",
    ],
)
def test_a_name_resolving_to_a_non_public_address_is_refused(monkeypatch, address):
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: [address])
    assert net_safety.public_address("smtp.example.com", SMTP_PORT) is None


def test_one_private_record_among_public_ones_is_enough_to_refuse(monkeypatch):
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: [PUBLIC_TEST_ADDRESS, "10.0.0.1"])
    assert net_safety.public_address("smtp.example.com", SMTP_PORT) is None


def test_a_public_name_yields_its_first_address():
    assert net_safety.public_address("smtp.example.com", SMTP_PORT) == PUBLIC_TEST_ADDRESS


def test_a_public_literal_address_is_used_without_dns(monkeypatch):
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: pytest.fail("resolved a literal address"))
    assert net_safety.public_address("1.1.1.1", SMTP_PORT) == "1.1.1.1"


@pytest.mark.parametrize("host", ["localhost", "mail.localhost", "127.1", "0x7f.1", "a b", "host%2f", "", "exämple.com"])
def test_a_loopback_name_or_ambiguous_host_is_refused(host):
    assert net_safety.is_valid_host(host) is False


@pytest.mark.parametrize("host", ["smtp.example.com", "SMTP.Example.com", "1.1.1.1", "2606:4700::1111"])
def test_a_plain_host_name_or_address_is_valid(host):
    assert net_safety.is_valid_host(host) is True


def test_a_failed_lookup_is_refused(monkeypatch):
    def _fail(host, port):
        raise socket.gaierror()

    monkeypatch.setattr(net_safety, "_resolve", _fail)
    assert net_safety.public_address("smtp.example.com", SMTP_PORT) is None


def test_a_slow_lookup_is_refused(monkeypatch):
    monkeypatch.setattr(net_safety, "DNS_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: time.sleep(0.2) or [PUBLIC_TEST_ADDRESS])
    assert net_safety.public_address("smtp.example.com", SMTP_PORT) is None
