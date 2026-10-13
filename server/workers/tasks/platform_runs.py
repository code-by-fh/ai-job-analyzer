"""Persist a summary of each finished crawl on its platform (job_platforms.last_run)."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from core.crawl_registry import release_crawl_lock
from core.logger import get_logger
from database.core import JobPlatform, PlatformRun, SessionLocal

logger = get_logger(__name__)

MILLISECONDS_PER_SECOND = 1000

# Fixed codes only: raw exception text and hostnames must never reach job_platforms.last_run.
ERROR_CANCELLED = "cancelled"
ERROR_UNREACHABLE = "unreachable"
ERROR_FAILED = "failed"
ERROR_CODES = (ERROR_CANCELLED, ERROR_UNREACHABLE, ERROR_FAILED)
RECORDED_FIELD = "platform_run_recorded"
RUN_HISTORY_LIMIT = 20


def _hash_int(job_hash: dict, field: str) -> int:
    # The crawl hash is read both by byte-mode and by decoded Redis clients.
    raw = job_hash.get(field.encode()) or job_hash.get(field)
    return int(raw) if raw else 0


def _started_at_iso(job_hash: dict) -> Optional[str]:
    started_ms = _hash_int(job_hash, "started_at")
    if not started_ms:
        return None
    return datetime.fromtimestamp(started_ms / MILLISECONDS_PER_SECOND, tz=timezone.utc).isoformat()


def build_last_run(job_hash: dict, finished_at: datetime, error: Optional[str]) -> dict:
    """Summarise a crawl hash as {started_at, finished_at, found, new, matched, seeded, error?}."""
    last_run = {
        "started_at": _started_at_iso(job_hash),
        "finished_at": finished_at.isoformat(),
        "found": _hash_int(job_hash, "total_found") or _hash_int(job_hash, "total"),
        "new": _hash_int(job_hash, "jobs_saved"),
        "matched": _hash_int(job_hash, "jobs_matched"),
        "seeded": _hash_int(job_hash, "is_initial_run") == 1,
    }
    if error:
        last_run["error"] = error if error in ERROR_CODES else ERROR_FAILED
    return last_run


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _run_row(platform_id: int, last_run: dict) -> PlatformRun:
    return PlatformRun(
        platform_id=platform_id,
        started_at=_parse_iso(last_run["started_at"]),
        finished_at=_parse_iso(last_run["finished_at"]),
        found=last_run["found"],
        new=last_run["new"],
        matched=last_run["matched"],
        seeded=last_run["seeded"],
        error=last_run.get("error"),
    )


def _prune_runs(db, platform_id: int) -> None:
    """Keep the newest RUN_HISTORY_LIMIT runs; the drawer shows 10 and nothing older is needed.

    One statement: a separate read of the ids to keep would let a run committed meanwhile be deleted.
    """
    newest = (
        select(PlatformRun.id)
        .where(PlatformRun.platform_id == platform_id)
        .order_by(PlatformRun.finished_at.desc(), PlatformRun.id.desc())
        .limit(RUN_HISTORY_LIMIT)
    )
    db.query(PlatformRun).filter(
        PlatformRun.platform_id == platform_id, PlatformRun.id.not_in(newest),
    ).delete(synchronize_session=False)


def _save_last_run(platform_id: int, user_id: int, last_run: dict) -> None:
    # The platform id on the crawl hash comes from the client, so it only counts for the crawl's owner.
    db = SessionLocal()
    try:
        platform = db.query(JobPlatform).filter(
            JobPlatform.id == platform_id, JobPlatform.user_id == user_id,
        ).first()
        if not platform:
            logger.warning(f"Crawl platform {platform_id} is unknown or not owned by user {user_id}; last run not stored")
            return
        platform.last_run = last_run
        db.add(_run_row(platform.id, last_run))
        db.flush()
        _prune_runs(db, platform.id)
        db.commit()
    finally:
        db.close()


def record_failed_run(platform_id: int, user_id: int) -> None:
    """Record a run that never started a crawl (e.g. a refused scheduled start) as failed."""
    last_run = build_last_run({}, datetime.now(timezone.utc), ERROR_FAILED)
    _save_last_run(platform_id, user_id, last_run)


def record_platform_run(redis_client, crawl_job_id: str, error: Optional[str] = None) -> None:
    """Store the finished crawl's summary (first call per crawl wins) and free its platform for the next crawl.

    Call before the crawl hash is deleted.

    error is one of the ERROR_* codes; any other value is stored as ERROR_FAILED.
    """
    try:
        job_hash = redis_client.hgetall(f"crawl_job:{crawl_job_id}")
        platform_id = _hash_int(job_hash, "platform_id")
        user_id = _hash_int(job_hash, "user_id")
        if platform_id:
            release_crawl_lock(redis_client, user_id, platform_id, crawl_job_id)
        # HSETNX makes the first terminal summary win over late sibling tasks.
        if platform_id and redis_client.hsetnx(f"crawl_job:{crawl_job_id}", RECORDED_FIELD, 1):
            last_run = build_last_run(job_hash, datetime.now(timezone.utc), error)
            _save_last_run(platform_id, user_id, last_run)
    except Exception as exc:
        # Broad on purpose: the summary is bookkeeping and must never break crawl completion.
        logger.error(f"Could not record last run for crawl {crawl_job_id}: {exc}", exc_info=True)
