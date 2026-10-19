"""The one error envelope and the handlers that map every failure onto it.

Shape: ``{"error": {"code": "UPPER_SNAKE", "message": "...", "traceId": "...", "fields": [...]}}``.
Messages are fixed texts; no handler ever echoes request input, secrets or exception text.
"""

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("notify.errors")

# Leading request parts FastAPI puts in front of a field location; the client knows where it sent it.
_LOCATION_PREFIXES = {"body", "query", "path"}
_STATUS_CODES = {
    status.HTTP_404_NOT_FOUND: ("NOT_FOUND", "Resource not found"),
    status.HTTP_405_METHOD_NOT_ALLOWED: ("METHOD_NOT_ALLOWED", "Method not allowed"),
}


@dataclass(frozen=True)
class FieldIssue:
    """One invalid field: its dotted path and a fixed message."""

    field: str
    message: str


class ApiError(Exception):
    """A client-facing failure with a status, a fixed code and a fixed message."""

    def __init__(self, status_code: int, code: str, message: str, headers: Optional[Dict[str, str]] = None) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


class FieldValidationError(Exception):
    """Per-field refusals found after pydantic (field schemas of a channel type, DNS checks)."""

    def __init__(self, issues: Sequence[FieldIssue]) -> None:
        super().__init__("field validation failed")
        self.issues = list(issues)


def not_found() -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Resource not found")


def envelope(code: str, message: str, fields: Optional[List[FieldIssue]] = None, trace_id: Optional[str] = None) -> Dict[str, Any]:
    """The error body; a fresh traceId lets a logged 500 be matched to what the client saw."""
    error: Dict[str, Any] = {"code": code, "message": message, "traceId": trace_id or uuid.uuid4().hex}
    if fields is not None:
        error["fields"] = [{"field": issue.field, "message": issue.message} for issue in fields]
    return {"error": error}


def error_response(status_code: int, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> JSONResponse:
    return JSONResponse(body, status_code=status_code, headers=headers)


def _field_path(location: Sequence[Any]) -> str:
    parts = list(location)
    if parts and parts[0] in _LOCATION_PREFIXES:
        parts = parts[1:]
    return ".".join(str(part) for part in parts) or "request"


def _validation_issues(error: RequestValidationError) -> List[FieldIssue]:
    """Location and pydantic's fixed message only; the offending input is dropped, it may be a secret."""
    return [FieldIssue(_field_path(item["loc"]), item["msg"]) for item in error.errors()]


def validation_response(issues: List[FieldIssue]) -> JSONResponse:
    return error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, envelope("VALIDATION_ERROR", "Request validation failed", issues))


async def _on_api_error(_request: Request, error: ApiError) -> JSONResponse:
    return error_response(error.status_code, envelope(error.code, error.message), error.headers)


async def _on_field_error(_request: Request, error: FieldValidationError) -> JSONResponse:
    return validation_response(error.issues)


async def _on_request_validation(_request: Request, error: RequestValidationError) -> JSONResponse:
    return validation_response(_validation_issues(error))


async def _on_http_error(_request: Request, error: StarletteHTTPException) -> JSONResponse:
    code, message = _STATUS_CODES.get(error.status_code, ("HTTP_ERROR", "Request failed"))
    return error_response(error.status_code, envelope(code, message))


async def _on_unexpected(_request: Request, error: Exception) -> JSONResponse:
    trace_id = uuid.uuid4().hex
    logger.error("Unexpected error (traceId %s)", trace_id, exc_info=error)
    body = envelope("INTERNAL_ERROR", "Internal server error", trace_id=trace_id)
    return error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, body)


def install_error_handlers(app: FastAPI) -> None:
    """Route every failure through the envelope."""
    app.add_exception_handler(ApiError, _on_api_error)
    app.add_exception_handler(FieldValidationError, _on_field_error)
    app.add_exception_handler(RequestValidationError, _on_request_validation)
    app.add_exception_handler(StarletteHTTPException, _on_http_error)
    app.add_exception_handler(Exception, _on_unexpected)
