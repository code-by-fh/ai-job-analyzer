"""Whether a user-supplied URL may be fetched by the crawler (SSRF guard).

The URL is first normalised once, the way the render browser (WHATWG URL + UTS #46 IDNA) reads it:
a host the two parsers could read differently is refused, a Unicode name becomes its A-label, and the
URL is rebuilt around that host. Callers store and forward only that canonical URL, so the name
checked here is exactly the name the browser resolves.

Two layers use it:
- Request validators call ``ensure_public_http_url``. It normalises and checks literal IP addresses
  only, because pydantic validates on the event loop and a slow resolver there would stall the API.
- Endpoints (in a worker thread) and the scraper worker, right before the render call, call
  ``public_http_url`` / ``is_public_http_url``. They also resolve the name, within a hard time limit,
  and every resolved address must be public: one private record is enough to refuse, because the
  fetch may use any of them.

Any port is accepted on a public host: only public addresses are reachable, so a port reaches no
internal service.

Known residuals (not closable here): the render service follows redirects and resolves the name again
itself (DNS rebinding), and page JavaScript in the render browser can request internal hosts.
"""

import ipaddress
import os
import re
import socket
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as ResolveTimeout
from typing import List, Optional, Union
from urllib.parse import SplitResult, urlsplit, urlunsplit

import idna

ALLOWED_SCHEMES = ("http", "https")
NOT_PUBLIC = "url_not_public"
# Upper bound for one lookup; a slower answer counts as refused (fail closed). Callers that wait on a
# service which runs this check (the API's crawl start) must wait longer than this.
DNS_TIMEOUT_SECONDS = 3.0

IPAddress = Union[ipaddress.IPv4Address, ipaddress.IPv6Address]

_IPV4_BITS = 0xFFFFFFFF
# Prefixes whose last 32 bits carry an IPv4 address that the packet may reach in the end. is_global
# alone is not enough here: it calls ::7f00:1 and 64:ff9b::a9fe:a9fe global, and the flags differ
# between Python patch levels (production runs 3.11).
_IPV4_IN_LOW_BITS = (
    ipaddress.ip_network("::/96"),  # IPv4-compatible (deprecated, still routed by some stacks)
    ipaddress.ip_network("64:ff9b::/96"),  # NAT64 well-known prefix
)
# The browser percent-decodes the host and reads "\" as "/", so the guard would check another name.
_AMBIGUOUS_HOST_CHARACTERS = frozenset("%\\")
# Unicode categories of control, format (e.g. soft hyphen), unassigned and separator characters.
_INVISIBLE_CATEGORY_PREFIXES = ("C", "Z")
_HOST_NAME = re.compile(r"[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?")
# WHATWG "ends in a number": the browser parses such a host as IPv4 (127.1, 0x7f.1., 0x), while
# getaddrinfo may send it to DNS, where a rewriting resolver could answer a public address.
_NUMERIC_LABEL = re.compile(r"0x[0-9a-f]*|[0-9]+")
# Chromium answers these from loopback itself, without asking DNS.
_LOOPBACK_NAME = "localhost"
_LOOPBACK_SUFFIX = ".localhost"
_RESOLVER_THREADS = 8
_RESOLVER_THREAD_PREFIX = "url-safety-dns"


def _new_resolver_pool() -> ThreadPoolExecutor:
    return ThreadPoolExecutor(max_workers=_RESOLVER_THREADS, thread_name_prefix=_RESOLVER_THREAD_PREFIX)


# Lookups run here so a caller never waits longer than DNS_TIMEOUT_SECONDS, even if getaddrinfo hangs.
_resolver_pool = _new_resolver_pool()


def _reset_resolver_pool_after_fork() -> None:
    """A forked child inherits the pool without its threads, so every lookup would time out there."""
    global _resolver_pool
    _resolver_pool = _new_resolver_pool()


os.register_at_fork(after_in_child=_reset_resolver_pool_after_fork)


def _resolve(host: str) -> List[str]:
    """Every address of a host name; the only DNS call, patched in tests."""
    return [info[4][0] for info in socket.getaddrinfo(host, None)]


def _literal_address(host: str) -> Optional[IPAddress]:
    """The host as an IP address when it is written as one, else None (an IPv6 %scope still parses)."""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def _embedded_ipv4(ip: IPAddress) -> Optional[ipaddress.IPv4Address]:
    """The IPv4 address an IPv6 transition form delivers to, or None."""
    if ip.version != 6:
        return None
    if ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    if ip.sixtofour is not None:
        return ip.sixtofour
    if any(ip in network for network in _IPV4_IN_LOW_BITS):
        return ipaddress.IPv4Address(int(ip) & _IPV4_BITS)
    return None


