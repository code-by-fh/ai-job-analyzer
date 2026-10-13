import os
import asyncio
import json
import re
from typing import List, Optional

from fastapi import WebSocket
import redis.asyncio as redis_async

from core.logger import get_logger

logger = get_logger(__name__)

# The only events every connected user may see; anything else needs a top-level user_id.
GLOBAL_EVENT_TYPES = frozenset({"ai_error", "ai_error_cleared"})


def _parse_payload(message: str) -> dict:
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


# 18 digits always fit a 64-bit id; int() on a longer string can raise.
_OWNER_ID_DIGITS = re.compile(r"[0-9]{1,18}")


def _parse_owner_id(value) -> Optional[int]:
    """The user id of an event: an int (not a bool) or an ASCII digit string; None for anything else."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and _OWNER_ID_DIGITS.fullmatch(value):
        return int(value)
    return None


class ConnectionManager:
    def __init__(self):
        # Maps user_id -> list of active WebSocket connections
        self.active_connections: dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        conns = self.active_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.active_connections.pop(user_id, None)

    async def broadcast(self, message: str):
        """Deliver a pub/sub message to its owner, or to everyone for whitelisted global events.

        Events without a top-level user_id that are not whitelisted are dropped,
        so a publisher that forgets the owner cannot leak data to other users.
        """
        payload = _parse_payload(message)
        target_user_id = payload.get("user_id")
        if target_user_id is not None:
            owner_id = _parse_owner_id(target_user_id)
            if owner_id is None:
                # A malformed id must not end the shared Redis listener; log only the type, never the value.
                logger.warning(f"Dropped WebSocket event with malformed user_id of type {type(target_user_id).__name__}")
                return
            await self._send_to_user(owner_id, message)
        elif payload.get("type") in GLOBAL_EVENT_TYPES:
            for user_id in list(self.active_connections):
                await self._send_to_user(user_id, message)
        else:
            logger.warning(f"Dropped WebSocket event without user_id: {payload.get('type')}")

    async def _send_to_user(self, user_id: int, message: str):
        for connection in self.active_connections.get(user_id, [])[:]:
            try:
                await connection.send_text(message)
            except Exception:
                # Any send failure means the socket is gone; forget it instead of failing the broadcast.
                self.disconnect(connection, user_id)


manager = ConnectionManager()


async def redis_listener():
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    logger.info(f"Connecting to Redis at {redis_url}...")

    try:
        r = redis_async.from_url(redis_url, encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe("job_updates")
        logger.info("Successfully subscribed to channel 'job_updates'.")

        async for message in pubsub.listen():
            logger.debug(f"Raw message from Redis: {message}")
            if message["type"] == "message":
                payload = message["data"]
                logger.debug(f"Event received and broadcasting: {payload}")
                await manager.broadcast(payload)
    except Exception as e:
        logger.error(f"Critical error in Redis listener: {e}")
