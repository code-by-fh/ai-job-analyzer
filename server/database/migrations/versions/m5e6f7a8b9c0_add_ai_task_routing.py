"""add ai_task_routing to system_settings

Revision ID: m5e6f7a8b9c0
Revises: l4d5e6f7a8b9
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa

revision = "m5e6f7a8b9c0"
down_revision = "l4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "system_settings",
        sa.Column("ai_task_routing", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("system_settings", "ai_task_routing")
