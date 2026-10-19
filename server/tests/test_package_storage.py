from database.core import JobDocument
from services.job_documents import delete_generated_pdf, generated_pdf_name

JOB_ID = "job-1"
USER_ID = 7


def _document(doc_id, kind, job_id=JOB_ID) -> JobDocument:
    return JobDocument(
        id=doc_id, job_id=job_id, user_id=USER_ID, filename="db://x.pdf", original_filename="x.pdf",
        mime_type="application/pdf", content=b"%PDF", kind=kind,
    )


def test_generated_pdf_name_keeps_the_stored_file_name_pattern():
    assert generated_pdf_name("cv", "ACME GmbH & Co. KG") == "Lebenslauf_ACME_GmbH__Co_KG.pdf"
    assert generated_pdf_name("cover_letter", None) == "Anschreiben_Job.pdf"


def test_generated_pdf_name_falls_back_when_nothing_of_the_company_is_kept():
    assert generated_pdf_name("cv", "&&&") == "Lebenslauf_Job.pdf"


def test_delete_generated_pdf_removes_only_that_kind_of_that_job(db_session):
    db_session.add_all([
        _document(1, "GENERATED_CV"), _document(2, "GENERATED_LETTER"),
        _document(3, "UPLOADED"), _document(4, "GENERATED_CV", job_id="job-2"),
    ])
    db_session.commit()
    delete_generated_pdf(db_session, JOB_ID, "cv")
    db_session.commit()
    remaining = sorted(doc.id for doc in db_session.query(JobDocument).all())
    assert remaining == [2, 3, 4]
