"""The /v1 routes. Handlers stay thin: parse, call the channel or delivery functions, shape the answer.

Routes are sync (``def``): SQLAlchemy, DNS checks and provider calls block, so they run in the thread pool.
"""

from typing import Annotated, Any, Dict
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response, status

from app import channels
from app.api.deps import AppId, Cipher, Db, Limits, Scope, enforce
from app.channel_types import CHANNEL_TYPES
from app.delivery import deliver
from app.delivery.content import TEST_CONTENT, content_for, digest_content
from app.limits import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas import (
    ChannelCreate,
    ChannelOut,
    ChannelPage,
    ChannelTypeList,
    ChannelTypeOut,
    ChannelUpdate,
    DeliveryOut,
    NotificationCreate,
    NotificationResult,
    PreviewCreate,
    PreviewOut,
)

router = APIRouter(prefix="/v1")
health_router = APIRouter()

CHANNEL_PATH = "/channels/{channel_id}"


@health_router.get("/health")
def health() -> Dict[str, str]:
    """Liveness for the container healthcheck; the only route without an API key."""
    return {"status": "ok"}


@router.get("/openapi.json", include_in_schema=False)
def openapi(request: Request) -> Dict[str, Any]:
    return request.app.openapi()


@router.get("/channel-types", response_model=ChannelTypeList)
def list_channel_types() -> ChannelTypeList:
    """Every supported channel type with its labels and field schema."""
    items = [ChannelTypeOut.model_validate(channel_type, from_attributes=True) for channel_type in CHANNEL_TYPES.values()]
    return ChannelTypeList(items=items)


@router.get("/channels", response_model=ChannelPage)
def list_channels(
    scope: Scope,
    db: Db,
    cipher: Cipher,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChannelPage:
    """The owner's channels, oldest first."""
    rows, total = channels.list_channels(db, scope, limit, offset)
    return ChannelPage(items=[channels.to_out(row, cipher) for row in rows], total=total, limit=limit, offset=offset)


@router.post("/channels", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
def create_channel(body: ChannelCreate, app_id: AppId, db: Db, cipher: Cipher, response: Response) -> ChannelOut:
    """Create a channel; 422 per field, 409 at the owner's channel limit."""
    row = channels.create_channel(db, cipher, app_id, body)
    response.headers["Location"] = f"/v1/channels/{row.id}"
    return channels.to_out(row, cipher)


@router.get(CHANNEL_PATH, response_model=ChannelOut)
def get_channel(channel_id: UUID, scope: Scope, db: Db, cipher: Cipher) -> ChannelOut:
    return channels.to_out(channels.get_channel(db, scope, channel_id), cipher)


@router.patch(CHANNEL_PATH, response_model=ChannelOut)
def update_channel(channel_id: UUID, body: ChannelUpdate, scope: Scope, db: Db, cipher: Cipher) -> ChannelOut:
    """Change name and fields; an omitted secret stays, a null clears an optional field."""
    row = channels.update_channel(db, cipher, channels.get_channel(db, scope, channel_id), body)
    return channels.to_out(row, cipher)


@router.delete(CHANNEL_PATH, status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: UUID, scope: Scope, db: Db) -> Response:
    channels.delete_channel(db, channels.get_channel(db, scope, channel_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(CHANNEL_PATH + "/test", response_model=DeliveryOut)
def test_channel(channel_id: UUID, scope: Scope, db: Db, cipher: Cipher, limits: Limits) -> DeliveryOut:
    """Send a fixed test message to the channel's default recipients (rate-limited per owner and per app)."""
    enforce(limits.test_sends, f"{scope.app_id}\x00{scope.owner}")
    enforce(limits.app_test_sends, scope.app_id)
    channel = channels.channels_for_delivery(db, cipher, scope, [channel_id])[0]
    return deliver(channel, TEST_CONTENT, None)


@router.post("/notifications", response_model=NotificationResult)
def send_notification(body: NotificationCreate, app_id: AppId, db: Db, cipher: Cipher, limits: Limits) -> NotificationResult:
    """Deliver to the named channels (or all of the owner's); one result per channel, 404 if one is unknown."""
    enforce(limits.notifications, app_id)
    targets = channels.channels_for_delivery(db, cipher, channels.OwnerScope(app_id, body.owner), body.channel_ids)
    content = content_for(body)
    return NotificationResult(results=[deliver(channel, content, body.recipients) for channel in targets])


@router.post("/previews", response_model=PreviewOut)
def preview(body: PreviewCreate) -> PreviewOut:
    """Render a job digest without sending it, so an app can show a template exactly as it goes out."""
    content = digest_content(body.template)
    return PreviewOut(subject=content.email.subject, html=content.email.html or "", push_text=content.pushes[0].message)
