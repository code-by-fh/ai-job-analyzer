"""In-process fixed-window rate limiter (the service runs as one process, see README)."""

import math
import threading
from typing import Callable, Dict, Optional, Tuple

from app.limits import Rate

# Expired windows are dropped once this many keys are tracked, so owner keys cannot grow memory unbounded.
_PRUNE_THRESHOLD = 10_000


class RateLimiter:
    """Grants at most ``limit`` calls per key in each window of ``window_seconds``."""

    def __init__(self, limit: int, window_seconds: float, clock: Callable[[], float]) -> None:
        self._limit = limit
        self._window = window_seconds
        self._clock = clock
        self._windows: Dict[str, Tuple[float, int]] = {}
        self._lock = threading.Lock()

    @classmethod
    def for_rate(cls, rate: Rate, clock: Callable[[], float]) -> "RateLimiter":
        return cls(rate.limit, rate.window_seconds, clock)

    def acquire(self, key: str) -> Optional[int]:
        """None when the call is granted, else the whole seconds until the key's window ends."""
        now = self._clock()
        with self._lock:
            if len(self._windows) >= _PRUNE_THRESHOLD:
                self._prune(now)
            started, count = self._windows.get(key, (now, 0))
            if now - started >= self._window:
                started, count = now, 0
            if count >= self._limit:
                return max(1, math.ceil(started + self._window - now))
            self._windows[key] = (started, count + 1)
            return None

    def _prune(self, now: float) -> None:
        self._windows = {key: entry for key, entry in self._windows.items() if now - entry[0] < self._window}
