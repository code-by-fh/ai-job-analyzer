"""Process hardening for Celery worker processes."""

import ctypes
import sys

from core.logger import get_logger

logger = get_logger(__name__)

PR_SET_DUMPABLE = 4


def disable_process_dump() -> bool:
    """Make the process non-dumpable so a same-uid child cannot read /proc/<pid>/environ.

    Defence in depth for the template render child, which shares the worker's uid: it is a
    resource boundary, not a privilege boundary. Linux only; returns False (with a warning)
    where prctl is unavailable.
    """
    if not sys.platform.startswith("linux"):
        logger.warning("prctl(PR_SET_DUMPABLE) is not available on this platform")
        return False
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "prctl failed")
    except (OSError, AttributeError):
        logger.warning("Could not disable the process dump flag", exc_info=True)
        return False
    return True
