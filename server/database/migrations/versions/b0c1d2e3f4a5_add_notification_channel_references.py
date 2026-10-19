"""reference notification-service channels from sources; mark migrated credentials (feedback 1 T16)

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("job_platforms", sa.Column("notification_channels", sa.JSON(), nullable=True))
    op.add_column(
        "user_settings",
        sa.Column("notification_channels_migrated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("user_settings", "notification_channels_migrated")
    op.drop_column("job_platforms", "notification_channels")
