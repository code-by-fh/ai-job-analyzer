"""Notification channels of the signed-in user, proxied to the notification service.

The owner is always derived from the authenticated user (``owner_for``), never taken from the request,
so a user can neither see nor touch another user's channels. Secrets are write-only: a channel answers
its secret fields only as ``"set"`` / ``"not set"``. Service failures become fixed answers
(:func:`http_error`); the service's own texts and values never reach the client.
"""

from typing import Annotated, Any, Dict, List, Literal, Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from database.core import MAX_EMAIL_LENGTH, MAX_NOTIFICATION_RECIPIENTS, User
from routers.deps import NOTIFICATION_TEST_RATE, limiter, user_or_ip_key
from services import notifications_client
from services.notification_channels import forget_channel
from services.notifications_client import (
    CHANNEL_LIMIT_REACHED,
    NOT_FOUND,
    RATE_LIMITED,
    VALIDATION_ERROR,
    NotifyError,
    owner_for,
)

router = APIRouter(prefix="/notifications")

CHANNELS_PATH = "/notifications/channels"
CHANNEL_NOT_FOUND = "Channel not found"
SERVICE_UNAVAILABLE = "notification_service_unavailable"
TOO_MANY_REQUESTS = "Too many requests"
LIMIT_REACHED = "channel_limit_reached"
# Bounds at the boundary; the service checks each field against its type's schema.
MAX_CHANNEL_NAME_LENGTH = 100
MAX_FIELDS_PER_CHANNEL = 20
MAX_FIELD_NAME_LENGTH = 64
MAX_FIELD_VALUE_LENGTH = 1000
_PUBLIC_CHANNEL_KEYS = ("id", "type", "name", "fields", "secrets", "created_at", "updated_at")

ChannelTypeId = Literal["pushover", "resend", "mailjet", "smtp"]
FieldName = Annotated[str, StringConstraints(pattern=r"^[a-z_]+$", max_length=MAX_FIELD_NAME_LENGTH)]
FieldText = Annotated[str, StringConstraints(max_length=MAX_FIELD_VALUE_LENGTH)]
AddressList = Annotated[
    List[Annotated[str, StringConstraints(max_length=MAX_EMAIL_LENGTH)]], Field(max_length=MAX_NOTIFICATION_RECIPIENTS)
]
FieldValue = Union[StrictInt, FieldText, AddressList, None]
FieldValues = Annotated[Dict[FieldName, FieldValue], Field(max_length=MAX_FIELDS_PER_CHANNEL)]
ChannelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CHANNEL_NAME_LENGTH)]


class ChannelCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ChannelTypeId
    name: ChannelName
    fields: FieldValues


class ChannelUpdateBody(BaseModel):
    """Omitted keys stay; a field set to null is cleared (a required one is refused)."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[ChannelName] = None
    fields: Optional[FieldValues] = None


def _loc(path: str) -> list:
    return ["body", *(int(part) if part.isdigit() else part for part in path.split("."))]


def http_error(error: NotifyError, loc_for=_loc) -> HTTPException:
    """The fixed answer for a failed service call; ``loc_for`` maps a service field path to a request loc."""
    if error.code == VALIDATION_ERROR:
        detail = [{"type": "value_error", "loc": loc_for(path), "msg": message} for path, message in error.fields]
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail or "Invalid channel")
    if error.code == NOT_FOUND:
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=CHANNEL_NOT_FOUND)
    if error.code == CHANNEL_LIMIT_REACHED:
        return HTTPException(status.HTTP_409_CONFLICT, detail=LIMIT_REACHED)
    if error.code == RATE_LIMITED:
        headers = {"Retry-After": error.retry_after} if error.retry_after else None
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=TOO_MANY_REQUESTS, headers=headers)
    return HTTPException(status.HTTP_502_BAD_GATEWAY, detail=SERVICE_UNAVAILABLE)


def public_channel(channel: Dict[str, Any]) -> Dict[str, Any]:
    """A channel as the web sees it: without the internal owner."""
    return {key: channel[key] for key in _PUBLIC_CHANNEL_KEYS}


def _call(method: str, *args):
    try:
        return getattr(notifications_client.get_client(), method)(*args)
    except NotifyError as error:
        raise http_error(error) from error


@router.get("/channel-types")
def list_channel_types(current_user: User = Depends(get_current_user)):
    """The channel types the service offers, with labels and field schema: ``{"items": [...]}``."""
    return {"items": _call("channel_types")}


@router.get("/channels")
def list_channels(current_user: User = Depends(get_current_user)):
    """The user's channels, oldest first: ``{"items": [...], "total"}``."""
    channels = [public_channel(channel) for channel in _call("list_channels", owner_for(current_user.id))]
    return {"items": channels, "total": len(channels)}


@router.post("/channels", status_code=status.HTTP_201_CREATED)
def create_channel(body: ChannelCreateBody, response: Response, current_user: User = Depends(get_current_user)):
    """Create a channel; 422 per field, 409 at the service's per-user channel limit."""
    channel = _call("create_channel", owner_for(current_user.id), body.model_dump())
    response.headers["Location"] = f"{CHANNELS_PATH}/{channel['id']}"
    return public_channel(channel)


@router.get("/channels/{channel_id}")
def get_channel(channel_id: UUID, current_user: User = Depends(get_current_user)):
    return public_channel(_call("get_channel", owner_for(current_user.id), str(channel_id)))


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: UUID, body: ChannelUpdateBody, current_user: User = Depends(get_current_user)):
    """Change the name and fields; an omitted secret keeps its stored value."""
    change = body.model_dump(exclude_unset=True, exclude_none=True)
    if body.fields is not None:
        change["fields"] = body.fields
    return public_channel(_call("update_channel", owner_for(current_user.id), str(channel_id), change))


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete the channel and drop it from every source of the user."""
    _call("delete_channel", owner_for(current_user.id), str(channel_id))
    forget_channel(db, current_user.id, str(channel_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/channels/{channel_id}/test")
@limiter.limit(NOTIFICATION_TEST_RATE, key_func=user_or_ip_key)
def test_channel(request: Request, channel_id: UUID, current_user: User = Depends(get_current_user)):
    """Send a fixed test message to the channel's own recipients: ``{"channel_id", "delivered", "reason"}``."""
    return _call("test_channel", owner_for(current_user.id), str(channel_id))
