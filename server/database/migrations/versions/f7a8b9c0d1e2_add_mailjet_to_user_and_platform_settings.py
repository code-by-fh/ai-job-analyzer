"""add mailjet to user and platform settings

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('mailjet_api_key', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('mailjet_secret_key', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('mailjet_from_email', sa.String(), nullable=True))
    op.add_column('job_platforms', sa.Column('mailjet_template', sa.Text(), nullable=True))
    op.add_column('job_platforms', sa.Column('mailjet_recipients', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'mailjet_recipients')
    op.drop_column('job_platforms', 'mailjet_template')
    op.drop_column('user_settings', 'mailjet_from_email')
    op.drop_column('user_settings', 'mailjet_secret_key')
    op.drop_column('user_settings', 'mailjet_api_key')
