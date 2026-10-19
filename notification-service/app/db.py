"""SQLite storage via SQLAlchemy.

v1 creates its one table on startup (``create_all``) instead of running migrations: the service owns a
fresh database file, and a migration tool is due with the first schema change (see README).
"""

import os
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, Engine, Index, String, Text, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.limits import CHANNEL_NAME_MAX_LENGTH, OWNER_MAX_LENGTH

UUID_LENGTH = 36
APP_ID_MAX_LENGTH = 64
TYPE_MAX_LENGTH = 32
# The file holds every channel (encrypted): only the service user may read it. SQLite gives its
# journal files the same mode.
DATABASE_FILE_MODE = 0o600


class UtcDateTime(TypeDecorator):
    """SQLite keeps no offset: values are written as UTC and read back as aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Any) -> Optional[datetime]:
        return None if value is None else value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: Optional[datetime], dialect: Any) -> Optional[datetime]:
        return None if value is None else value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


class ChannelRow(Base):
    """One channel; ``sealed_fields`` is the Fernet token of all its field values, secret or not."""

    __tablename__ = "channels"
    __table_args__ = (Index("ix_channels_app_owner", "app_id", "owner"),)

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(APP_ID_MAX_LENGTH))
    owner: Mapped[str] = mapped_column(String(OWNER_MAX_LENGTH))
    type: Mapped[str] = mapped_column(String(TYPE_MAX_LENGTH))
    name: Mapped[str] = mapped_column(String(CHANNEL_NAME_MAX_LENGTH))
    sealed_fields: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)


def _create_private_file(path: str) -> None:
    """Create the file with mode 0600 before SQLite opens it, and narrow an existing file to 0600."""
    os.close(os.open(path, os.O_CREAT | os.O_WRONLY, DATABASE_FILE_MODE))
    os.chmod(path, DATABASE_FILE_MODE)


def open_database(path: str) -> sessionmaker:
    """A session factory on the SQLite file at *path*; creates the schema, so a bad path fails at startup."""
    _create_private_file(path)
    engine: Engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)
