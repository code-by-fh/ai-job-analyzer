"""Whether a user-supplied host (the SMTP server) may be connected to (SSRF guard).

Adapted from the job agent's ``server/core/url_safety.py`` (copied, the service imports nothing from the
server): every address a name resolves to must be public, because the connection may use any of them.
One private, loopback, link-local or metadata record is enough to refuse. The caller connects to the
address returned here (pinning), so a second, rebinding DNS answer is never used.

Only plain ASCII host names and literal addresses are accepted; an internationalised name must be
entered in its punycode (``xn--``) form.
"""

import ipaddress
import re
import socket
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as ResolveTimeout
from typing import List, Optional, Union

# Upper bound for one lookup; a slower answer counts as refused (fail closed).
DNS_TIMEOUT_SECONDS = 3.0
HOST_MAX_LENGTH = 253

IPAddress = Union[ipaddress.IPv4Address, ipaddress.IPv6Address]

_IPV4_BITS = 0xFFFFFFFF
# Prefixes whose last 32 bits carry an IPv4 address the packet may reach in the end; is_global alone
# calls ::7f00:1 and 64:ff9b::a9fe:a9fe global.
_IPV4_IN_LOW_BITS = (
    ipaddress.ip_network("::/96"),
    ipaddress.ip_network("64:ff9b::/96"),
)
_HOST_NAME = re.compile(r"[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?")
# A host whose last label is a number is read as IPv4 by some resolvers (127.1, 0x7f.1).
_NUMERIC_LABEL = re.compile(r"0x[0-9a-f]*|[0-9]+")
_LOOPBACK_NAME = "localhost"
_LOOPBACK_SUFFIX = ".localhost"
_RESOLVER_THREADS = 4

# Lookups run here so a caller never waits longer than DNS_TIMEOUT_SECONDS, even if getaddrinfo hangs.
_resolver_pool = ThreadPoolExecutor(max_workers=_RESOLVER_THREADS, thread_name_prefix="notify-dns")


def _resolve(host: str, port: int) -> List[str]:
    """Every address of a host name; the only DNS call, patched in tests."""
    return [info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)]


def _literal_address(host: str) -> Optional[IPAddress]:
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
    # Multicast and IPv6 site-local count as "global" for ipaddress; reserved covers the rest of ::/8.
    if target.is_multicast or target.is_reserved or getattr(target, "is_site_local", False):
        return False
    return target.is_global


def _is_public_address(address: str) -> bool:
    ip = _literal_address(address)
    return ip is not None and _is_public_ip(ip)


def _is_plain_name(host: str) -> bool:
    if not _HOST_NAME.fullmatch(host):
        return False
    labels = host.rstrip(".").split(".")
    name = host.rstrip(".")
    is_loopback = name == _LOOPBACK_NAME or name.endswith(_LOOPBACK_SUFFIX)
    return not is_loopback and _NUMERIC_LABEL.fullmatch(labels[-1]) is None


def is_valid_host(host: str) -> bool:
    """True for a literal IP address or a plain ASCII host name that is not a loopback name. Syntax only."""
    if not host or len(host) > HOST_MAX_LENGTH or not host.isascii():
        return False
    if any(unicodedata.category(char).startswith(("C", "Z")) for char in host):
        return False
    lowered = host.lower()
    return _literal_address(lowered) is not None or _is_plain_name(lowered)


def _addresses_of(host: str, port: int) -> List[str]:
    if _literal_address(host) is not None:
        return [host]
    lookup = _resolver_pool.submit(_resolve, host, port)
    try:
        return lookup.result(timeout=DNS_TIMEOUT_SECONDS)
    finally:
        lookup.cancel()


def public_address(host: str, port: int) -> Optional[str]:
    """The first address of *host* when every address is public, else None (also for a failed lookup).

    Blocks for at most DNS_TIMEOUT_SECONDS: call it from a sync route or a worker thread.
    """
    if not is_valid_host(host):
        return None
    try:
        addresses = _addresses_of(host.lower(), port)
    except (OSError, UnicodeError, ResolveTimeout):
        return None
    if addresses and all(_is_public_address(address) for address in addresses):
        return addresses[0]
    return None
