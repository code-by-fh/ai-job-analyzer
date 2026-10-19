"""Storage hardening: the database file is private to the service user; keys can be rotated."""

import sqlite3
import stat
from dataclasses import replace
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import Settings
from app.crypto import FieldCipher
from app.main import create_app
from tests.conftest import auth, pushover_channel

OWNER_ONLY = 0o600


def _stored_tokens(database_path: Path) -> list:
    with sqlite3.connect(database_path) as connection:
        return [row[0] for row in connection.execute("SELECT sealed_fields FROM channels")]


def test_the_database_file_is_readable_by_the_owner_only(client: TestClient, database_path: Path):
    assert stat.S_IMODE(database_path.stat().st_mode) == OWNER_ONLY


def test_an_existing_database_file_is_narrowed_to_the_owner(settings: Settings, database_path: Path):
    database_path.touch(mode=0o644)
    database_path.chmod(0o644)
    with TestClient(create_app(settings)):
        assert stat.S_IMODE(database_path.stat().st_mode) == OWNER_ONLY


def test_a_cipher_with_an_old_key_opens_old_tokens_and_seals_with_the_new_key():
    old, new = Fernet.generate_key(), Fernet.generate_key()
    token = FieldCipher((old,)).seal({"a": 1})
    rotating = FieldCipher((new, old))
    assert rotating.open(token) == {"a": 1}
    assert FieldCipher((new,)).open(rotating.seal({"b": 2})) == {"b": 2}


def test_a_start_with_an_old_key_reseals_every_channel_with_the_new_key(settings: Settings, database_path: Path):
    old, new = settings.encryption_keys[0], Fernet.generate_key()
    with TestClient(create_app(settings), headers=auth()) as old_client:
        assert old_client.post("/v1/channels", json=pushover_channel()).status_code == 201
    with TestClient(create_app(replace(settings, encryption_keys=(new, old))), headers=auth()) as rotated_client:
        assert rotated_client.get("/v1/channels", params={"owner": "user-1"}).json()["total"] == 1
    assert [FieldCipher((new,)).open(token)["api_token"] for token in _stored_tokens(database_path)] == [
        pushover_channel()["fields"]["api_token"]
    ]
