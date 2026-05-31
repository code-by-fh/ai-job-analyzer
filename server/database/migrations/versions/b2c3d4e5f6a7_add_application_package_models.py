"""add application package models

Revision ID: b2c3d4e5f6a7
Revises: i1a2b3c4d5e6
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "i1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "job_documents",
        sa.Column("kind", sa.String(), nullable=False, server_default="UPLOADED"),
    )
    op.add_column("user_settings", sa.Column("cv_template", sa.String(), nullable=True))
    op.add_column(
        "user_settings", sa.Column("cover_letter_template", sa.String(), nullable=True)
    )
    op.add_column(
        "system_settings", sa.Column("ollama_model", sa.String(), nullable=True)
    )
    op.create_table(
        "profile_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_profile_documents_user_id", "profile_documents", ["user_id"]
    )


def downgrade():
    op.drop_index("ix_profile_documents_user_id", table_name="profile_documents")
    op.drop_table("profile_documents")
    op.drop_column("system_settings", "ollama_model")
    op.drop_column("user_settings", "cover_letter_template")
    op.drop_column("user_settings", "cv_template")
    op.drop_column("job_documents", "kind")
