import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from core.uploads import check_size, content_disposition, matches_type, read_upload, read_upload_sync

LIMIT = 10

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 8
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 8
WEBP = b"RIFF\x10\0\0\0WEBPVP8 "
DOC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 8
DOCX = b"PK\x03\x04" + b"\0" * 8
HTML = b"<html><script>alert(1)</script></html>"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@pytest.mark.parametrize("content,mime", [
    (b"%PDF-1.4", "application/pdf"), (PNG, "image/png"), (JPEG, "image/jpeg"),
    (WEBP, "image/webp"), (DOC, "application/msword"), (DOCX, DOCX_TYPE),
])
def test_matching_signatures_pass(content, mime):
    assert matches_type(content, mime)


@pytest.mark.parametrize("content,mime", [
    (HTML, "image/png"), (HTML, "application/pdf"), (PNG, "application/pdf"),
    (b"RIFF\x10\0\0\0WAVEfmt ", "image/webp"), (b"%PDF-1.4", "text/html"), (b"", "application/pdf"),
])
def test_mismatching_or_unknown_types_fail(content, mime):
    assert not matches_type(content, mime)


def test_check_size_refuses_one_byte_over_with_a_fixed_code():
    with pytest.raises(HTTPException) as refused:
        check_size(b"x" * 11, 10)
    assert (refused.value.status_code, refused.value.detail) == (413, "file_too_large")


def test_content_disposition_survives_quotes_and_non_latin_names():
    header = content_disposition("attachment", 'Zeugnis "Łódź".pdf')
    header.encode("latin-1")  # Starlette encodes headers as Latin-1; this must not raise
    assert header == (
        "attachment; filename=\"Zeugnis ___d__.pdf\"; "
        "filename*=UTF-8''Zeugnis%20%22%C5%81%C3%B3d%C5%BA%22.pdf"
    )


def test_content_disposition_falls_back_for_a_name_without_safe_characters():
    assert content_disposition("inline", "ÄÖÜ").startswith('inline; filename="___"')
    assert content_disposition("inline", "  ").startswith('inline; filename="document"')


class RecordingStream(BytesIO):
    """A file stream that remembers every size it was asked to read."""

    def __init__(self, content: bytes):
        super().__init__(content)
        self.reads = []

    def read(self, size=-1):
        self.reads.append(size)
        return super().read(size)


def test_read_upload_reads_once_and_at_most_one_byte_past_the_limit():
    stream = RecordingStream(b"x" * (LIMIT * 3))
    with pytest.raises(HTTPException) as refused:
        asyncio.run(read_upload(UploadFile(file=stream), LIMIT))
    assert (refused.value.status_code, stream.reads) == (413, [LIMIT + 1])


def test_read_upload_sync_reads_once_and_at_most_one_byte_past_the_limit():
    stream = RecordingStream(b"x" * (LIMIT * 3))
    with pytest.raises(HTTPException) as refused:
        read_upload_sync(UploadFile(file=stream), LIMIT)
    assert (refused.value.status_code, stream.reads) == (413, [LIMIT + 1])
