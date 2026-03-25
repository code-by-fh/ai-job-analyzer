"""Move gmail_client_id/secret from system_settings to user_settings

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-03-15 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('gmail_client_id', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('gmail_client_secret', sa.String(), nullable=True))
    op.drop_column('system_settings', 'gmail_client_secret')
    op.drop_column('system_settings', 'gmail_client_id')


def downgrade() -> None:
    op.add_column('system_settings', sa.Column('gmail_client_id', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('gmail_client_secret', sa.String(), nullable=True))
    op.drop_column('user_settings', 'gmail_client_secret')
    op.drop_column('user_settings', 'gmail_client_id')
