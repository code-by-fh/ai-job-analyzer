"""Validation of a platform's editable fields, shared by PATCH /platforms/{id} and POST /platforms/setup.

Every refusal is a fixed code: it becomes the 422 message, which the web maps by field, never shows.
"""

import re
from typing import List, Optional
from urllib.parse import urlparse

SCHEDULE_TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
# 0 = Monday, as workers/tasks/scheduling.py compares with datetime.weekday().
WEEKDAYS = range(7)
MAX_NAME_LENGTH = 100
MAX_PATTERN_LENGTH = 300

MAX_SCHEDULE_TIMES = 6

INVALID_SCHEDULE_TIMES = "invalid_schedule_times"
INVALID_SCHEDULE_DAYS = "invalid_schedule_days"
SCHEDULE_INCOMPLETE = "schedule_incomplete"
INVALID_NAME = "invalid_name"
INVALID_URL_PATTERN = "invalid_url_pattern"


def check_schedule_times(value: Optional[List[str]]) -> Optional[List[str]]:
    """The times sorted, or ValueError(INVALID_SCHEDULE_TIMES) unless 1-MAX_SCHEDULE_TIMES unique HH:MM values."""
    if value is None:
        return None
    if (
        not 1 <= len(value) <= MAX_SCHEDULE_TIMES
        or len(set(value)) != len(value)
        # fullmatch: "$" would also accept a trailing newline.
        or not all(SCHEDULE_TIME.fullmatch(time) for time in value)
    ):
        raise ValueError(INVALID_SCHEDULE_TIMES)
    return sorted(value)


def check_schedule_days(value: Optional[List[int]]) -> Optional[List[int]]:
    """The days sorted, or ValueError(INVALID_SCHEDULE_DAYS) when empty, duplicated or outside 0-6."""
    if value is None:
        return None
    if not value or len(set(value)) != len(value) or any(day not in WEEKDAYS for day in value):
        raise ValueError(INVALID_SCHEDULE_DAYS)
    return sorted(value)


def check_name(value: Optional[str]) -> Optional[str]:
    """The trimmed name, or ValueError(INVALID_NAME) when blank or longer than MAX_NAME_LENGTH."""
    if value is None:
        return None
    name = value.strip()
    if not name or len(name) > MAX_NAME_LENGTH:
        raise ValueError(INVALID_NAME)
    return name


def check_url_pattern(value: Optional[str]) -> Optional[str]:
    """The trimmed pattern, or ValueError(INVALID_URL_PATTERN) when only slashes or too long."""
    if value is None:
        return None
    pattern = value.strip()
    # "/" alone would match every link of the site.
    if not pattern.strip("/") or len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(INVALID_URL_PATTERN)
    return pattern


def incomplete_schedule_field(times: Optional[List[str]], days: Optional[List[int]]) -> Optional[str]:
    """The missing half of a schedule, or None. Times without days (or the reverse) never run."""
    if (times is None) == (days is None):
        return None
    return "schedule_times" if times is None else "schedule_days"


def url_matches_pattern(url: str, pattern: str) -> bool:
    """The crawl filter's one test. A pattern starting with "/" is the start of the posting address
    after the domain (path plus query), so the link must begin with it; any other (older) pattern
    is a plain substring of the whole URL."""
    if not pattern.startswith("/"):
        return pattern in url
    parsed = urlparse(url)
    return (parsed.path + (f"?{parsed.query}" if parsed.query else "")).startswith(pattern)
