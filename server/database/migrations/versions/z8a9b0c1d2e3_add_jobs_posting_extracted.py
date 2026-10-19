"""remember which job fields were filled from the posting by the analysis

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = "z8a9b0c1d2e3"
down_revision = "y7z8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("posting_extracted", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("jobs", "posting_extracted")
