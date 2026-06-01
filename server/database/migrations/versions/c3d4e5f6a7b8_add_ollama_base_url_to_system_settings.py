"""add ollama_base_url to system_settings

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "system_settings",
        sa.Column("ollama_base_url", sa.String(), nullable=True),
    )


def downgrade():
    op.drop_column("system_settings", "ollama_base_url")
