"""add language to user settings

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('language', sa.String(), nullable=True, server_default='de'))


def downgrade():
    op.drop_column('user_settings', 'language')
