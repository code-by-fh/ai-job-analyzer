import asyncio
import json

import pytest

from core.connection_manager import ConnectionManager

OWNER_ID = 7
OTHER_ID = 8


class FakeWebSocket:
    """Records what the manager sends."""

    def __init__(self):
        self.sent = []

    async def send_text(self, message: str) -> None:
        self.sent.append(message)


class BrokenWebSocket:
    """Fails like a socket the browser already closed."""

    async def send_text(self, message: str) -> None:
        raise RuntimeError("socket closed")


def _manager_with(sockets: dict) -> ConnectionManager:
    manager = ConnectionManager()
    manager.active_connections = {user_id: list(conns) for user_id, conns in sockets.items()}
    return manager


def _broadcast(manager: ConnectionManager, message: str) -> None:
    asyncio.run(manager.broadcast(message))


def test_event_with_user_id_reaches_only_that_user():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": OWNER_ID}))
    assert (len(owner.sent), other.sent) == (1, [])


def test_global_event_reaches_every_user():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "ai_error", "message": "Model not found"}))
    assert (len(owner.sent), len(other.sent)) == (1, 1)


def test_unscoped_user_event_is_dropped():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "interview_prep_ready", "job_id": "job-1"}))
    assert (owner.sent, other.sent) == ([], [])


def test_invalid_json_is_dropped():
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, "not json")
    assert owner.sent == []


def test_failed_socket_is_disconnected():
    manager = _manager_with({OWNER_ID: [BrokenWebSocket()]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": OWNER_ID}))
    assert OWNER_ID not in manager.active_connections


def test_event_with_non_numeric_user_id_is_dropped():
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": "not-a-number"}))
    assert owner.sent == []


def test_event_with_non_scalar_user_id_is_dropped():
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": [OWNER_ID]}))
    assert owner.sent == []


@pytest.mark.parametrize("user_id", [True, False, 7.9, 1.0, "7.0", "-7", " 7", "٧", "²"])
def test_event_with_non_integer_user_id_is_dropped(user_id):
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], 1: [FakeWebSocket()], 0: [FakeWebSocket()]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": user_id}))
    assert owner.sent == []
    assert all(not conns[0].sent for uid, conns in manager.active_connections.items() if uid in (0, 1))


@pytest.mark.parametrize("user_id", [OWNER_ID, str(OWNER_ID)])
def test_event_with_integer_or_digit_string_user_id_reaches_owner(user_id):
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": user_id}))
    assert len(owner.sent) == 1


def test_event_with_huge_digit_string_user_id_is_dropped_without_raising():
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": "7" * 5000}))
    assert owner.sent == []
