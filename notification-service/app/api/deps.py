"""Request-scoped dependencies: the database session, the cipher, the limiters and the caller's app id."""

from dataclasses import dataclass
from typing import Annotated, Iterator

from fastapi import Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.channels import OwnerScope
from app.crypto import FieldCipher
from app.errors import ApiError
from app.limits import OWNER_MAX_LENGTH, OWNER_PATTERN
from app.middleware import APP_ID_STATE_KEY
from app.rate_limit import RateLimiter

RETRY_AFTER_HEADER = "Retry-After"


@dataclass(frozen=True)
class Limiters:
    test_sends: RateLimiter
    app_test_sends: RateLimiter
    notifications: RateLimiter


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def get_cipher(request: Request) -> FieldCipher:
    return request.app.state.cipher


def get_limiters(request: Request) -> Limiters:
    return request.app.state.limiters


def get_app_id(request: Request) -> str:
    """The app the API key belongs to; the middleware sets it, its absence is a 401 (defence in depth)."""
    app_id = getattr(request.state, APP_ID_STATE_KEY, None)
    if app_id is None:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHENTICATED", "A valid API key is required")
    return app_id


AppId = Annotated[str, Depends(get_app_id)]
OwnerQuery = Annotated[str, Query(min_length=1, max_length=OWNER_MAX_LENGTH, pattern=OWNER_PATTERN)]


def get_scope(app_id: AppId, owner: OwnerQuery) -> OwnerScope:
    return OwnerScope(app_id, owner)


def enforce(limiter: RateLimiter, key: str) -> None:
    """429 with Retry-After once the key used up its window."""
    retry_after = limiter.acquire(key)
    if retry_after is not None:
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests", {RETRY_AFTER_HEADER: str(retry_after)}
        )


Db = Annotated[Session, Depends(get_db)]
Cipher = Annotated[FieldCipher, Depends(get_cipher)]
Limits = Annotated[Limiters, Depends(get_limiters)]
Scope = Annotated[OwnerScope, Depends(get_scope)]
