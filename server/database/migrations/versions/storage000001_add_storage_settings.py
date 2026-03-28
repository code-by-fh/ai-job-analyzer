"""add storage settings

Revision ID: storage000001
Revises: h9b0c1d2e3f4
Create Date: 2026-03-26 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'storage000001'
down_revision = 'h9b0c1d2e3f4'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('user_settings', sa.Column('active_storage_service', sa.String(), nullable=True, server_default='NONE'))
    op.add_column('user_settings', sa.Column('google_drive_refresh_token', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('google_drive_email', sa.String(), nullable=True))

def downgrade():
    op.drop_column('user_settings', 'google_drive_email')
    op.drop_column('user_settings', 'google_drive_refresh_token')
    op.drop_column('user_settings', 'active_storage_service')
