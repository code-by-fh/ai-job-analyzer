"""add setup_status and url_pattern to job_platforms

Revision ID: k3l4m5n6o7p8
Revises: g8a9b0c1d2e3
Create Date: 2026-06-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'k3l4m5n6o7p8'
down_revision = 'j2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_platforms', sa.Column('setup_status', sa.String(), nullable=False, server_default='active'))
    op.add_column('job_platforms', sa.Column('url_pattern', sa.String(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'url_pattern')
    op.drop_column('job_platforms', 'setup_status')
