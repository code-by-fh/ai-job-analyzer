"""merge heads

Revision ID: 2b8377219f40
Revises: a1b2c3d4e5f6, d1e2f3a4b5c6
Create Date: 2026-03-08 15:57:52.172111

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b8377219f40'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'd1e2f3a4b5c6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
