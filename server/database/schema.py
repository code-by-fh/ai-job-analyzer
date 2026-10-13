"""Bring the database schema up to date at start-up.

The migration chain cannot build an empty database: early tables such as `system_settings` were only
ever created by `create_all`, so a later migration's ALTER fails on a fresh database. A fresh database
therefore gets the current models plus a stamp at head; a migrated one gets its pending migrations.
"""

import logging
import os
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

from database.core import Base

logger = logging.getLogger(__name__)

ALEMBIC_INI = os.path.join(os.path.dirname(__file__), "alembic.ini")
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")
VERSION_TABLE = "alembic_version"
# Postgres refuses connections for a few seconds after a fresh container's init.
STARTUP_ATTEMPTS = 30
STARTUP_DELAY_SECONDS = 2


def wait_for_database(engine, attempts: int = STARTUP_ATTEMPTS, delay_seconds: float = STARTUP_DELAY_SECONDS) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect():
                return
        except OperationalError:
            if attempt == attempts:
                raise
            logger.info("Database not ready (attempt %d/%d), retrying", attempt, attempts)
            time.sleep(delay_seconds)


def prepare_schema(engine) -> None:
    config = _alembic_config()
    table_names = inspect(engine).get_table_names()
    if not table_names:
        Base.metadata.create_all(bind=engine)
        command.stamp(config, "head")
        logger.info("Fresh database: created the current schema and stamped it at head")
        return
    if VERSION_TABLE not in table_names:
        logger.error("Database has tables but no %s; stamp it at the matching revision before migrating", VERSION_TABLE)
    command.upgrade(config, "head")


def _alembic_config() -> Config:
    config = Config(ALEMBIC_INI)
    config.set_main_option("script_location", MIGRATIONS_DIR)
    return config


if __name__ == "__main__":
    from database.core import engine

    logging.basicConfig(level=logging.INFO)
    wait_for_database(engine)
    prepare_schema(engine)
