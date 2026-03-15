"""add timezone to user_settings

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('timezone', sa.String(), nullable=True, server_default='Europe/Berlin'))


def downgrade():
    op.drop_column('user_settings', 'timezone')
