from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

from database import schema

NO_DELAY = 0


@pytest.fixture()
def empty_engine():
    return create_engine("sqlite:///:memory:")


def test_fresh_database_gets_current_models_and_a_stamp_at_head(empty_engine):
    with patch.object(schema.command, "stamp") as stamp, patch.object(schema.command, "upgrade") as upgrade:
        schema.prepare_schema(empty_engine)

    assert "job_platforms" in inspect(empty_engine).get_table_names()
    assert stamp.call_args.args[1] == "head"
    upgrade.assert_not_called()


def test_existing_database_gets_pending_migrations(empty_engine):
    with empty_engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))

    with patch.object(schema.command, "stamp") as stamp, patch.object(schema.command, "upgrade") as upgrade:
        schema.prepare_schema(empty_engine)

    assert upgrade.call_args.args[1] == "head"
    stamp.assert_not_called()


def test_waits_until_the_database_accepts_connections(empty_engine):
    starting_up = OperationalError("connect", {}, Exception("the database system is starting up"))
    real_connect = empty_engine.connect
    attempts = iter([starting_up, starting_up])

    def connect_after_two_refusals():
        failure = next(attempts, None)
        if failure:
            raise failure
        return real_connect()

    with patch.object(empty_engine, "connect", side_effect=connect_after_two_refusals) as connect:
        schema.wait_for_database(empty_engine, attempts=3, delay_seconds=NO_DELAY)

    assert connect.call_count == 3


def test_gives_up_after_the_last_attempt(empty_engine):
    refused = OperationalError("connect", {}, Exception("connection refused"))

    with patch.object(empty_engine, "connect", side_effect=refused), pytest.raises(OperationalError):
        schema.wait_for_database(empty_engine, attempts=2, delay_seconds=NO_DELAY)
