"""ASGI layers in front of the routes: API-key authentication, then the request body limit.

Authentication runs before routing and before any body is read, so an unauthenticated caller only
ever sees 401: never a validation error, a 404 that reveals a route, or a body being buffered.
"""

import hmac
import json
from typing import Mapping, Optional

from fastapi import status
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import envelope

HEALTH_PATH = "/health"
BEARER_SCHEME = "bearer"
APP_ID_STATE_KEY = "app_id"
LIFESPAN_SCOPE = "lifespan"
HTTP_SCOPE = "http"
WEBSOCKET_SCOPE = "websocket"
# RFC 6455 "policy violation": the service serves no WebSocket.
WEBSOCKET_POLICY_VIOLATION = 1008


async def _send_error(send: Send, status_code: int, body: dict, extra_headers: Optional[list] = None) -> None:
    payload = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]
    await send({"type": "http.response.start", "status": status_code, "headers": headers + (extra_headers or [])})
    await send({"type": "http.response.body", "body": payload})


def _bearer_token(scope: Scope) -> Optional[str]:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            scheme, separator, token = value.decode("latin-1").partition(" ")
            if separator and scheme.lower() == BEARER_SCHEME and token:
                return token
            return None
    return None


def _is_health_check(scope: Scope) -> bool:
    return scope["type"] == HTTP_SCOPE and scope["path"] == HEALTH_PATH and scope["method"] == "GET"


async def _refuse_non_http(scope: Scope, send: Send) -> None:
    """A WebSocket handshake is closed with 1008; other scope types are dropped without calling the app."""
    if scope["type"] == WEBSOCKET_SCOPE:
        await send({"type": "websocket.close", "code": WEBSOCKET_POLICY_VIOLATION})


class ApiKeyMiddleware:
    """Maps a bearer key to its app id (``request.state.app_id``) or answers 401."""

    def __init__(self, app: ASGIApp, api_keys: Mapping[str, str]) -> None:
        self._app = app
        self._keys = [(app_id, key.encode()) for app_id, key in api_keys.items()]

    def _app_for(self, token: str) -> Optional[str]:
        """Compares against every key in constant time and without stopping early, so timing names no app."""
        presented = token.encode("latin-1")
        matched = None
        for app_id, key in self._keys:
            if hmac.compare_digest(presented, key):
                matched = app_id
        return matched

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Fail closed: only lifespan events pass unauthenticated; any scope but HTTP is refused."""
        if scope["type"] == LIFESPAN_SCOPE or _is_health_check(scope):
            await self._app(scope, receive, send)
            return
        if scope["type"] != HTTP_SCOPE:
            await _refuse_non_http(scope, send)
            return
        token = _bearer_token(scope)
        app_id = self._app_for(token) if token else None
        if app_id is None:
            body = envelope("UNAUTHENTICATED", "A valid API key is required")
            await _send_error(send, status.HTTP_401_UNAUTHORIZED, body, [(b"www-authenticate", b"Bearer")])
            return
        scope.setdefault("state", {})[APP_ID_STATE_KEY] = app_id
        await self._app(scope, receive, send)


class BodyLimitMiddleware:
    """Buffers at most ``max_bytes`` of a request body and answers 413 beyond it (chunked bodies too)."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def _read_body(self, receive: Receive) -> Optional[bytes]:
        chunks, size, more = [], 0, True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                return b"".join(chunks)
            chunks.append(message.get("body", b""))
            size += len(chunks[-1])
            if size > self._max_bytes:
                return None
            more = message.get("more_body", False)
        return b"".join(chunks)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != HTTP_SCOPE:
            await self._app(scope, receive, send)
            return
        body = await self._read_body(receive)
        if body is None:
            payload = envelope("PAYLOAD_TOO_LARGE", "Request body too large")
            await _send_error(send, status.HTTP_413_CONTENT_TOO_LARGE, payload)
            return
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self._app(scope, replay, send)
