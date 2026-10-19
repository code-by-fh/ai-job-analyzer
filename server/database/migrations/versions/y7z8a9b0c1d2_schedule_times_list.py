"""replace the single schedule time of a platform by a list of daily times

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-10-15
"""
import json

from alembic import op
import sqlalchemy as sa

revision = "y7z8a9b0c1d2"
down_revision = "x6y7z8a9b0c1"
branch_labels = None
depends_on = None


def backfill_schedule_times(connection) -> int:
    """Turn every stored single time into a one-element list; returns the count."""
    rows = connection.execute(sa.text("SELECT id, schedule_time FROM job_platforms WHERE schedule_time IS NOT NULL")).fetchall()
    for platform_id, time in rows:
        connection.execute(
            sa.text("UPDATE job_platforms SET schedule_times = :times WHERE id = :id"),
            {"times": json.dumps([time]), "id": platform_id},
        )
    return len(rows)


def upgrade():
    op.add_column("job_platforms", sa.Column("schedule_times", sa.JSON(), nullable=True))
    backfill_schedule_times(op.get_bind())
    op.drop_column("job_platforms", "schedule_time")


def restore_schedule_time(connection) -> None:
    """Put the first daily time back into the single column; null, empty or non-list values stay NULL."""
    rows = connection.execute(sa.text("SELECT id, schedule_times FROM job_platforms WHERE schedule_times IS NOT NULL")).fetchall()
    for platform_id, times in rows:
        if isinstance(times, str):
            times = json.loads(times)
        if isinstance(times, list) and times:
            connection.execute(
                sa.text("UPDATE job_platforms SET schedule_time = :time WHERE id = :id"),
                {"time": times[0], "id": platform_id},
            )


def downgrade():
    op.add_column("job_platforms", sa.Column("schedule_time", sa.String(), nullable=True))
    restore_schedule_time(op.get_bind())
    op.drop_column("job_platforms", "schedule_times")
