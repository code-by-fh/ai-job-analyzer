"""remove Google Drive storage (feedback 2 T9)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-10-16

Files are stored in the database only. Document rows whose file lives only in the user's Google
Drive are deleted (the files themselves stay in Drive); the Drive connection columns are dropped.
"""
from alembic import op
import sqlalchemy as sa

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None

DOCUMENT_TABLES = ("job_documents", "profile_documents")
# No table references either document table, so the rows go without touching other tables.
DELETE_DRIVE_ONLY_SQL = "DELETE FROM {table} WHERE filename LIKE 'gdrive://%' AND content IS NULL"


def drive_only_document_deletes() -> list:
    """One DELETE per document table for the rows without stored bytes whose file is in Drive."""
    return [sa.text(DELETE_DRIVE_ONLY_SQL.format(table=table)) for table in DOCUMENT_TABLES]


def upgrade():
    # op.execute, not the bind: the statements also render in offline (--sql) mode.
    for statement in drive_only_document_deletes():
        op.execute(statement)
    op.drop_column("user_settings", "google_drive_email")
    op.drop_column("user_settings", "google_drive_refresh_token")
    op.drop_column("user_settings", "active_storage_service")


def downgrade():
    # The columns come back empty; the deleted document rows and the Drive connections do not.
    op.add_column("user_settings", sa.Column("active_storage_service", sa.String(), nullable=True, server_default="NONE"))
    op.add_column("user_settings", sa.Column("google_drive_refresh_token", sa.String(), nullable=True))
    op.add_column("user_settings", sa.Column("google_drive_email", sa.String(), nullable=True))
