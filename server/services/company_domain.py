"""One definition of a valid company domain, shared by the API boundary and the analyze tasks."""

import re
from typing import Annotated, Optional
from urllib.parse import urlparse

from pydantic import AfterValidator

MAX_DOMAIN_LENGTH = 253
MAX_LABEL_LENGTH = 63
MIN_LABEL_COUNT = 2
WWW_PREFIX = "www."
_LABEL_PATTERN = re.compile(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?")
_INVALID_DOMAIN_MESSAGE = "must be a lowercase hostname such as example.com (IDN as punycode)"


def validate_company_domain(value: str) -> str:
    """Return *value* when it is a normalised hostname, else raise ValueError.

    Rejects ports, userinfo, paths, IP addresses (also the inet_aton forms such as 0x7f.0x1, hence the
    top-level label must start with a letter) and single-label names such as localhost.
    """
    labels = value.split(".")
    if (
        len(value) > MAX_DOMAIN_LENGTH
        or len(labels) < MIN_LABEL_COUNT
        or not all(_is_valid_label(label) for label in labels)
        or not labels[-1][0].isalpha()
    ):
        raise ValueError(_INVALID_DOMAIN_MESSAGE)
    return value


def _is_valid_label(label: str) -> bool:
    return len(label) <= MAX_LABEL_LENGTH and _LABEL_PATTERN.fullmatch(label) is not None


CompanyDomain = Annotated[str, AfterValidator(validate_company_domain)]


def normalised_host(url: Optional[str]) -> Optional[str]:
    """Lowercase host of *url* without www. and port, as punycode; None when it is not a valid domain."""
    try:
        host = urlparse(url or "").hostname
        if not host:
            return None
        return validate_company_domain(host.removeprefix(WWW_PREFIX).encode("idna").decode("ascii"))
    except ValueError:
        return None
