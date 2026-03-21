"""add smtp to user and platform settings

Revision ID: g8a9b0c1d2e3
Revises: f7a8b9c0d1e2
Create Date: 2026-03-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'g8a9b0c1d2e3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('smtp_host', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('smtp_port', sa.Integer(), nullable=True))
    op.add_column('user_settings', sa.Column('smtp_user', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('smtp_password', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('smtp_from_email', sa.String(), nullable=True))
    op.add_column('job_platforms', sa.Column('smtp_template', sa.Text(), nullable=True))
    op.add_column('job_platforms', sa.Column('smtp_recipients', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('job_platforms', 'smtp_recipients')
    op.drop_column('job_platforms', 'smtp_template')
    op.drop_column('user_settings', 'smtp_from_email')
    op.drop_column('user_settings', 'smtp_password')
    op.drop_column('user_settings', 'smtp_user')
    op.drop_column('user_settings', 'smtp_port')
    op.drop_column('user_settings', 'smtp_host')
