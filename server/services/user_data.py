"""Deleting what a user owns, children before parents, so no foreign key is violated (tracker R-17).

Covers every table that references `users`, `jobs` or `job_platforms`. Files in the legacy upload
directory are not touched.
"""

from sqlalchemy.orm import Session

from database.core import (
    CompanyDeepDive, DocumentTemplate, JobDocument, JobEntry, JobPlatform, JobStatusHistory, NotificationTemplate,
    PlatformRun, ProfileDocument, User, UserProfile,
)
from core.logger import get_logger
from services import notifications_client
from services.notifications_client import NotifyError, owner_for

logger = get_logger(__name__)


def delete_job_rows(db: Session, job_ids) -> int:
    """Jobs with their history and documents, children first; the caller commits.

    `job_ids` is a list of ids or a scalar subquery selecting them. Returns the number of jobs deleted.
    """
    db.query(JobStatusHistory).filter(JobStatusHistory.job_id.in_(job_ids)).delete(synchronize_session=False)
    db.query(JobDocument).filter(JobDocument.job_id.in_(job_ids)).delete(synchronize_session=False)
    return db.query(JobEntry).filter(JobEntry.id.in_(job_ids)).delete(synchronize_session=False)


def delete_owned_jobs(db: Session, user_id: int) -> int:
    """The user's jobs with their history and documents; the caller commits. Returns the jobs deleted."""
    db.query(JobDocument).filter(JobDocument.user_id == user_id).delete(synchronize_session=False)
    return delete_job_rows(db, db.query(JobEntry.id).filter(JobEntry.user_id == user_id).scalar_subquery())


def delete_owned_platforms(db: Session, user_id: int) -> int:
    """The user's sources with their runs, other accounts' jobs on them detached; the caller commits."""
    platform_ids = db.query(JobPlatform.id).filter(JobPlatform.user_id == user_id).scalar_subquery()
    # /scraper/search accepts any platform_id, so another account's job may point here (see
    # routers/platforms.py::_detach_jobs); it keeps the job and loses the source.
    db.query(JobEntry).filter(JobEntry.platform_id.in_(platform_ids)).update(
        {JobEntry.platform_id: None}, synchronize_session=False
    )
    # The FK cascades on PostgreSQL, but SQLite only with PRAGMA foreign_keys, so the runs go explicitly.
    db.query(PlatformRun).filter(PlatformRun.platform_id.in_(platform_ids)).delete(synchronize_session=False)
    return db.query(JobPlatform).filter(JobPlatform.user_id == user_id).delete(synchronize_session=False)


def _delete_owned_files(db: Session, user_id: int) -> None:
    for model in (ProfileDocument, DocumentTemplate, NotificationTemplate):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)


def delete_notification_channels(user_id: int) -> None:
    """Delete the user's channels in the notification service; raises NotifyError when it fails."""
    notifications_client.get_client().delete_owner_channels(owner_for(user_id))


def delete_notification_channels_best_effort(user_ids) -> None:
    """After a committed wipe: delete each user's channels, logging a failure by user id only.

    A channel left behind is harmless until its user id is reused (follow-up in the progress tracker).
    """
    for user_id in user_ids:
        try:
            delete_notification_channels(user_id)
        except NotifyError as error:
            logger.error("Notification channels of user %s not deleted after the wipe (%s)", user_id, error.code)


def delete_user_content(db: Session, user_id: int) -> dict:
    """Everything the user owns in the database except the account; the caller commits.

    The user's notification channels live in the notification service: the caller removes them with
    :func:`delete_notification_channels` (before, for one account) or
    :func:`delete_notification_channels_best_effort` (after the commit, for a wipe of all accounts).

    Returns the counts `jobs_deleted` and `platforms_deleted` and whether a profile row (notification
    credentials, language, time zone) was deleted as `profile_deleted`.
    """
    jobs_deleted = delete_owned_jobs(db, user_id)
    platforms_deleted = delete_owned_platforms(db, user_id)
    _delete_owned_files(db, user_id)
    db.query(CompanyDeepDive).filter(CompanyDeepDive.user_id == user_id).delete(synchronize_session=False)
    profile_deleted = db.query(UserProfile).filter(UserProfile.user_id == user_id).delete(synchronize_session=False) > 0
    return {"jobs_deleted": jobs_deleted, "platforms_deleted": platforms_deleted, "profile_deleted": profile_deleted}


def delete_user(db: Session, user_id: int) -> None:
    """The account and everything it owns; the caller commits.

    Status changes the user made on other accounts' jobs stay in their history, without the author.
    The notification channels go first: an unreachable service raises NotifyError before any row is
    touched, so no channel outlives its account.
    """
    delete_notification_channels(user_id)
    delete_user_content(db, user_id)
    db.query(JobStatusHistory).filter(JobStatusHistory.changed_by == user_id).update(
        {"changed_by": None}, synchronize_session=False
    )
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
