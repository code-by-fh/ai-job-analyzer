"""Remove master_cv columns from user_settings; add status to document_templates.

Revision ID: p8q9r0s1t2u3
Revises: n6f7a8b9c0d1
Create Date: 2026-06-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'p8q9r0s1t2u3'
down_revision = 'n6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('user_settings', 'master_cv_template_id')
    op.drop_column('user_settings', 'master_cv_status')
    op.add_column('document_templates', sa.Column('status', sa.String(), nullable=True))


def downgrade():
    op.drop_column('document_templates', 'status')
    op.add_column('user_settings', sa.Column('master_cv_status', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('master_cv_template_id', sa.Integer(), nullable=True))
