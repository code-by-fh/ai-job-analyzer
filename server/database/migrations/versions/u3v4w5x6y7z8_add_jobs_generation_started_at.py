"""add generation_started_at to jobs

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = "u3v4w5x6y7z8"
down_revision = "t2u3v4w5x6y7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("generation_started_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("jobs", "generation_started_at")
