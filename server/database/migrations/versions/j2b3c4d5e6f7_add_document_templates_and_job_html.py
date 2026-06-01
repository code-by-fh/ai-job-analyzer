"""add document templates table and job html columns

Revision ID: j2b3c4d5e6f7
Revises: cv_draft_20260601
Create Date: 2026-06-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'j2b3c4d5e6f7'
down_revision = 'cv_draft_20260601'
branch_labels = None
depends_on = None

_CV_CLASSIC_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  :root { --accent: #111111; --font-base: "DejaVu Sans", Helvetica, Arial, sans-serif; --font-size: 10.5pt; }
  @page { size: A4; margin: 2cm; }
  body { font-family: var(--font-base); font-size: var(--font-size); color: #222; }
  h1 { font-size: 20pt; margin: 0 0 2pt 0; color: var(--accent); }
  .role { font-size: 12pt; color: #555; margin-bottom: 12pt; }
  h2 { font-size: 12pt; color: var(--accent); border-bottom: 1px solid #ccc; padding-bottom: 2pt; margin-top: 16pt; }
  .item { margin-bottom: 8pt; }
  .item .meta { color: #666; font-size: 9.5pt; }
  .summary { margin-bottom: 12pt; }
</style>
</head>
<body>
  <h1 data-slot="name">Vorname Nachname</h1>
  <div class="role" data-slot="role">Rolle</div>
  <div class="summary" data-slot="summary">Kurzprofil</div>
  <section data-block="skills" data-block-label="Skills">
    <h2>Skills</h2>
    <div data-slot="skills">Python, Docker</div>
  </section>
  <section data-block="experience" data-block-label="Berufserfahrung">
    <h2>Berufserfahrung</h2>
    <div data-repeat="experience">
      <div class="item">
        <strong data-slot="role"></strong> &#8212; <span data-slot="company"></span>
        <div class="meta" data-slot="duration"></div>
        <div data-slot="description"></div>
      </div>
    </div>
  </section>
  <section data-block="projects" data-block-label="Projekte">
    <h2>Projekte</h2>
    <div data-repeat="projects">
      <div class="item">
        <strong data-slot="name"></strong>
        <div class="meta" data-slot="tech_stack"></div>
        <div data-slot="description"></div>
      </div>
    </div>
  </section>
  <section data-block="education" data-block-label="Ausbildung">
    <h2>Ausbildung</h2>
    <div data-slot="education">Ausbildung</div>
  </section>
</body>
</html>"""

_LETTER_CLASSIC_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  :root { --accent: #111111; --font-base: "DejaVu Sans", Helvetica, Arial, sans-serif; --font-size: 10.5pt; }
  @page { size: A4; margin: 2cm; }
  body { font-family: var(--font-base); font-size: var(--font-size); color: #222; line-height: 1.6; }
  .sender { margin-bottom: 24pt; font-weight: bold; }
  .company { margin-bottom: 16pt; }
  .body { white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="sender" data-slot="sender_name">Absender</div>
  <div class="company" data-slot="company">Unternehmen</div>
  <div class="body" data-slot="body">Anschreiben-Text</div>
</body>
</html>"""


def upgrade():
    op.create_table(
        "document_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_templates_id", "document_templates", ["id"])

    op.add_column("jobs", sa.Column("cv_html", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("cover_letter_html", sa.Text(), nullable=True))

    # Seed built-in global templates
    op.execute(
        sa.text(
            "INSERT INTO document_templates (is_admin, doc_type, name, html) "
            "VALUES (true, 'CV', 'Classic', :html)"
        ).bindparams(html=_CV_CLASSIC_HTML)
    )
    op.execute(
        sa.text(
            "INSERT INTO document_templates (is_admin, doc_type, name, html) "
            "VALUES (true, 'COVER_LETTER', 'Classic', :html)"
        ).bindparams(html=_LETTER_CLASSIC_HTML)
    )


def downgrade():
    op.drop_column("jobs", "cover_letter_html")
    op.drop_column("jobs", "cv_html")
    op.drop_index("ix_document_templates_id", table_name="document_templates")
    op.drop_table("document_templates")
