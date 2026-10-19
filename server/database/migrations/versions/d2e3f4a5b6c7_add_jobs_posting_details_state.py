"""add the posting details run state to jobs (feedback 2 T8)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("posting_details_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("jobs", sa.Column("posting_details_error", sa.String(), nullable=True))


def downgrade():
    op.drop_column("jobs", "posting_details_error")
    op.drop_column("jobs", "posting_details_started_at")
