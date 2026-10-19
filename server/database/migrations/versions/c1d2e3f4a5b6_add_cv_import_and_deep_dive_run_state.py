"""add the CV import run state to user settings and the per-user deep dive runs (feedback 2 T2)

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user_settings", sa.Column("cv_import_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_settings", sa.Column("cv_import_error", sa.String(), nullable=True))
    op.create_table(
        "company_deep_dives",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("focus", sa.Text(), nullable=False),
        sa.Column("focus_hash", sa.String(64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.UniqueConstraint("user_id", "domain", "focus_hash", name="uq_company_deep_dives_run"),
    )


def downgrade():
    op.drop_table("company_deep_dives")
    op.drop_column("user_settings", "cv_import_error")
    op.drop_column("user_settings", "cv_import_started_at")
