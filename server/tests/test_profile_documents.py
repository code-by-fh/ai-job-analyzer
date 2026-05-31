from database.core import ProfileDocument, JobDocument, UserProfile, SystemSettings


def test_profile_document_persists(db_session):
    doc = ProfileDocument(
        user_id=1,
        doc_type="CERTIFICATE",
        label="AWS Solutions Architect",
        filename="db://cert.pdf",
        original_filename="cert.pdf",
        file_size=1234,
        mime_type="application/pdf",
        content=b"%PDF-1.4 fake",
    )
    db_session.add(doc)
    db_session.commit()
    loaded = db_session.query(ProfileDocument).first()
    assert loaded.doc_type == "CERTIFICATE"
    assert loaded.label == "AWS Solutions Architect"
    assert loaded.content == b"%PDF-1.4 fake"


def test_jobdocument_kind_defaults_to_uploaded(db_session):
    doc = JobDocument(
        job_id="job-1", user_id=1, filename="db://x", original_filename="x"
    )
    db_session.add(doc)
    db_session.commit()
    assert db_session.query(JobDocument).first().kind == "UPLOADED"


def test_profile_template_defaults(db_session):
    p = UserProfile(user_id=1)
    db_session.add(p)
    db_session.commit()
    loaded = db_session.query(UserProfile).first()
    assert loaded.cv_template == "classic"
    assert loaded.cover_letter_template == "classic"
