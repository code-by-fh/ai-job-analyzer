"""Add job documents table

Revision ID: f7a3c9d2e1b8
Revises: 9e3f38fb631b
Create Date: 2026-03-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a3c9d2e1b8'
down_revision: Union[str, Sequence[str], None] = '9e3f38fb631b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'job_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_job_documents_id'), 'job_documents', ['id'], unique=False)
    op.create_index(op.f('ix_job_documents_job_id'), 'job_documents', ['job_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_job_documents_job_id'), table_name='job_documents')
    op.drop_index(op.f('ix_job_documents_id'), table_name='job_documents')
    op.drop_table('job_documents')
