"""Channel storage and lookup, always scoped to one (app_id, owner) pair.

The app id comes from the API key, never from the request, so an app can reach only its own channels.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app import net_safety
from app.channel_types import CHANNEL_TYPES, DEFAULT_SMTP_PORT, ChannelType, FieldKind, check_fields
from app.crypto import FieldCipher
from app.db import ChannelRow
from app.errors import ApiError, FieldIssue, FieldValidationError, not_found
from app.schemas import NOT_SET, SET, ChannelCreate, ChannelOut, ChannelUpdate

logger = logging.getLogger("notify.channels")

MAX_CHANNELS_PER_OWNER = 20
HOST_NOT_PUBLIC = "must resolve to public addresses"


@dataclass(frozen=True)
class OwnerScope:
    """Whose channels a request may touch: the authenticated app and the owner it names."""

    app_id: str
    owner: str


@dataclass(frozen=True)
class Channel:
    """A stored channel with its field values opened (secrets included): for delivery only."""

    id: str
    type: ChannelType
    fields: Dict[str, Any]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _scoped(scope: OwnerScope):
    return select(ChannelRow).where(ChannelRow.app_id == scope.app_id, ChannelRow.owner == scope.owner)


def to_out(row: ChannelRow, cipher: FieldCipher) -> ChannelOut:
    """The response view: secret fields only as "set" / "not set"."""
    channel_type = CHANNEL_TYPES[row.type]
    values = cipher.open(row.sealed_fields)
    secrets = {spec.name: SET if spec.name in values else NOT_SET for spec in channel_type.fields if spec.secret}
    public = {spec.name: values[spec.name] for spec in channel_type.fields if not spec.secret and spec.name in values}
    return ChannelOut(
        id=uuid.UUID(row.id), type=row.type, name=row.name, owner=row.owner,
        fields=public, secrets=secrets, created_at=row.created_at, updated_at=row.updated_at,
    )


def _ensure_public_hosts(channel_type: ChannelType, values: Dict[str, Any], changes: Dict[str, Any]) -> None:
    """A changed host must resolve to public addresses now; delivery checks it again before connecting."""
    port = values.get("port", DEFAULT_SMTP_PORT)
    for spec in channel_type.fields:
        if spec.kind is FieldKind.HOST and spec.name in changes and net_safety.public_address(values[spec.name], port) is None:
            raise FieldValidationError([FieldIssue(f"fields.{spec.name}", HOST_NOT_PUBLIC)])


def _validated(channel_type: ChannelType, current: Dict[str, Any], changes: Dict[str, Any]) -> Dict[str, Any]:
    values, issues = check_fields(channel_type, current, changes)
    if issues:
        raise FieldValidationError(issues)
    _ensure_public_hosts(channel_type, values, changes)
    return values


def _count(db: Session, scope: OwnerScope) -> int:
    return db.scalar(select(func.count()).select_from(_scoped(scope).subquery())) or 0


def get_channel(db: Session, scope: OwnerScope, channel_id: uuid.UUID) -> ChannelRow:
    """The channel in the scope, else 404 (also for another app's or owner's channel)."""
    row = db.scalars(_scoped(scope).where(ChannelRow.id == str(channel_id))).first()
    if row is None:
        raise not_found()
    return row


def list_channels(db: Session, scope: OwnerScope, limit: int, offset: int) -> Tuple[Sequence[ChannelRow], int]:
    total = _count(db, scope)
    rows = db.scalars(_scoped(scope).order_by(ChannelRow.created_at, ChannelRow.id).limit(limit).offset(offset)).all()
    return rows, total


def create_channel(db: Session, cipher: FieldCipher, app_id: str, body: ChannelCreate) -> ChannelRow:
    """Validate, seal and store a new channel; 409 when the owner already has the maximum."""
    scope = OwnerScope(app_id, body.owner)
    if _count(db, scope) >= MAX_CHANNELS_PER_OWNER:
        raise ApiError(status.HTTP_409_CONFLICT, "CHANNEL_LIMIT_REACHED", "The owner has the maximum number of channels")
    channel_type = CHANNEL_TYPES[body.type]
    values = _validated(channel_type, {}, body.fields)
    now = _now()
    row = ChannelRow(
        id=str(uuid.uuid4()), app_id=app_id, owner=body.owner, type=body.type, name=body.name,
        sealed_fields=cipher.seal(values), created_at=now, updated_at=now,
    )
    db.add(row)
    db.commit()
    return row


def update_channel(db: Session, cipher: FieldCipher, row: ChannelRow, body: ChannelUpdate) -> ChannelRow:
    values = _validated(CHANNEL_TYPES[row.type], cipher.open(row.sealed_fields), body.fields)
    if body.name is not None:
        row.name = body.name
    row.sealed_fields = cipher.seal(values)
    row.updated_at = _now()
    db.commit()
    return row


def delete_channel(db: Session, row: ChannelRow) -> None:
    db.delete(row)
    db.commit()


def channels_for_delivery(
    db: Session, cipher: FieldCipher, scope: OwnerScope, channel_ids: Optional[List[uuid.UUID]]
) -> List[Channel]:
    """The named channels (all must exist in the scope, else 404 before anything is sent) or all of the owner's."""
    query = _scoped(scope).order_by(ChannelRow.created_at, ChannelRow.id)
    wanted = {str(channel_id) for channel_id in channel_ids or []}
    if wanted:
        query = query.where(ChannelRow.id.in_(wanted))
    rows = db.scalars(query).all()
    if wanted and len(rows) != len(wanted):
        raise not_found()
    return [Channel(row.id, CHANNEL_TYPES[row.type], cipher.open(row.sealed_fields)) for row in rows]


def reseal_all(session_factory: sessionmaker, cipher: FieldCipher) -> None:
    """Re-encrypt every channel with the current key (key rotation, at startup).

    A token neither key opens raises SealedDataError, so a wrong key pair stops the start.
    """
    with session_factory() as db:
        rows = db.scalars(select(ChannelRow)).all()
        for row in rows:
            row.sealed_fields = cipher.reseal(row.sealed_fields)
        db.commit()
    logger.info("Re-encrypted %d channel(s) with the current key", len(rows))
