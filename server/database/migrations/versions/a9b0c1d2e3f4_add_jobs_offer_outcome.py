"""add the offer outcome fields of the job page (feedback 1 T14)

Revision ID: a9b0c1d2e3f4
Revises: z8a9b0c1d2e3
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = "a9b0c1d2e3f4"
down_revision = "z8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("outcome_notes", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("first_day_checklist", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("start_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("jobs", "start_date")
    op.drop_column("jobs", "first_day_checklist")
    op.drop_column("jobs", "outcome_notes")
