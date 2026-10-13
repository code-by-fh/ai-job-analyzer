"""add archive_reason, kept_by_user, checklist, todos to jobs and last_run to job_platforms

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = "r0s1t2u3v4w5"
down_revision = "q9r0s1t2u3v4"
branch_labels = None
depends_on = None

# Jobs archived before this migration carry no reason and would show up in
# neither inbox tab. A row scoring below its owner's active threshold was
# almost certainly archived automatically; every other archived row was
# discarded by hand.
BACKFILL_ARCHIVE_REASON_SQL = """
UPDATE jobs SET archive_reason = CASE
    WHEN EXISTS (
        SELECT 1 FROM user_settings s
        WHERE s.user_id = jobs.user_id
          AND s.match_threshold > 0
          AND jobs.match_score < s.match_threshold
    ) THEN 'THRESHOLD'
    ELSE 'USER'
END
WHERE is_archived = true
"""


def upgrade():
    op.add_column("jobs", sa.Column("archive_reason", sa.String(), nullable=True))
    op.add_column(
        "jobs",
        sa.Column("kept_by_user", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("jobs", sa.Column("checklist", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("todos", sa.JSON(), nullable=True))
    op.add_column("job_platforms", sa.Column("last_run", sa.JSON(), nullable=True))
    op.execute(BACKFILL_ARCHIVE_REASON_SQL)


def downgrade():
    op.drop_column("job_platforms", "last_run")
    op.drop_column("jobs", "todos")
    op.drop_column("jobs", "checklist")
    op.drop_column("jobs", "kept_by_user")
    op.drop_column("jobs", "archive_reason")
