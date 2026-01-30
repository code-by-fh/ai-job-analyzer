"""add is_favorite to jobs

Revision ID: f1a2b3c4d5e6
Revises: 845ac55da830
Create Date: 2026-01-30 21:29:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'b72efead4dc5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('jobs', sa.Column('is_favorite', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    op.drop_column('jobs', 'is_favorite')
