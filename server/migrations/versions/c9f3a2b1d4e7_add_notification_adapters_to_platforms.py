"""add_notification_adapters_to_platforms

Revision ID: c9f3a2b1d4e7
Revises: e33149c31cdc
Create Date: 2026-03-03 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9f3a2b1d4e7'
down_revision: Union[str, Sequence[str], None] = 'e33149c31cdc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'job_platforms',
        sa.Column('notification_adapters', sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('job_platforms', 'notification_adapters')
