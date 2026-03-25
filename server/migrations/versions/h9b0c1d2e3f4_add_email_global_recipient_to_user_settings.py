"""add email_global_recipient to user_settings

Revision ID: h9b0c1d2e3f4
Revises: g8a9b0c1d2e3
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'h9b0c1d2e3f4'
down_revision = 'g8a9b0c1d2e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('email_global_recipient', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_settings', 'email_global_recipient')
