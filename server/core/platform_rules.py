"""Validation of a platform's editable fields, shared by PATCH /platforms/{id} and POST /platforms/setup.

Every refusal is a fixed code: it becomes the 422 message, which the web maps by field, never shows.
"""

import re
from typing import List, Optional

SCHEDULE_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# 0 = Monday, as workers/tasks/scheduling.py compares with datetime.weekday().
WEEKDAYS = range(7)
MAX_NAME_LENGTH = 100
MAX_PATTERN_LENGTH = 300

INVALID_SCHEDULE_TIME = "invalid_schedule_time"
INVALID_SCHEDULE_DAYS = "invalid_schedule_days"
SCHEDULE_INCOMPLETE = "schedule_incomplete"
INVALID_NAME = "invalid_name"
INVALID_URL_PATTERN = "invalid_url_pattern"


def check_schedule_time(value: Optional[str]) -> Optional[str]:
    """The time as sent, or ValueError(INVALID_SCHEDULE_TIME) unless it is HH:MM between 00:00 and 23:59."""
    if value is not None and not SCHEDULE_TIME.match(value):
        raise ValueError(INVALID_SCHEDULE_TIME)
    return value


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


def incomplete_schedule_field(time: Optional[str], days: Optional[List[int]]) -> Optional[str]:
    """The missing half of a schedule, or None. A time without days (or the reverse) never runs."""
    if (time is None) == (days is None):
        return None
    return "schedule_time" if time is None else "schedule_days"
