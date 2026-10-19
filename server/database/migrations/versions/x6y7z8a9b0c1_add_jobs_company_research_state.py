"""add company research run state to jobs, drop company domains guessed from posting URLs

Until this revision a new job got the host of its posting URL as company domain (google.com for a
Google redirect link, the board host for an unknown board). Such a guess is cleared, so the user
enters the domain or lets the AI identify it; a guess that was researched (a profile exists) stays.
The data step cannot tell a guess from a domain the user confirmed or typed that happens to equal the
posting host: such a domain is cleared too unless its research succeeded (a profile exists).

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-10-15
"""
from typing import Optional
from urllib.parse import urlparse

from alembic import op
import sqlalchemy as sa

revision = "x6y7z8a9b0c1"
down_revision = "w5x6y7z8a9b0"
branch_labels = None
depends_on = None

WWW_PREFIX = "www."


def _posting_host(url: Optional[str]) -> Optional[str]:
    """The host the old code stored as company domain (lowercase, without www., punycode)."""
    try:
        host = urlparse(url or "").hostname
        return host.removeprefix(WWW_PREFIX).encode("idna").decode("ascii") if host else None
    except ValueError:
        return None


def clear_guessed_company_domains(connection) -> int:
    """Clear every job domain that equals its posting host and has no researched profile; returns the count."""
    rows = connection.execute(sa.text(
        "SELECT id, url, company_domain FROM jobs WHERE company_domain IS NOT NULL "
        "AND company_domain NOT IN (SELECT domain FROM company_profiles)"
    )).fetchall()
    guessed = [job_id for job_id, url, domain in rows if domain == _posting_host(url)]
    for job_id in guessed:
        connection.execute(sa.text("UPDATE jobs SET company_domain = NULL WHERE id = :id"), {"id": job_id})
    return len(guessed)


def upgrade():
    op.add_column("jobs", sa.Column("company_research_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("jobs", sa.Column("company_research_error", sa.String(), nullable=True))
    clear_guessed_company_domains(op.get_bind())


def downgrade():
    op.drop_column("jobs", "company_research_error")
    op.drop_column("jobs", "company_research_started_at")
