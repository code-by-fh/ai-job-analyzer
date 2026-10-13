import socket
import threading
import time

import pytest

from core import url_safety
from core.url_safety import (
    NOT_PUBLIC,
    canonical_http_url,
    ensure_public_http_url,
    host_for_log,
    is_public_http_url,
    public_http_url,
)
from tests.factories import PUBLIC_TEST_ADDRESS

PRIVATE_ADDRESS = "10.1.2.3"
SHORT_DNS_TIMEOUT_SECONDS = 0.05
SLOW_RESOLVER_WALL_LIMIT_SECONDS = 1
HANGING_RESOLVER_RELEASE_SECONDS = 5
# Captured at import, before the autouse public_dns fixture replaces it for each test.
REAL_RESOLVE = url_safety._resolve


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8000/",
    "http://0.0.0.0:6379",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/jobs",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://[fc00::1]/",
    "http://[::ffff:127.0.0.1]/",
])
def test_private_and_reserved_addresses_are_refused(url):
    assert is_public_http_url(url) is False


@pytest.mark.parametrize("url", [
    "http://[::127.0.0.1]/",
    "http://[::a9fe:a9fe]/",
    "http://[64:ff9b::a9fe:a9fe]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
    "http://[2002:a00:5::1]/",
    "http://[64:ff9b:1::a9fe:a9fe]/",
    "http://[fec0::1]/",
    "http://[ff02::1]/",
])
def test_ipv6_forms_embedding_or_reaching_a_private_target_are_refused(url):
    assert is_public_http_url(url) is False


@pytest.mark.parametrize("url", [
    "http://[64:ff9b::5db8:d822]/",
    "http://[2002:5db8:d822::]/",
    "http://[2606:2800:220:1::1]/",
])
def test_ipv6_forms_of_a_public_address_are_accepted(url):
    assert is_public_http_url(url) is True


@pytest.mark.parametrize("url", [
    "http://2130706433/",
    "http://0x7f.1/",
    "http://017700000001/",
    "http://127.1/",
])
def test_numeric_loopback_spellings_are_refused_by_the_real_resolver(monkeypatch, url):
    monkeypatch.setattr(url_safety, "_resolve", REAL_RESOLVE)
    assert is_public_http_url(url) is False


@pytest.mark.parametrize("url", [
    "ftp://jobs.example.com/",
    "javascript:alert(1)",
    "https://",
    "jobs.example.com/search",
    "http://user:pw@jobs.example.com/",
    "http://:pw@jobs.example.com/",
    "http://@jobs.example.com/",
    "http://jobs.example.com\\@127.0.0.1/",
    "http://jobs.example.com:99999/",
])
def test_non_http_malformed_or_credential_urls_are_refused(url):
    assert is_public_http_url(url) is False


def test_a_public_name_and_a_public_literal_address_are_accepted():
    assert is_public_http_url("https://jobs.example.com/search?q=kotlin") is True
    assert is_public_http_url(f"http://{PUBLIC_TEST_ADDRESS}/jobs") is True


def test_a_name_resolving_to_a_private_address_is_refused(monkeypatch):
    monkeypatch.setattr(url_safety, "_resolve", lambda host: [PUBLIC_TEST_ADDRESS, PRIVATE_ADDRESS])
    assert is_public_http_url("https://intranet.example.com/") is False


def test_a_name_resolving_to_a_scoped_link_local_address_is_refused(monkeypatch):
    monkeypatch.setattr(url_safety, "_resolve", lambda host: ["fe80::1%eth0"])
    assert is_public_http_url("https://intranet.example.com/") is False


def test_a_name_resolving_to_nothing_is_refused(monkeypatch):
    monkeypatch.setattr(url_safety, "_resolve", lambda host: [])
    assert is_public_http_url("https://intranet.example.com/") is False


def test_an_unresolvable_name_is_refused(monkeypatch):
    def fail(host):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(url_safety, "_resolve", fail)
    assert is_public_http_url("https://nowhere.example.com/") is False


def test_ensure_raises_the_fixed_code_without_the_url():
    with pytest.raises(ValueError) as raised:
        ensure_public_http_url("http://127.0.0.1/admin")
    assert str(raised.value) == NOT_PUBLIC


def test_ensure_refuses_credentials_without_resolving():
    with pytest.raises(ValueError) as raised:
        ensure_public_http_url("http://user:pw@jobs.example.com/")
    assert str(raised.value) == NOT_PUBLIC


def test_ensure_leaves_host_names_to_the_endpoint_and_never_resolves(monkeypatch):
    def fail(host):
        raise AssertionError("a validator must not resolve DNS on the event loop")

    monkeypatch.setattr(url_safety, "_resolve", fail)
    assert ensure_public_http_url("https://intranet.example.com/") == "https://intranet.example.com/"


