"""The service refuses to start without valid API keys and a valid encryption key."""

from typing import Dict

import pytest
from cryptography.fernet import Fernet

from app.config import DEFAULT_DATABASE_PATH, ConfigError, load_settings

VALID_KEY = "k" * 32
SHORT_KEY = "k" * 31


def _environ(**overrides: str) -> Dict[str, str]:
    base = {"NOTIFY_API_KEYS": f"job-agent:{VALID_KEY}", "NOTIFY_ENCRYPTION_KEY": Fernet.generate_key().decode()}
    return {**base, **overrides}


def test_valid_settings_map_each_app_to_its_key():
    settings = load_settings(_environ(NOTIFY_API_KEYS=f"job-agent:{VALID_KEY}, crm:{'c' * 40}"))
    assert settings.api_keys == {"job-agent": VALID_KEY, "crm": "c" * 40}
    assert settings.database_path == DEFAULT_DATABASE_PATH


def test_the_database_path_comes_from_the_environment():
    assert load_settings(_environ(NOTIFY_DATABASE_PATH="/srv/x.sqlite3")).database_path == "/srv/x.sqlite3"


@pytest.mark.parametrize("value", ["", "   ", ","])
def test_missing_api_keys_stop_the_start(value):
    with pytest.raises(ConfigError, match="NOTIFY_API_KEYS"):
        load_settings(_environ(NOTIFY_API_KEYS=value))


def test_unset_api_keys_stop_the_start():
    environ = _environ()
    del environ["NOTIFY_API_KEYS"]
    with pytest.raises(ConfigError, match="NOTIFY_API_KEYS"):
        load_settings(environ)


def test_a_key_shorter_than_32_characters_stops_the_start():
    with pytest.raises(ConfigError, match="at least 32") as refusal:
        load_settings(_environ(NOTIFY_API_KEYS=f"job-agent:{SHORT_KEY}"))
    assert SHORT_KEY not in str(refusal.value)


@pytest.mark.parametrize("pair", [VALID_KEY, f":{VALID_KEY}", f"Job Agent:{VALID_KEY}", f"job-agent:{VALID_KEY} x"])
def test_a_malformed_pair_stops_the_start(pair):
    with pytest.raises(ConfigError, match="NOTIFY_API_KEYS") as refusal:
        load_settings(_environ(NOTIFY_API_KEYS=pair))
    assert VALID_KEY not in str(refusal.value)


def test_an_app_listed_twice_stops_the_start():
    with pytest.raises(ConfigError, match="more than once"):
        load_settings(_environ(NOTIFY_API_KEYS=f"job-agent:{VALID_KEY},job-agent:{'x' * 32}"))


def test_one_key_shared_by_two_apps_stops_the_start():
    with pytest.raises(ConfigError, match="unique"):
        load_settings(_environ(NOTIFY_API_KEYS=f"job-agent:{VALID_KEY},crm:{VALID_KEY}"))


@pytest.mark.parametrize("value", ["", "not-a-fernet-key"])
def test_a_missing_or_invalid_encryption_key_stops_the_start(value):
    with pytest.raises(ConfigError, match="NOTIFY_ENCRYPTION_KEY") as refusal:
        load_settings(_environ(NOTIFY_ENCRYPTION_KEY=value))
    assert "not-a-fernet-key" not in str(refusal.value)


def test_without_an_old_key_only_the_current_key_is_used():
    environ = _environ()
    assert load_settings(environ).encryption_keys == (environ["NOTIFY_ENCRYPTION_KEY"].encode(),)


def test_an_old_key_is_kept_after_the_current_one_for_rotation():
    old = Fernet.generate_key().decode()
    environ = _environ(NOTIFY_ENCRYPTION_KEY_OLD=old)
    assert load_settings(environ).encryption_keys == (environ["NOTIFY_ENCRYPTION_KEY"].encode(), old.encode())


def test_an_invalid_old_key_stops_the_start():
    with pytest.raises(ConfigError, match="NOTIFY_ENCRYPTION_KEY_OLD") as refusal:
        load_settings(_environ(NOTIFY_ENCRYPTION_KEY_OLD="not-a-fernet-key"))
    assert "not-a-fernet-key" not in str(refusal.value)
