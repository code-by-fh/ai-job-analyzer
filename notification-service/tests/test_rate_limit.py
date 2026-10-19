"""The fixed-window limiter counts per key and frees a key when its window ends."""

from app.rate_limit import RateLimiter
from tests.conftest import FakeClock

LIMIT = 2
WINDOW_SECONDS = 60.0


def _limiter(clock: FakeClock) -> RateLimiter:
    return RateLimiter(LIMIT, WINDOW_SECONDS, clock)


def test_calls_within_the_limit_are_granted():
    limiter = _limiter(FakeClock())
    assert [limiter.acquire("a"), limiter.acquire("a")] == [None, None]


def test_a_call_over_the_limit_names_the_seconds_to_wait():
    clock = FakeClock()
    limiter = _limiter(clock)
    limiter.acquire("a")
    limiter.acquire("a")
    clock.advance(20)
    assert limiter.acquire("a") == 40


def test_keys_are_counted_apart():
    limiter = _limiter(FakeClock())
    limiter.acquire("a")
    limiter.acquire("a")
    assert limiter.acquire("b") is None


def test_a_new_window_grants_again():
    clock = FakeClock()
    limiter = _limiter(clock)
    limiter.acquire("a")
    limiter.acquire("a")
    clock.advance(WINDOW_SECONDS)
    assert limiter.acquire("a") is None
