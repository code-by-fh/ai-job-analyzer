"""Add openrouter_api_key to system_settings

Revision ID: a2b3c4d5e6f7
Revises: f7a3c9d2e1b8
Create Date: 2026-03-14 22:41:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('system_settings', sa.Column('openrouter_api_key', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('system_settings', 'openrouter_api_key')
