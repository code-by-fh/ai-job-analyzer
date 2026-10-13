"""Deleting what a user owns, children before parents, so no foreign key is violated (tracker R-17).

Covers every table that references `users`, `jobs` or `job_platforms`. Files stored in Google Drive or
in the legacy upload directory are not touched.
"""

from sqlalchemy.orm import Session

from database.core import (
    DocumentTemplate, JobDocument, JobEntry, JobPlatform, JobStatusHistory, NotificationTemplate,
    PlatformRun, ProfileDocument, User, UserProfile,
)


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


def delete_user_content(db: Session, user_id: int) -> dict:
    """Everything the user owns except the account; the caller commits.

    Returns the counts `jobs_deleted` and `platforms_deleted` and whether a profile row (notification
    credentials, Drive connection, language, time zone) was deleted as `profile_deleted`.
    """
    jobs_deleted = delete_owned_jobs(db, user_id)
    platforms_deleted = delete_owned_platforms(db, user_id)
    _delete_owned_files(db, user_id)
    profile_deleted = db.query(UserProfile).filter(UserProfile.user_id == user_id).delete(synchronize_session=False) > 0
    return {"jobs_deleted": jobs_deleted, "platforms_deleted": platforms_deleted, "profile_deleted": profile_deleted}


def delete_user(db: Session, user_id: int) -> None:
    """The account and everything it owns; the caller commits.

    Status changes the user made on other accounts' jobs stay in their history, without the author.
    """
    delete_user_content(db, user_id)
    db.query(JobStatusHistory).filter(JobStatusHistory.changed_by == user_id).update(
        {"changed_by": None}, synchronize_session=False
    )
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
