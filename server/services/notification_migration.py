"""One-off, idempotent copy of the old per-user credentials into the notification service.

For every profile whose ``notification_channels_migrated`` is still false:

1. each type with complete old credentials becomes a service channel, unless the user already has a
   channel of that type (a run that stopped half-way is resumed, not duplicated);
2. each of the user's sources without ``notification_channels`` gets the channels of its old
   ``notification_adapters``;
3. the flag is set, so a channel the user deletes later is never re-created from the old columns.

An unreachable service stops the run and leaves the flag unset (the next start retries). A channel the
service refuses (for example an SMTP host that no longer resolves to a public address) is skipped for
good and logged with its type and field names only. The old columns are only read.
"""

import time
from typing import Callable, Dict, List

from sqlalchemy.orm import Session

from core.logger import get_logger
from database.core import JobPlatform, UserProfile
from services import notifications_client
from services.notification_channels import (
    CHANNEL_TYPES,
    LEGACY_FIELDS,
    LEGACY_REQUIRED,
    first_by_type,
    legacy_type,
    new_channel,
)
from services.notifications_client import UNAVAILABLE, VALIDATION_ERROR, NotifyError, owner_for

logger = get_logger(__name__)

STARTUP_ATTEMPTS = 5
STARTUP_RETRY_SECONDS = 10


def _legacy_values(profile: UserProfile, channel_type: str) -> Dict[str, object]:
    return {name: getattr(profile, name) for name in LEGACY_FIELDS[channel_type]}


def _create(client, owner: str, profile: UserProfile, channel_type: str) -> Dict[str, str]:
    body = new_channel(channel_type, _legacy_values(profile, channel_type), profile.email_global_recipient)
    try:
        return client.create_channel(owner, body)
    except NotifyError as error:
        if error.code != VALIDATION_ERROR:
            raise
        refused = sorted({path for path, _message in error.fields})
        logger.warning("Old %s channel not migrated: the service refused %s", channel_type, refused)
        return {}


def _migrate_channels(client, owner: str, profile: UserProfile) -> Dict[str, Dict[str, str]]:
    """The user's channel per type after creating the missing ones from complete old credentials."""
    by_type = first_by_type(client.list_channels(owner))
    for channel_type in CHANNEL_TYPES:
        complete = all(getattr(profile, name) for name in LEGACY_REQUIRED[channel_type])
        if complete and channel_type not in by_type:
            created = _create(client, owner, profile, channel_type)
            if created:
                by_type[channel_type] = created
    return by_type


def selection_for(adapters, by_type: Dict[str, Dict[str, str]]) -> List[Dict[str, str]]:
    """The ``notification_channels`` entries of old switch names, in their order, without repeats."""
    types = dict.fromkeys(filter(None, (legacy_type(adapter) for adapter in adapters or [])))
    return [{"id": by_type[name]["id"], "type": name} for name in types if name in by_type]


def migrate_profile(db: Session, client, profile: UserProfile) -> None:
    """Migrate one user's channels and source switches, then flag the profile; the caller commits."""
    owner = owner_for(profile.user_id)
    by_type = _migrate_channels(client, owner, profile)
    sources = db.query(JobPlatform).filter(
        JobPlatform.user_id == profile.user_id, JobPlatform.notification_channels.is_(None)
    )
    for source in sources:
        source.notification_channels = selection_for(source.notification_adapters, by_type)
    profile.notification_channels_migrated = True


def migrate_all(session_factory: Callable[[], Session], client) -> int:
    """Migrate every profile still unflagged, committing each; returns how many were migrated."""
    migrated = 0
    with session_factory() as db:
        pending = db.query(UserProfile).filter(
            UserProfile.user_id.isnot(None), UserProfile.notification_channels_migrated.is_(False)
        )
        for profile in pending.all():
            migrate_profile(db, client, profile)
            db.commit()
            migrated += 1
    return migrated


def run_at_startup(session_factory: Callable[[], Session], sleep=time.sleep) -> None:
    """Migrate in the background of the API start; retries while the service is still starting."""
    for attempt in range(1, STARTUP_ATTEMPTS + 1):
        try:
            migrated = migrate_all(session_factory, notifications_client.get_client())
            logger.info("Notification channel migration: %d profile(s) migrated", migrated)
            return
        except NotifyError as error:
            if error.code != UNAVAILABLE or attempt == STARTUP_ATTEMPTS:
                logger.error("Notification channel migration stopped (%s); the next start retries", error.code)
                return
            sleep(STARTUP_RETRY_SECONDS)
        except Exception:
            # The thread's last stop: anything else (a database error) is logged with its stack, not lost.
            logger.exception("Notification channel migration failed; the next start retries")
            return
