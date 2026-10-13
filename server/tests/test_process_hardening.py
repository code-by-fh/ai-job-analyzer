import subprocess
import sys
from unittest.mock import patch

import pytest
from celery.signals import worker_process_init

from core import celery_config  # noqa: F401  (registers the worker_process_init handler)

LINUX_ONLY = pytest.mark.skipif(not sys.platform.startswith("linux"), reason="prctl is Linux only")
SECRET = "hardening-secret-xyz"

PARENT_SCRIPT = f"""
import os, subprocess, sys
os.environ["SECRET_KEY"] = "{SECRET}"
from core.process_hardening import disable_process_dump
print("hardened:", disable_process_dump())
probe = "import os; print(open(f'/proc/{{os.getppid()}}/environ','rb').read().count(b'{SECRET}'))"
print(subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True).stdout.strip() or "blocked")
"""


@LINUX_ONLY
def test_hardened_process_environment_is_unreadable_by_its_children():
    lines = subprocess.run([sys.executable, "-c", PARENT_SCRIPT], capture_output=True, text=True).stdout.split("\n")
    assert lines[:2] == ["hardened: True", "blocked"]


def test_worker_process_init_disables_the_dump():
    with patch("core.process_hardening.disable_process_dump") as disable:
        worker_process_init.send(sender=None)
    disable.assert_called_once_with()


ENTRY_POINTS = ["core.celery_config", "core.scraper_celery_config", "main", "scraper_api", "workers.scraper_worker"]
PR_GET_DUMPABLE = 3
DUMPABLE_PROBE = (
    "import ctypes, importlib, sys\n"
    "importlib.import_module(sys.argv[1])\n"
    f"print(ctypes.CDLL(None).prctl({PR_GET_DUMPABLE}, 0, 0, 0, 0))"
)


@LINUX_ONLY
@pytest.mark.parametrize("entry_point", ENTRY_POINTS)
def test_every_process_entry_point_is_non_dumpable_after_import(entry_point):
    result = subprocess.run([sys.executable, "-c", DUMPABLE_PROBE, entry_point], capture_output=True, text=True)
    assert result.stdout.strip().splitlines()[-1] == "0", result.stderr
