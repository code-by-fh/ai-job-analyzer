from database.core import JobDocument
from services.job_documents import store_generated_document


def test_store_generated_document_db_blob(db_session):
    doc = store_generated_document(
        db=db_session,
        job_id="job-1",
        user_id=7,
        content=b"%PDF-1.4 cv",
        original_filename="Lebenslauf.pdf",
        mime_type="application/pdf",
        kind="GENERATED_CV",
        storage=None,
    )
    assert doc.filename.startswith("db://")
    assert doc.kind == "GENERATED_CV"
    assert db_session.query(JobDocument).count() == 1


def test_store_generated_document_replaces_same_kind(db_session):
    for marker in (b"v1", b"v2"):
        store_generated_document(
            db=db_session, job_id="job-1", user_id=7, content=marker,
            original_filename="Lebenslauf.pdf", mime_type="application/pdf",
            kind="GENERATED_CV", storage=None,
        )
    docs = db_session.query(JobDocument).filter(JobDocument.kind == "GENERATED_CV").all()
    assert len(docs) == 1
    assert docs[0].content == b"v2"
