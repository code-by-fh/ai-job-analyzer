"""add gmail_recipients to job_platforms

Revision ID: f6a7b8c9d0e1
Revises: e4f5a6b7c8d9
Create Date: 2026-03-14 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_platforms', sa.Column('gmail_recipients', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'gmail_recipients')
