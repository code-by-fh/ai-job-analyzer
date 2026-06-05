"""add spoken_languages to user_settings

Revision ID: k3c4d5e6f7a8
Revises: j2b3c4d5e6f7
Create Date: 2026-06-05 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'k3c4d5e6f7a8'
down_revision = 'j2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'user_settings',
        sa.Column('spoken_languages', sa.JSON(), nullable=True)
    )


def downgrade():
    op.drop_column('user_settings', 'spoken_languages')
