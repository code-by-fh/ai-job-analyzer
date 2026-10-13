"""add interview_at to jobs

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = "t2u3v4w5x6y7"
down_revision = "s1t2u3v4w5x6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("interview_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("jobs", "interview_at")
