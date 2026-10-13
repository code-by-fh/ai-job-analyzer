"""add platform_runs (crawl history per platform)

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "v4w5x6y7z8a9"
down_revision = "u3v4w5x6y7z8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "platform_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform_id", sa.Integer(), sa.ForeignKey("job_platforms.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("matched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seeded", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error", sa.String(), nullable=True),
    )
    op.create_index("ix_platform_runs_platform_id", "platform_runs", ["platform_id"])


def downgrade():
    op.drop_index("ix_platform_runs_platform_id", table_name="platform_runs")
    op.drop_table("platform_runs")
