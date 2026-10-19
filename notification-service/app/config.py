"""Settings from the environment; the service refuses to start without valid keys (fail fast).

No error message ever contains a key: a start log must not leak what it refused.
"""

import re
from dataclasses import dataclass
from typing import Dict, Mapping, Tuple

from cryptography.fernet import Fernet

API_KEYS_VARIABLE = "NOTIFY_API_KEYS"
ENCRYPTION_KEY_VARIABLE = "NOTIFY_ENCRYPTION_KEY"
# Optional previous key during a rotation: still decrypts, never encrypts.
OLD_ENCRYPTION_KEY_VARIABLE = "NOTIFY_ENCRYPTION_KEY_OLD"
DATABASE_PATH_VARIABLE = "NOTIFY_DATABASE_PATH"
DEFAULT_DATABASE_PATH = "/data/notifications.sqlite3"
MIN_API_KEY_LENGTH = 32
PAIR_SEPARATOR = ","
APP_KEY_SEPARATOR = ":"
APP_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
API_KEY_PATTERN = re.compile(r"[A-Za-z0-9._~+/=-]{1,256}")


class ConfigError(RuntimeError):
    """A required setting is missing or invalid; the message names the variable, never its value."""


@dataclass(frozen=True)
class Settings:
    """The validated configuration: app id to API key, the Fernet keys (current first) and the SQLite path."""

    api_keys: Mapping[str, str]
    encryption_keys: Tuple[bytes, ...]
    database_path: str


def _parse_pair(pair: str) -> tuple[str, str]:
    app_id, separator, key = pair.partition(APP_KEY_SEPARATOR)
    if not separator or not APP_ID_PATTERN.fullmatch(app_id) or not API_KEY_PATTERN.fullmatch(key):
        raise ConfigError(f"{API_KEYS_VARIABLE} must be a list of app_id:key pairs (app_id: a-z, 0-9, _ or -)")
    if len(key) < MIN_API_KEY_LENGTH:
        raise ConfigError(f"{API_KEYS_VARIABLE}: the key of app '{app_id}' must be at least {MIN_API_KEY_LENGTH} characters")
    return app_id, key


def parse_api_keys(raw: str) -> Dict[str, str]:
    """``app_id:key,app_id2:key2`` as a mapping; raises ConfigError for an empty or malformed list."""
    pairs = [pair.strip() for pair in raw.split(PAIR_SEPARATOR) if pair.strip()]
    if not pairs:
        raise ConfigError(f"{API_KEYS_VARIABLE} is required (app_id:key pairs, keys of at least {MIN_API_KEY_LENGTH} characters)")
    keys: Dict[str, str] = {}
    for pair in pairs:
        app_id, key = _parse_pair(pair)
        if app_id in keys:
            raise ConfigError(f"{API_KEYS_VARIABLE} lists app '{app_id}' more than once")
        keys[app_id] = key
    if len(set(keys.values())) != len(keys):
        raise ConfigError(f"{API_KEYS_VARIABLE}: every app needs its own, unique key")
    return keys


def parse_encryption_key(raw: str, variable: str = ENCRYPTION_KEY_VARIABLE) -> bytes:
    """The Fernet key as bytes; raises ConfigError naming *variable* when it is missing or invalid."""
    key = raw.strip().encode()
    try:
        Fernet(key)
    except ValueError as error:
        raise ConfigError(f"{variable} must be a Fernet key (32 url-safe base64-encoded bytes)") from error
    return key


def parse_encryption_keys(environ: Mapping[str, str]) -> Tuple[bytes, ...]:
    """The current key, then the optional old one (key rotation)."""
    current = parse_encryption_key(environ.get(ENCRYPTION_KEY_VARIABLE, ""))
    old_raw = environ.get(OLD_ENCRYPTION_KEY_VARIABLE, "").strip()
    if not old_raw:
        return (current,)
    return current, parse_encryption_key(old_raw, OLD_ENCRYPTION_KEY_VARIABLE)


def load_settings(environ: Mapping[str, str]) -> Settings:
    """Read and validate every setting; raises ConfigError so the process exits before serving."""
    return Settings(
        api_keys=parse_api_keys(environ.get(API_KEYS_VARIABLE, "")),
        encryption_keys=parse_encryption_keys(environ),
        database_path=environ.get(DATABASE_PATH_VARIABLE, "").strip() or DEFAULT_DATABASE_PATH,
    )
