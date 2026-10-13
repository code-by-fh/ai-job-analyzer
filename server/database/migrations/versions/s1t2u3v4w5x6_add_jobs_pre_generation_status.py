"""add pre_generation_status to jobs

Revision ID: s1t2u3v4w5x6
Revises: r0s1t2u3v4w5
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = "s1t2u3v4w5x6"
down_revision = "r0s1t2u3v4w5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("pre_generation_status", sa.String(), nullable=True))


def downgrade():
    op.drop_column("jobs", "pre_generation_status")
