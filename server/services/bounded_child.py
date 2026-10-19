"""Run one request through a short-lived child process with a wall-clock timeout and an output cap.

Used for work on untrusted input that may exhaust CPU or memory (user templates, PDF rendering).
The child sets its own memory and CPU limits; the parent enforces the wall clock by killing it.
"""

import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from core.logger import get_logger

logger = get_logger(__name__)

SERVER_DIR = Path(__file__).resolve().parent.parent
_CHILD_ENV_KEYS = ("PATH", "LD_LIBRARY_PATH", "LANG", "LC_ALL")
# A child's diagnostics are logged up to this size; the rest is read and dropped so a chatty
# child cannot block on a full pipe, and no more of what it echoed reaches the log.
MAX_CHILD_STDERR_BYTES = 4096
_DRAIN_CHUNK_BYTES = 65536


class ChildFailed(RuntimeError):
    """The child exited with an error, was killed by a limit or wrote too much output."""


@dataclass(frozen=True)
class ChildLimits:
    timeout_seconds: float
    max_output_bytes: int


def child_environment() -> dict:
    """Minimal environment for a child, so it is not handed the application secrets.

    The child is a resource boundary only (memory, CPU, wall clock), not a privilege boundary:
    it runs as the same user. The API and the workers disable their dump flag
    (core/process_hardening.py) so the child cannot read their environment either.
    """
    inherited = {key: os.environ[key] for key in _CHILD_ENV_KEYS if key in os.environ}
    return {**inherited, "PYTHONPATH": str(SERVER_DIR), "PYTHONDONTWRITEBYTECODE": "1"}


class _StderrCollector(threading.Thread):
    """Keeps the first MAX_CHILD_STDERR_BYTES of the child's stderr and drains the rest."""

    def __init__(self, stream):
        super().__init__(daemon=True)
        self._stream = stream
        self.head = b""

    def run(self) -> None:
        self.head = self._stream.read(MAX_CHILD_STDERR_BYTES)
        while self._stream.read(_DRAIN_CHUNK_BYTES):
            pass

    def text(self) -> str:
        self.join()
        return self.head.decode("utf-8", errors="replace")


def run_child(module: str, request: bytes, limits: ChildLimits) -> bytes:
    """Start `python -m module`, write *request* to its stdin and return its stdout.

    Raises ChildFailed on a non-zero exit (a limit kill included) or output above the cap, which
    kills the child at once. The cause (exit code, capped stderr) is logged at ERROR; the
    exception text stays generic.
    """
    child = subprocess.Popen(
        [sys.executable, "-m", module],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=SERVER_DIR, env=child_environment(),
    )
    stderr = _StderrCollector(child.stderr)
    stderr.start()
    watchdog = threading.Timer(limits.timeout_seconds, child.kill)
    watchdog.start()
    try:
        return _collect_output(child, request, limits.max_output_bytes)
    except ChildFailed as failure:
        logger.error(
            "Child %s failed: %s; exit code %s; stderr: %s",
            module, failure, child.returncode, stderr.text(),
        )
        raise
    finally:
        watchdog.cancel()
        child.kill()
        child.wait()


def _collect_output(child, request: bytes, max_output_bytes: int) -> bytes:
    child.stdin.write(request)
    child.stdin.close()
    # Reading is capped so even a child that ignores its own output cap cannot fill the parent.
    output = child.stdout.read(max_output_bytes + 1)
    if len(output) > max_output_bytes:
        # Without the kill the child would block on the full pipe until the watchdog fires.
        child.kill()
        child.wait()
        raise ChildFailed("output too large")
    if child.wait() != 0:
        raise ChildFailed("non-zero exit")
    return output
