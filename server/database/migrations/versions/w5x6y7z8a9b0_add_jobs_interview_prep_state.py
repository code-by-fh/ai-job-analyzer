"""add interview prep run state to jobs

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a9
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = "w5x6y7z8a9b0"
down_revision = "v4w5x6y7z8a9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("interview_prep_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("jobs", sa.Column("interview_prep_error", sa.String(), nullable=True))


def downgrade():
    op.drop_column("jobs", "interview_prep_error")
    op.drop_column("jobs", "interview_prep_started_at")
