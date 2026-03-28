import os
import asyncio
import json
from typing import List

from fastapi import WebSocket
import redis.asyncio as redis_async

from core.logger import get_logger

logger = get_logger(__name__)


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
        """Send a message to the user identified in the payload, or all users if no user_id."""
        import json as _json
        try:
            payload = _json.loads(message)
            target_user_id = payload.get("user_id")
        except Exception:
            target_user_id = None

        if target_user_id is not None:
            connections = self.active_connections.get(int(target_user_id), [])
            for connection in connections[:]:
                try:
                    await connection.send_text(message)
                except Exception:
                    self.disconnect(connection, int(target_user_id))
        else:
            for user_id, connections in list(self.active_connections.items()):
                for connection in connections[:]:
                    try:
                        await connection.send_text(message)
                    except Exception:
                        self.disconnect(connection, user_id)


manager = ConnectionManager()


async def redis_listener():
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
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
