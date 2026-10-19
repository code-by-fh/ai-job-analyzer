"""Shared bounds of the AI runs that happen inside a request (CV import, deep dive).

Each such run holds a threadpool thread for up to SYNC_AI_RUN_LIMIT_SECONDS, so the API process lets
only MAX_PARALLEL_SYNC_AI_RUNS run at once, across all users: a full house answers 503 `ai_busy` at
once instead of queueing, and before any run state is written.
"""

import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator

from fastapi import HTTPException, status

from workers.tasks.time_limits import GENERATION_SWEEP_MARGIN_SECONDS, SYNC_AI_RUN_LIMIT_SECONDS

# Starlette's threadpool has 40 threads; 4 long AI calls leave the rest for every other sync endpoint.
MAX_PARALLEL_SYNC_AI_RUNS = 4
AI_BUSY = "ai_busy"
_sync_ai_slots = threading.BoundedSemaphore(MAX_PARALLEL_SYNC_AI_RUNS)


@contextmanager
def sync_ai_slot() -> Iterator[None]:
    """Hold one slot for the run; raises 503 `ai_busy` without waiting when none is free."""
    if not _sync_ai_slots.acquire(blocking=False):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=AI_BUSY)
    try:
        yield
    finally:
        _sync_ai_slots.release()


def stale_before() -> datetime:
    """A run stamped before this instant lost its request (the sweep's cutoff): a new start may replace it."""
    return datetime.now(timezone.utc) - timedelta(seconds=SYNC_AI_RUN_LIMIT_SECONDS + GENERATION_SWEEP_MARGIN_SECONDS)
