"""add cv_draft to jobs

Revision ID: cv_draft_20260601
Revises: c3d4e5f6a7b8
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "cv_draft_20260601"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "jobs",
        sa.Column("cv_draft", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("jobs", "cv_draft")
