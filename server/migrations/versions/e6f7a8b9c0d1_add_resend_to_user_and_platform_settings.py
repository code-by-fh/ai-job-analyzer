"""add resend to user and platform settings

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('resend_api_key', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('resend_from_email', sa.String(), nullable=True))
    op.add_column('job_platforms', sa.Column('resend_template', sa.Text(), nullable=True))
    op.add_column('job_platforms', sa.Column('resend_recipients', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'resend_recipients')
    op.drop_column('job_platforms', 'resend_template')
    op.drop_column('user_settings', 'resend_from_email')
    op.drop_column('user_settings', 'resend_api_key')