def _is_public_ip(ip: IPAddress) -> bool:
    target = _embedded_ipv4(ip) or ip
    # Multicast and IPv6 site-local count as "global" for ipaddress, but no job page lives there;
    # reserved covers the rest of ::/8 (e.g. local-use NAT64 64:ff9b:1::/48) on every Python version.
    if target.is_multicast or target.is_reserved or getattr(target, "is_site_local", False):
        return False
    return target.is_global


def _is_public_address(address: str) -> bool:
    ip = _literal_address(address)
    return ip is not None and _is_public_ip(ip)


def _has_ambiguous_characters(host: str) -> bool:
    return any(
        char in _AMBIGUOUS_HOST_CHARACTERS or unicodedata.category(char).startswith(_INVISIBLE_CATEGORY_PREFIXES)
        for char in host
    )


def _is_loopback_name(host: str) -> bool:
    name = host.rstrip(".")
    return name == _LOOPBACK_NAME or name.endswith(_LOOPBACK_SUFFIX)


def _ends_in_number(host: str) -> bool:
    labels = host.split(".")
    if len(labels) > 1 and labels[-1] == "":
        labels.pop()
    return _NUMERIC_LABEL.fullmatch(labels[-1]) is not None


def _ascii_host(host: str) -> Optional[str]:
    """The host as the browser resolves it (lowercase; Unicode via UTS #46 non-transitional), or None."""
    if host.isascii():
        return host.lower()
    try:
        return idna.encode(host, uts46=True, transitional=False).decode("ascii")
    except idna.IDNAError:
        return None


def _canonical_host(host: str) -> Optional[str]:
    """A literal IP or a plain LDH name that no parser reads differently, or None."""
    if _has_ambiguous_characters(host):
        return None
    ascii_host = _ascii_host(host)
    if ascii_host is None:
        return None
    if _literal_address(ascii_host) is not None:
        return ascii_host
    if not _HOST_NAME.fullmatch(ascii_host) or _ends_in_number(ascii_host) or _is_loopback_name(ascii_host):
        return None
    return ascii_host


def _http_parts(url: str) -> Optional[SplitResult]:
    """The parts of an http(s) URL with a valid port and no userinfo, or None."""
    try:
        parts = urlsplit(url)
        _ = parts.port  # a malformed or out-of-range port raises ValueError
    except ValueError:
        return None
    if parts.scheme not in ALLOWED_SCHEMES or parts.username is not None or parts.password is not None:
        return None
    return parts if parts.hostname else None


def _netloc(host: str, port: Optional[int]) -> str:
    bracketed = f"[{host}]" if ":" in host else host
    return bracketed if port is None else f"{bracketed}:{port}"


def canonical_http_url(url: str) -> Optional[str]:
    """The URL rebuilt around the host the render browser resolves, or None when it is refused.

    Syntax only, no DNS. Store and forward this form, never the URL as typed.
    """
    parts = _http_parts(url)
    host = _canonical_host(parts.hostname) if parts else None
    if host is None:
        return None
    return urlunsplit(parts._replace(netloc=_netloc(host, parts.port)))


def _addresses_of(host: str) -> List[str]:
    if _literal_address(host) is not None:
        return [host]
    lookup = _resolver_pool.submit(_resolve, host)
    try:
        return lookup.result(timeout=DNS_TIMEOUT_SECONDS)
    finally:
        lookup.cancel()


def public_http_url(url: str) -> Optional[str]:
    """The canonical URL when every address of its host is public, else None.

    Resolves DNS (blocking, at most DNS_TIMEOUT_SECONDS): call it from a sync endpoint, a worker
    thread or a Celery task.
    """
    canonical = canonical_http_url(url)
    if canonical is None:
        return None
    try:
        addresses = _addresses_of(urlsplit(canonical).hostname)
    except (OSError, UnicodeError, ResolveTimeout):
        return None
    if addresses and all(_is_public_address(address) for address in addresses):
        return canonical
    return None


def is_public_http_url(url: str) -> bool:
    """True only for an http(s) URL whose host resolves to public addresses only (see public_http_url)."""
    return public_http_url(url) is not None


def ensure_public_http_url(url: str) -> str:
    """Pydantic validator body: the canonical URL; syntax and literal addresses only, never DNS.

    Raises ValueError(NOT_PUBLIC); the fixed code becomes the 422 message, never the URL itself.
    Host names pass here and must still be checked with ``is_public_http_url`` before any fetch.
    """
    canonical = canonical_http_url(url)
    literal = _literal_address(urlsplit(canonical).hostname) if canonical else None
    if canonical is None or (literal is not None and not _is_public_ip(literal)):
        raise ValueError(NOT_PUBLIC)
    return canonical


def host_for_log(url: str) -> str:
    """Only the host of a URL, for logs: paths and queries may carry tokens."""
    try:
        return urlsplit(url).hostname or "<no host>"
    except ValueError:
        return "<invalid url>"
