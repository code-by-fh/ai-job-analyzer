"""add master_cv_fields to user_settings

Revision ID: n6f7a8b9c0d1
Revises: storage000001
Create Date: 2026-06-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'n6f7a8b9c0d1'
down_revision = 'storage000001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('master_cv_template_id', sa.Integer(), nullable=True))
    op.add_column('user_settings', sa.Column('master_cv_status', sa.String(), nullable=True))


def downgrade():
    op.drop_column('user_settings', 'master_cv_status')
    op.drop_column('user_settings', 'master_cv_template_id')
