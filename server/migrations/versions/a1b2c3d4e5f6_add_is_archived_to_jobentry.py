"""Add is_archived to jobentry

Revision ID: b2c3d4e5f6a1
Revises: f7a3c9d2e1b8
Create Date: 2026-03-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a1'
down_revision = 'f7a3c9d2e1b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('jobs', sa.Column('is_archived', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    op.drop_column('jobs', 'is_archived')
