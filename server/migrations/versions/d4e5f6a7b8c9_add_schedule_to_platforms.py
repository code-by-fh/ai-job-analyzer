"""add schedule_time and schedule_days to job_platforms

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_platforms', sa.Column('schedule_time', sa.String(), nullable=True))
    op.add_column('job_platforms', sa.Column('schedule_days', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'schedule_days')
    op.drop_column('job_platforms', 'schedule_time')
