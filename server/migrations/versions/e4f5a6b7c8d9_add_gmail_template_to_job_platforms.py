"""add gmail_template to job_platforms

Revision ID: e4f5a6b7c8d9
Revises: b2c3d4e5f6a1
Create Date: 2026-03-13 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4f5a6b7c8d9'
down_revision = 'b2c3d4e5f6a1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('job_platforms', sa.Column('gmail_template', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'gmail_template')
