"""Every bound of the API in one place, so the schemas, the middleware and the docs agree."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Rate:
    """At most ``limit`` calls per ``window_seconds`` for one key."""

    limit: int
    window_seconds: float


MAX_BODY_BYTES = 1024 * 1024
TEST_SEND_RATE = Rate(limit=5, window_seconds=60.0)
# Per app across all owners, so a caller cannot dodge the per-owner limit with new owner strings.
APP_TEST_SEND_RATE = Rate(limit=20, window_seconds=60.0)
NOTIFICATION_RATE = Rate(limit=120, window_seconds=60.0)

OWNER_MAX_LENGTH = 128
OWNER_PATTERN = r"^[A-Za-z0-9._:@-]+$"
CHANNEL_NAME_MAX_LENGTH = 100
MAX_FIELDS_PER_CHANNEL = 16
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

MAX_CHANNELS_PER_NOTIFICATION = 20
MAX_RECIPIENTS = 50
EMAIL_MAX_LENGTH = 254
SUBJECT_MAX_LENGTH = 250
BODY_MAX_LENGTH = 10_000
TEMPLATE_HTML_MAX_LENGTH = 100_000
PUSH_TEMPLATE_MAX_LENGTH = 2_000
MAX_JOBS_PER_DIGEST = 100
USER_NAME_MAX_LENGTH = 100
PLATFORM_NAME_MAX_LENGTH = 200
JOB_TEXT_MAX_LENGTH = 300
JOB_REASONING_MAX_LENGTH = 5_000
JOB_URL_MAX_LENGTH = 2_048
