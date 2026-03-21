"""Merge heads

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8, e5f6a7b8c9d0
Create Date: 2026-03-15 22:51:00.000000

"""
from typing import Sequence, Union

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = ('b3c4d5e6f7a8', 'e5f6a7b8c9d0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
