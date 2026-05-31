"""add match_threshold to user_settings

Revision ID: i1a2b3c4d5e6
Revises: storage000001
Create Date: 2026-05-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'i1a2b3c4d5e6'
down_revision = 'storage000001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'user_settings',
        sa.Column('match_threshold', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade():
    op.drop_column('user_settings', 'match_threshold')
