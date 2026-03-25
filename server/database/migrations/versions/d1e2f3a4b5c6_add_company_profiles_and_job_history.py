"""add_company_profiles_and_job_history

Revision ID: d1e2f3a4b5c6
Revises: c9f3a2b1d4e7
Create Date: 2026-03-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c9f3a2b1d4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create company_profiles table
    op.create_table(
        'company_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('culture_summary', sa.Text(), nullable=True),
        sa.Column('review_score', sa.Float(), nullable=True),
        sa.Column('review_source', sa.String(), nullable=True),
        sa.Column('salary_benchmark', sa.JSON(), nullable=True),
        sa.Column('tech_stack', sa.JSON(), nullable=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('analyzed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_company_profiles_id'), 'company_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_company_profiles_domain'), 'company_profiles', ['domain'], unique=True)

    # Create job_status_history table
    op.create_table(
        'job_status_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.String(), nullable=False),
        sa.Column('from_status', sa.String(), nullable=True),
        sa.Column('to_status', sa.String(), nullable=False),
        sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('changed_by', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id']),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_job_status_history_id'), 'job_status_history', ['id'], unique=False)
    op.create_index(op.f('ix_job_status_history_job_id'), 'job_status_history', ['job_id'], unique=False)

    # Add new columns to jobs table
    op.add_column('jobs', sa.Column('company_domain', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('contact_persons', sa.JSON(), nullable=True))
    op.add_column('jobs', sa.Column('interview_prep_material', sa.Text(), nullable=True))
    op.add_column('jobs', sa.Column('recruiter_info', sa.JSON(), nullable=True))
    op.add_column('jobs', sa.Column('salary_benchmark', sa.JSON(), nullable=True))
    op.add_column('jobs', sa.Column('next_follow_up_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove new columns from jobs
    op.drop_column('jobs', 'next_follow_up_at')
    op.drop_column('jobs', 'salary_benchmark')
    op.drop_column('jobs', 'recruiter_info')
    op.drop_column('jobs', 'interview_prep_material')
    op.drop_column('jobs', 'contact_persons')
    op.drop_column('jobs', 'company_domain')

    # Drop job_status_history table
    op.drop_index(op.f('ix_job_status_history_job_id'), table_name='job_status_history')
    op.drop_index(op.f('ix_job_status_history_id'), table_name='job_status_history')
    op.drop_table('job_status_history')

    # Drop company_profiles table
    op.drop_index(op.f('ix_company_profiles_domain'), table_name='company_profiles')
    op.drop_index(op.f('ix_company_profiles_id'), table_name='company_profiles')
    op.drop_table('company_profiles')
