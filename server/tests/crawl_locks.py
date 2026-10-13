"""A small Redis stand-in that models what the crawl lock and progress code relies on: strings, hashes, sets,
TTLs on a controllable clock, and the Lua scripts of core.crawl_registry."""

from fnmatch import fnmatchcase
from unittest.mock import MagicMock

from core import crawl_registry


def _text(value) -> str:
    return value.decode() if isinstance(value, bytes) else value


class Clock:
    def __init__(self):
        self.now = 0.0


def _bytes(value) -> bytes:
    return value if isinstance(value, bytes) else str(value).encode()


class CrawlRedisState:
    """Strings, hashes and sets with expiry; the MagicMock below delegates to it."""

    def __init__(self, clock: Clock):
        self.clock = clock
        self.strings: dict = {}
        self.hashes: dict = {}
        self.sets: dict = {}
        self.expires: dict = {}

    def alive(self, key) -> bool:
        return self.expires.get(key, float("inf")) > self.clock.now

    def drop_expired(self) -> None:
        for key in [key for key in self.expires if not self.alive(key)]:
            self.strings.pop(key, None)
            self.hashes.pop(key, None)
            self.expires.pop(key, None)

    def set(self, key, value, nx=False, ex=None):
        self.drop_expired()
        if nx and key in self.strings:
            return None
        self.strings[key] = _bytes(value)
        if ex:
            self.expires[key] = self.clock.now + ex
        return True

    def get(self, key):
        self.drop_expired()
        return self.strings.get(key)

    def delete(self, key):
        self.expires.pop(key, None)
        return int(self.strings.pop(key, None) is not None) + int(self.hashes.pop(key, None) is not None)

    def hset(self, key, field=None, value=None, mapping=None):
        self.drop_expired()
        self.hashes.setdefault(key, {}).update({field: _bytes(value)} if field else {})
        self.hashes[key].update({name: _bytes(item) for name, item in (mapping or {}).items()})

    def hget(self, key, field):
        self.drop_expired()
        return self.hashes.get(key, {}).get(field)

    def hgetall(self, key):
        self.drop_expired()
        return {name.encode(): value for name, value in self.hashes.get(key, {}).items()}

    def expire(self, key, seconds):
        self.expires[key] = self.clock.now + seconds

    def eval(self, script, numkeys, *args):
        if script == crawl_registry.RELEASE_SCRIPT:
            key, token = args
            holder = self.get(key)
            return self.delete(key) if holder == _bytes(token) else 0
        if script == crawl_registry.PROGRESS_SCRIPT:
            return self._progress(*args)
        raise AssertionError("unknown script")

    def _progress(self, hash_key, lock_key, now_ms, ttl, crawl_id, field):
        self.drop_expired()
        if hash_key not in self.hashes:
            return 0
        self.hashes[hash_key][field] = _bytes(now_ms)
        self.expire(hash_key, ttl)
        if self.get(lock_key) == _bytes(crawl_id):
            self.expire(lock_key, ttl)
        return 1

    def hmget(self, key, fields):
        self.drop_expired()
        return [self.hashes.get(key, {}).get(field) for field in fields]

    def smembers(self, key):
        return set(self.sets.get(_text(key), set()))

    def keys(self, pattern):
        self.drop_expired()
        names = list(self.strings) + list(self.hashes) + list(self.sets)
        return [name.encode() for name in names if fnmatchcase(name, pattern)]


def lock_backed(fake_redis: MagicMock, clock: Clock, decoded: bool = False) -> CrawlRedisState:
    """Wire the shared fake_redis MagicMock to a stateful store and return the store.

    decoded=True answers like a client created with decode_responses=True (str instead of bytes).
    """
    state = CrawlRedisState(clock)
    for name in ("set", "get", "delete", "hset", "hget", "hgetall", "hmget", "expire", "eval", "smembers", "keys"):
        getattr(fake_redis, name).side_effect = getattr(state, name)
    fake_redis.sadd.side_effect = lambda key, value: state.sets.setdefault(key, set()).add(_bytes(value))
    fake_redis.srem.side_effect = lambda key, value: state.sets.get(_text(key), set()).discard(_bytes(value))
    fake_redis.exists.side_effect = lambda key: (state.drop_expired(), key in state.hashes or key in state.strings)[1]
    if decoded:
        fake_redis.hgetall.side_effect = lambda key: {
            name: value.decode() for name, value in state.hashes.get(key, {}).items() if state.alive(key)
        }
        fake_redis.keys.side_effect = lambda pattern: [key.decode() for key in state.keys(pattern)]
    return state
