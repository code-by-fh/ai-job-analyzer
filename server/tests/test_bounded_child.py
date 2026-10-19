"""The child runner kills an over-producing child at once and logs a capped stderr on failure."""

import time
from unittest.mock import patch

import pytest

from services.bounded_child import MAX_CHILD_STDERR_BYTES, ChildFailed, ChildLimits, run_child

PROBE = "tests.bounded_child_probe"
LONG_TIMEOUT_SECONDS = 30
QUICK_SECONDS = 5
SMALL_OUTPUT_CAP = 1000


def test_output_above_the_cap_kills_the_child_without_waiting_for_the_watchdog():
    started = time.monotonic()
    with pytest.raises(ChildFailed):
        run_child(PROBE, b"flood", ChildLimits(LONG_TIMEOUT_SECONDS, SMALL_OUTPUT_CAP))
    assert time.monotonic() - started < QUICK_SECONDS


def test_failure_logs_the_exit_code_and_at_most_the_capped_stderr():
    with patch("services.bounded_child.logger") as logger, pytest.raises(ChildFailed) as failure:
        run_child(PROBE, b"noise", ChildLimits(LONG_TIMEOUT_SECONDS, SMALL_OUTPUT_CAP))
    _, module, reason, exit_code, stderr = logger.error.call_args.args
    assert (module, str(reason), exit_code) == (PROBE, "non-zero exit", 1)
    assert stderr == "y" * MAX_CHILD_STDERR_BYTES
    assert "y" not in str(failure.value)
