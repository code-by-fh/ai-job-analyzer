"""add content column to job_documents

Revision ID: q9r0s1t2u3v4
Revises: p8q9r0s1t2u3
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = "q9r0s1t2u3v4"
down_revision = "p8q9r0s1t2u3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "job_documents",
        sa.Column("content", sa.LargeBinary(), nullable=True),
    )


def downgrade():
    op.drop_column("job_documents", "content")
