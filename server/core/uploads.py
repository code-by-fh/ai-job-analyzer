"""Bounded reading, content type checks and download headers for user uploads.

Used by the profile documents (routers/profile_documents.py), the job documents (routers/jobs.py) and the CV import
(routers/settings.py).
Every refusal is a fixed code: the client's file name and declared type are never echoed.
"""

import re
from urllib.parse import quote

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
FILE_TOO_LARGE = "file_too_large"
UNSUPPORTED_TYPE = "unsupported_type"
PDF_TYPE = "application/pdf"
WEBP_TYPE = "image/webp"
_WEBP_CONTAINER, _WEBP_FORMAT = b"RIFF", b"WEBP"
_WEBP_FORMAT_OFFSET = 8
_SIGNATURES = {
    PDF_TYPE: b"%PDF-",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
    "application/msword": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
}
_UNSAFE_NAME_CHARACTER = re.compile(r"[^A-Za-z0-9._ -]")
FALLBACK_FILENAME = "document"


def check_size(content: bytes, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """The content unchanged, or 413 `file_too_large` when it exceeds `max_bytes`."""
    if len(content) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=FILE_TOO_LARGE)
    return content


async def read_upload(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Reads at most one byte past the limit, so an oversized upload is never held in memory in full."""
    return check_size(await file.read(max_bytes + 1), max_bytes)


def read_upload_sync(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """The same for sync endpoints, which FastAPI runs in its threadpool."""
    return check_size(file.file.read(max_bytes + 1), max_bytes)


def matches_type(content: bytes, mime_type: str) -> bool:
    """True when the bytes start like the declared type; the client's Content-Type alone is not trusted."""
    if mime_type == WEBP_TYPE:
        end = _WEBP_FORMAT_OFFSET + len(_WEBP_FORMAT)
        return content.startswith(_WEBP_CONTAINER) and content[_WEBP_FORMAT_OFFSET:end] == _WEBP_FORMAT
    signature = _SIGNATURES.get(mime_type)
    return signature is not None and content.startswith(signature)


def require_type(content: bytes, mime_type: str) -> None:
    """Raises 415 `unsupported_type` when the bytes do not match the declared type."""
    if not matches_type(content, mime_type):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_TYPE)


def content_disposition(disposition: str, filename: str) -> str:
    """ASCII fallback plus RFC 5987 filename*: quotes cannot break the header, and a name outside
    Latin-1 cannot make Starlette's header encoding raise."""
    fallback = _UNSAFE_NAME_CHARACTER.sub("_", filename).strip() or FALLBACK_FILENAME
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


def field_error(field: str, code: str) -> dict:
    """One 422 item shaped like pydantic's, so the web maps it onto its form field."""
    return {"type": "value_error", "loc": ["body", field], "msg": code}
