"""Add gmail_client_id and gmail_client_secret to system_settings

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-03-15 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('system_settings', sa.Column('gmail_client_id', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('gmail_client_secret', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('system_settings', 'gmail_client_secret')
    op.drop_column('system_settings', 'gmail_client_id')