# Hosts the render browser (WHATWG URL + UTS #46) reads differently from urlsplit + getaddrinfo,
# or that it maps to loopback itself; all are refused by syntax, before any DNS lookup.
HOSTS_THE_BROWSER_READS_DIFFERENTLY = [
    "http://1.1.1.1%2elocalhost/",
    "http://93.184.216.34%2eevil.example/",
    "http://x%2e127.0.0.1.example/",
    "http://jobs%2eexample.com/",
    "http://jobs.example.com%00.evil.example/",
    "http://a.example\\b.example/",
    "http://ab\u00ad.example/",
    "http://jobs.exa mple.com/",
    "http://[fe80::1%25eth0]/",
    "http://localhost:8000/",
    "http://LocalHost./",
    "http://admin.localhost/",
    "http://\uff11\uff12\uff17\uff0e\uff10\uff0e\uff10\uff0e\uff11/",
    # The browser reads a host ending in a number as IPv4; getaddrinfo may send it to DNS instead.
    "http://127.0.0.1./",
    "http://0x7f.1./",
    "http://2130706433./",
    "http://0x/",
    "http://127.1/",
    "http://1.1.1.1./",
    "http://jobs.example.0x10/",
]

# (as typed, what is stored and fetched): exactly the host the render browser resolves.
CANONICAL_FORMS = [
    ("https://m\u00fcnchen.de/jobs?q=1#top", "https://xn--mnchen-3ya.de/jobs?q=1#top"),
    ("http://fa\u00df.example/", "http://xn--fa-hia.example/"),
    ("http://\u03c2.example/", "http://xn--3xa.example/"),
    ("http://jobs\uff0eexample\uff0ecom/x", "http://jobs.example.com/x"),
    ("HTTP://Jobs.Example.COM:8080/Path", "http://jobs.example.com:8080/Path"),
    ("http://xn--fa-hia.example/", "http://xn--fa-hia.example/"),
    ("http://jobs_board.example.com/", "http://jobs_board.example.com/"),
    ("http://123.example.com/", "http://123.example.com/"),
    ("http://example.123abc/", "http://example.123abc/"),
    ("http://[2606:2800:220:1::1]:8443/a", "http://[2606:2800:220:1::1]:8443/a"),
]


def _no_dns(host):
    raise AssertionError("refused by syntax: no DNS lookup expected")


@pytest.mark.parametrize("url", HOSTS_THE_BROWSER_READS_DIFFERENTLY)
def test_hosts_the_browser_reads_differently_are_refused_without_dns(monkeypatch, url):
    monkeypatch.setattr(url_safety, "_resolve", _no_dns)
    assert is_public_http_url(url) is False


@pytest.mark.parametrize("url", HOSTS_THE_BROWSER_READS_DIFFERENTLY)
def test_the_validator_refuses_hosts_the_browser_reads_differently(url):
    with pytest.raises(ValueError, match=f"^{NOT_PUBLIC}$"):
        ensure_public_http_url(url)


@pytest.mark.parametrize(("typed", "canonical"), CANONICAL_FORMS)
def test_urls_are_normalised_to_the_host_the_browser_resolves(typed, canonical):
    assert canonical_http_url(typed) == canonical
    assert ensure_public_http_url(typed) == canonical
    assert public_http_url(typed) == canonical


def test_the_guard_resolves_the_normalised_name(monkeypatch):
    looked_up = []
    monkeypatch.setattr(url_safety, "_resolve", lambda host: looked_up.append(host) or [PUBLIC_TEST_ADDRESS])
    assert is_public_http_url("http://Fa\u00df.Example/") is True
    assert looked_up == ["xn--fa-hia.example"]


def test_a_public_address_with_any_port_is_accepted():
    assert is_public_http_url(f"http://{PUBLIC_TEST_ADDRESS}:6379/") is True


@pytest.fixture()
def hanging_resolver(monkeypatch):
    """A resolver that never answers within the test; released at teardown so its thread ends."""
    released = threading.Event()

    def hang(host):
        released.wait(HANGING_RESOLVER_RELEASE_SECONDS)
        return [PUBLIC_TEST_ADDRESS]

    monkeypatch.setattr(url_safety, "_resolve", hang)
    yield
    released.set()


def test_a_slow_resolver_fails_closed_within_the_time_limit(monkeypatch, hanging_resolver):
    monkeypatch.setattr(url_safety, "DNS_TIMEOUT_SECONDS", SHORT_DNS_TIMEOUT_SECONDS)
    started = time.monotonic()
    assert is_public_http_url("https://slow.example.com/") is False
    assert time.monotonic() - started < SLOW_RESOLVER_WALL_LIMIT_SECONDS


def test_host_for_log_keeps_neither_path_nor_query():
    assert host_for_log("https://jobs.example.com/secret/path?token=abc#frag") == "jobs.example.com"


def test_lookups_work_in_a_forked_child_after_the_pool_reset():
    url_safety._resolver_pool.shutdown(wait=False)  # what a child inherits: a pool without live threads
    url_safety._reset_resolver_pool_after_fork()
    assert is_public_http_url("https://jobs.example.com/") is True
