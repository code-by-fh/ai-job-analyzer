import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.core import Base, User, ProfileDocument
from core.auth import get_current_user, get_db

# Create testing engine and session using StaticPool to share connection
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Override dependencies
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Mock user for testing
test_user = User(id=202, username="docsuser", is_admin=False, token_version=0)

def override_get_current_user():
    return test_user

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    db = TestingSessionLocal()
    # Add test user
    db.merge(test_user)
    db.commit()
    
    # Register overrides
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    yield
    
    # Cleanup overrides
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    
    db.close()
    Base.metadata.drop_all(engine)


def test_get_templates():
    response = client.get("/profile/templates")
    assert response.status_code == 200
    assert isinstance(response.json(), dict)


def test_list_profile_documents_empty():
    response = client.get("/profile/documents")
    assert response.status_code == 200
    assert response.json() == []


def test_upload_profile_document():
    files = {"file": ("my_reference.pdf", b"%PDF-1.4 file content", "application/pdf")}
    data = {"doc_type": "REFERENCE", "label": "Work Reference"}
    response = client.post("/profile/documents", data=data, files=files)
    assert response.status_code == 200
    res = response.json()
    assert res["doc_type"] == "REFERENCE"
    assert res["label"] == "Work Reference"
    assert res["original_filename"] == "my_reference.pdf"
    assert res["file_size"] > 0


def test_upload_profile_document_invalid_type():
    files = {"file": ("my_reference.pdf", b"%PDF-1.4 file content", "application/pdf")}
    data = {"doc_type": "INVALID_TYPE", "label": "Work Reference"}
    response = client.post("/profile/documents", data=data, files=files)
    assert response.status_code == 400
    assert "Invalid doc_type" in response.json()["detail"]


def test_download_and_view_document():
    # Setup: insert a document
    db = TestingSessionLocal()
    doc = ProfileDocument(
        id=55,
        user_id=202,
        doc_type="CERTIFICATE",
        label="Certificate",
        filename="db://cert.pdf",
        original_filename="cert.pdf",
        file_size=20,
        mime_type="application/pdf",
        content=b"test certificate pdf",
    )
    db.add(doc)
    db.commit()
    db.close()

    # Test Download (attachment)
    response_dl = client.get("/profile/documents/55/download")
    assert response_dl.status_code == 200
    assert response_dl.content == b"test certificate pdf"
    assert "attachment" in response_dl.headers["Content-Disposition"]
    assert 'filename="cert.pdf"' in response_dl.headers["Content-Disposition"]

    # Test View (inline)
    response_view = client.get("/profile/documents/55/view")
    assert response_view.status_code == 200
    assert response_view.content == b"test certificate pdf"
    assert "inline" in response_view.headers["Content-Disposition"]
    assert 'filename="cert.pdf"' in response_view.headers["Content-Disposition"]


def test_delete_profile_document():
    # Setup: insert a document
    db = TestingSessionLocal()
    doc = ProfileDocument(
        id=55,
        user_id=202,
        doc_type="CERTIFICATE",
        label="Certificate",
        filename="db://cert.pdf",
        original_filename="cert.pdf",
        file_size=20,
        mime_type="application/pdf",
        content=b"test certificate pdf",
    )
    db.add(doc)
    db.commit()
    db.close()

    # Test Delete
    response = client.delete("/profile/documents/55")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}

    # Check database to see if deleted
    db = TestingSessionLocal()
    deleted_doc = db.query(ProfileDocument).filter(ProfileDocument.id == 55).first()
    assert deleted_doc is None
    db.close()
